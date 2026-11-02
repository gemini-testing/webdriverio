import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

test('publication requires all package tags to identify the checked-out commit', t => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'wdio-release-'))
    t.after(() => rmSync(cwd, { recursive: true, force: true }))
    const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' })
    const check = () => spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/check-release.mjs', import.meta.url))], { cwd })
    git('init', '-b', 'sp.release-test')
    git('config', 'user.name', 'Release test')
    git('config', 'user.email', 'release-test@example.invalid')
    for (const name of ['a', 'b']) {
        mkdirSync(path.join(cwd, name))
        writeFileSync(path.join(cwd, name, 'package.json'), JSON.stringify({ name: `@testplane/${name}`, version: '1.0.0' }))
    }
    writeFileSync(path.join(cwd, 'lerna.json'), JSON.stringify({ packages: ['a', 'b'] }))
    git('add', '.')
    git('commit', '-m', 'Release')
    git('tag', '@testplane/a@1.0.0')
    git('tag', '@testplane/b@1.0.0')
    const release = check()
    assert.equal(release.status, 0, release.stderr.toString())

    writeFileSync(path.join(cwd, 'next-change.txt'), 'A change merged after the release')
    git('add', '.')
    git('commit', '-m', 'Next change')
    assert.notEqual(check().status, 0, 'new code must not be published under old release versions')
    git('checkout', '--detach', '@testplane/a@1.0.0')
    git('tag', '-d', '@testplane/b@1.0.0')
    assert.notEqual(check().status, 0, 'a missing package tag must prevent publication')
})
