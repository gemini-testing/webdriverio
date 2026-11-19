import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { artifacts, pack } from './release-packages.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const directory = mkdtempSync(path.join(tmpdir(), 'wdio-consumer-'))
const registry = (process.env.npm_config_registry || 'https://registry.npmjs.org').replace(/\/$/, '')

async function run(cwd, cmd, args) {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, WDIO_CONSUMER_DIR: cwd } })
    const [status] = await once(child, 'exit')
    assert.equal(status, 0, `${cmd} ${args.join(' ')} failed`)
}

// Serve just the release candidates so npm can resolve their *unchanged* transitive
// dependency specs before publication. Unrelated packages still come from the registry.
function candidateRegistry(packages) {
    const server = createServer((req, res) => {
        const name = decodeURIComponent(req.url.slice(1))
        if (req.method !== 'GET') {
            return res.writeHead(405).end()
        }
        const tar = packages.find(pkg => name === `-/${path.basename(pkg.filename)}`)
        if (tar) {
            return res.writeHead(200).end(readFileSync(tar.filename))
        }
        const pkg = packages.find(pkg => pkg.name === name)
        if (pkg) {
            const dist = { integrity: pkg.integrity, tarball: `http://127.0.0.1:${server.address().port}/-/${path.basename(pkg.filename)}` }
            return res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({
                name, 'dist-tags': { latest: pkg.version }, versions: { [pkg.version]: { ...pkg.manifest, dist } }
            }))
        }
        if (/^@testplane\/[\w-]+$/.test(name)) {
            return res.writeHead(302, { Location: `${registry}/${encodeURIComponent(name)}` }).end()
        }
        res.writeHead(404).end()
    })
    return server
}

let server
try {
    const tarballs = process.argv[2] ? path.resolve(process.argv[2]) : path.join(directory, 'tarballs')
    if (!process.argv[2]) {
        pack(tarballs)
    }
    const packages = artifacts(tarballs)
    server = candidateRegistry(packages)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')

    for (const single of [true, false]) {
        const cwd = path.join(directory, single ? 'webdriverio-only' : 'all-packages')
        mkdirSync(cwd)
        const direct = single ? packages.filter(pkg => pkg.name === '@testplane/webdriverio') : packages
        const dependencies = Object.fromEntries(direct.map(pkg => [pkg.name, pkg.version]))
        writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'wdio-installation-test', private: true, dependencies }))
        writeFileSync(path.join(cwd, '.npmrc'), `@testplane:registry=http://127.0.0.1:${server.address().port}/\n`)
        await run(cwd, 'npm', ['install', '--omit=dev', '--registry', registry, '--no-audit', '--no-fund'])
        await run(cwd, 'npm', ['ls', '--omit=dev', '--all'])

        const lock = JSON.parse(readFileSync(path.join(cwd, 'package-lock.json'), 'utf8'))
        const seen = new Set()
        for (const [location, installed] of Object.entries(lock.packages)) {
            const pkg = packages.find(pkg => pkg.name === location.split('node_modules/').at(-1))
            if (pkg) {
                assert.equal(installed.integrity, pkg.integrity, `Did not install the verified tarball for ${pkg.name}`)
                seen.add(pkg.name)
            }
        }
        const expected = packages.filter(pkg => !single || pkg.name !== '@testplane/devtools')
        assert.deepEqual(seen, new Set(expected.map(pkg => pkg.name)), `Unexpected package set in ${cwd}`)
        console.log(`Verified ${seen.size} release tarball integrities in ${path.basename(cwd)}`)
        await (single
            ? run(cwd, process.execPath, ['--test', path.join(root, 'tests/installation.test.js')])
            : run(cwd, 'npm', ['audit', '--omit=dev', '--registry', registry]))
    }
} finally {
    server?.close()
    rmSync(directory, { recursive: true, force: true })
}
