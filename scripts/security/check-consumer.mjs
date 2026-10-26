import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const lock = JSON.parse(readFileSync(new URL('package-lock.json', import.meta.url)))
const audit = JSON.parse(readFileSync(new URL('audit.json', import.meta.url)))
const manifest = JSON.parse(readFileSync(new URL('package.json', import.meta.url)))
assert.equal(audit.metadata.vulnerabilities.total, 0)
assert.equal(manifest.overrides, undefined)
assert.equal(manifest.devDependencies, undefined)
for (const name of ['wdio-types', 'wdio-logger', 'wdio-protocols', 'wdio-repl', 'wdio-utils', 'wdio-config', 'webdriver', 'webdriverio']) {
    const key = `node_modules/@testplane/${name}`
    assert.match(lock.packages[key].resolved, /^file:.*\.tgz$/)
    assert.ok(!Object.keys(lock.packages).some(p => p !== key && p.endsWith(key)), `Nested old ${name}`)
    const pkg = JSON.parse(readFileSync(new URL(`${key}/package.json`, import.meta.url)))
    assert.ok(!Object.values(pkg.dependencies || {}).some(v => v.startsWith('workspace:')))
}
for (const name of ['undici', 'extract-zip']) {
    assert.ok(!Object.keys(lock.packages).some(p => p.endsWith(`node_modules/${name}`)), `Unexpected ${name}`)
}
for (const specifier of ['@testplane/webdriverio', '@testplane/webdriver', '@testplane/wdio-utils', '@testplane/wdio-utils/node']) {
    const esm = await import(specifier)
    const cjs = require(specifier)
    assert.ok(esm && cjs)
    for (const method of specifier === '@testplane/webdriverio' ? ['remote', 'attach', 'multiremote'] :
        specifier === '@testplane/wdio-utils/node' ? ['startWebDriver', 'setupBrowser', 'setupDriver'] : []) {
        assert.equal(typeof esm[method], 'function')
        assert.equal(typeof cjs[method], 'function')
    }
}
console.log(`PASS ${process.version}: clean packed tree, audit 0, CJS/ESM public entries`)
