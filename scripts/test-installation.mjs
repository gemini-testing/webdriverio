import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const directory = mkdtempSync(path.join(tmpdir(), 'wdio-consumer-'))
const registry = process.env.npm_config_registry || 'https://registry.npmjs.org'
const { packages } = JSON.parse(readFileSync(path.join(root, 'lerna.json'), 'utf8'))
const dependencies = {}

try {
    for (const location of packages) {
        const cwd = path.join(root, location)
        const { name, version } = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8'))
        assert.ok(name.startsWith('@testplane/'), `Unexpected release package: ${name}`)
        execFileSync('pnpm', ['pack', '--pack-destination', directory], { cwd, stdio: 'inherit' })
        const filename = `${name.replace('@', '').replace('/', '-')}-${version}.tgz`
        dependencies[name] = `file:${path.join(directory, filename)}`
    }
    assert.equal(readdirSync(directory).length, packages.length)
    writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'wdio-installation-test', private: true, dependencies }))
    execFileSync('npm', ['install', '--registry', registry, '--no-audit', '--no-fund'], { cwd: directory, stdio: 'inherit' })
    execFileSync('npm', ['ls', '--omit=dev', '--all'], { cwd: directory, stdio: 'inherit' })
    execFileSync(process.execPath, ['--test', path.join(root, 'tests/installation.test.js')], {
        cwd: directory, stdio: 'inherit', env: { ...process.env, WDIO_CONSUMER_DIR: directory }
    })
    execFileSync('npm', ['audit', '--omit=dev', '--registry', registry], { cwd: directory, stdio: 'inherit' })
} finally {
    rmSync(directory, { recursive: true, force: true })
}
