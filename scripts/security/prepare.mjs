import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const source = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(source, '../..')
const baseline = process.argv.includes('--baseline')
const output = mkdtempSync(path.join(tmpdir(), baseline ? 'wdio-security-before-' : 'wdio-security-after-'))
const consumer = path.join(output, 'consumer')
const tarballs = path.join(output, 'tarballs')
mkdirSync(consumer)
mkdirSync(tarballs)
console.log(`Evidence directory: ${output}`)

function run(command, args, cwd, log, allowedStatuses = [0]) {
    const result = spawnSync(command, args, {
        cwd, encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024,
        shell: process.platform === 'win32',
        env: { ...process.env, HUSKY: '0', npm_config_cache: path.join(output, 'npm-cache') }
    })
    writeFileSync(path.join(output, log), `${result.stdout || ''}${result.stderr || ''}`)
    assert.ifError(result.error)
    assert.ok(allowedStatuses.includes(result.status), `${command} failed (${result.status}); see ${path.join(output, log)}`)
    return result.stdout
}

const packages = ['wdio-types', 'wdio-logger', 'wdio-protocols', 'wdio-repl', 'wdio-utils', 'wdio-config', 'webdriver', 'webdriverio']
writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({
    name: 'testplane-security-consumer', version: '1.0.0', private: true, type: 'module'
}, null, 2) + '\n')

let dependencies
if (baseline) {
    // Historical versions are deliberately isolated from the repository and the fixed consumer.
    dependencies = ['@testplane/webdriverio@9.6.2', '@testplane/wdio-utils@9.5.5', '@testplane/wdio-protocols@9.4.7']
} else {
    run('pnpm', ['run', 'compile:all:core'], root, 'build-core.log')
    run('pnpm', ['exec', 'tsx', 'infra/compiler/src/index.ts',
        '-p', '@testplane/wdio-utils', '-p', '@testplane/wdio-config',
        '-p', '@testplane/webdriver', '-p', '@testplane/webdriverio'], root, 'build-runtime.log')
    for (const name of packages) {
        run('pnpm', ['pack', '--pack-destination', tarballs], path.join(root, 'packages', name), `pack-${name}.log`)
    }
    dependencies = readdirSync(tarballs).filter(name => name.endsWith('.tgz')).map(name => path.join(tarballs, name))
    assert.equal(dependencies.length, packages.length)
}
run('npm', ['install', '--ignore-scripts', '--no-fund', '--registry=https://registry.npmjs.org', ...dependencies], consumer, 'install.log')
// Audit's nonzero vulnerability status is expected for the historical consumer, not for the fixed one.
const audit = run('npm', ['audit', '--omit=dev', '--json', '--registry=https://registry.npmjs.org'], consumer, 'audit.log', [0, 1])
writeFileSync(path.join(consumer, 'audit.json'), audit)
const total = JSON.parse(audit).metadata.vulnerabilities.total
assert.ok(baseline ? total > 0 : total === 0, `Unexpected vulnerability count: ${total}`)
run('npm', ['ls', '--all'], consumer, 'dependency-tree.log')
for (const name of ['check-consumer.mjs', 'browser.mjs', 'compare-puppeteer.mjs', 'public-api.ts']) {
    copyFileSync(path.join(source, name), path.join(consumer, name))
}
writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({
    baseline, node: process.version, platform: process.platform, arch: process.arch,
    createdAt: new Date().toISOString(), vulnerabilities: total, consumer,
    revision: run('git', ['rev-parse', 'HEAD'], root, 'revision.log').trim()
}, null, 2) + '\n')
if (!baseline) {
    run(process.execPath, ['check-consumer.mjs'], consumer, 'check-consumer.log')
    writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: true },
        files: ['public-api.ts']
    }, null, 2) + '\n')
    run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], consumer, 'public-types.log')
}
console.log(`Audit: ${total} vulnerabilities. Consumer: ${consumer}`)
console.log(`Next: cd ${JSON.stringify(consumer)} && node browser.mjs`)
