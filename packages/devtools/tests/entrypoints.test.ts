import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

test('loads the CommonJS entrypoint and forwards async commands to ESM', () => {
    const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
    const output = execFileSync(process.execPath, ['-e', `
        const assert = require('node:assert/strict')
        const Devtools = require('./')
        assert.equal(typeof Devtools.newSession, 'function')
        assert.equal(typeof Devtools.attachToSession, 'function')
        assert.equal(typeof Devtools.reloadSession, 'function')
        assert.equal(Devtools.default, Devtools)
        assert(Devtools.SUPPORTED_BROWSER.includes('chrome'))
        assert(!Devtools.SUPPORTED_BROWSER.includes('firefox'))
        assert.rejects(
            Devtools.newSession({ capabilities: { browserName: 'firefox' } }),
            /Firefox.*CDP.*WebDriver BiDi/
        ).then(() => console.log('CJS passed'), error => {
            console.error(error)
            process.exitCode = 1
        })
    `], { cwd: packageDirectory, encoding: 'utf8', timeout: 10_000 })
    expect(output).toContain('CJS passed')
})
