import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

test('only a fully tagged release on master may be recovered, without checking it out', t => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'wdio-release-'))
    t.after(() => rmSync(cwd, { recursive: true, force: true }))
    const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
    const check = (...args) => spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/check-release.mjs', import.meta.url)), ...args], { cwd })
    git('init', '-b', 'master')
    git('config', 'user.name', 'Release test')
    git('config', 'user.email', 'release-test@example.invalid')
    for (const name of ['a', 'b']) {
        mkdirSync(path.join(cwd, name))
        writeFileSync(path.join(cwd, name, 'package.json'), JSON.stringify({ name: `@testplane/${name}`, version: '1.0.0' }))
    }
    writeFileSync(path.join(cwd, 'lerna.json'), JSON.stringify({ packages: ['a', 'b'] }))
    git('add', '.')
    git('commit', '-m', 'Publish to npm (latest) from run 42')
    const sha = git('rev-parse', 'HEAD')
    git('tag', '@testplane/a@1.0.0')
    git('tag', '@testplane/b@1.0.0')
    git('update-ref', 'refs/remotes/origin/master', sha)
    assert.equal(check().status, 0)
    assert.notEqual(check(sha, 'next').status, 0, 'must not resume under a different dist-tag')

    writeFileSync(path.join(cwd, 'next-change.txt'), 'A change merged after the release')
    git('add', '.')
    git('commit', '-m', 'Next change')
    git('update-ref', 'refs/remotes/origin/master', git('rev-parse', 'HEAD'))
    assert.notEqual(check().status, 0, 'new code must not be published under old release versions')
    const recovered = check(sha, 'latest')
    assert.equal(recovered.status, 0, recovered.stderr.toString())
    assert.equal(recovered.stdout.toString().trim(), '42')
    git('tag', '-d', '@testplane/b@1.0.0')
    assert.notEqual(check(sha, 'latest').status, 0, 'all tags are required')
    git('switch', '-c', 'unmerged', sha)
    git('commit', '--allow-empty', '-m', 'Publish to npm (latest) from run 42')
    const unrelated = git('rev-parse', 'HEAD')
    git('tag', '-f', '@testplane/a@1.0.0', unrelated)
    git('tag', '@testplane/b@1.0.0', unrelated)
    git('switch', 'master')
    assert.notEqual(check(unrelated, 'latest').status, 0, 'even a fully tagged side branch is not a release')
})

test('fresh releases reject occupied versions; recovery skips only identical bytes', async () => {
    const { selectForPublication } = await import('../scripts/release-packages.mjs')
    const pkg = { name: '@testplane/a', version: '9.4.7', integrity: 'sha512-identical' }
    const published = { versions: { '9.4.7': { dist: { integrity: pkg.integrity } } }, 'dist-tags': { latest: '9.4.7' } }
    assert.throws(() => selectForPublication(pkg, published, 'fresh', 'latest'), /already published/)
    assert.equal(selectForPublication(pkg, published, 'from-package', 'latest'), false)
    assert.throws(() => selectForPublication({ ...pkg, integrity: 'sha512-different' }, published, 'from-package', 'latest'), /integrity/)
    assert.throws(() => selectForPublication(pkg, { ...published, 'dist-tags': { latest: '9.4.6' } }, 'from-package', 'latest'), /dist-tag/)
    const next = { ...pkg, version: '9.4.8' }
    assert.equal(selectForPublication(next, published, 'fresh', 'latest'), true)
    assert.equal(selectForPublication(next, published, 'from-package', 'latest'), true)
    assert.throws(() => selectForPublication({ ...pkg, version: '9.4.6' }, published, 'from-package', 'latest'), /newer/)
})
