import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import Interception from '../../../src/utils/interception/index.js'

describe('request URL matching', () => {
    it.each([
        ['https://example.test/api', 'https://example.test/api', true],
        ['https://example.test/api', 'https://example.test/other', false],
        ['**/api/*', 'https://example.test/api/users', true],
        ['**/api/**', 'https://example.test/api/users/42', true],
        [/\/api\/\d+$/, 'https://example.test/api/42', true],
        [/\/api\/\d+$/, 'https://example.test/api/users', false]
    ])('matches %s against %s', (pattern, url, expected) => {
        expect(Interception.isMatchingRequest(pattern as string | RegExp, url as string)).toBe(expected)
    })

    it('handles consecutive wildcards from GHSA-3ppc-4f35-3m26 without hanging', () => {
        const moduleUrl = new URL('../../../src/utils/interception/index.ts', import.meta.url).href
        const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
            import Interception from ${JSON.stringify(moduleUrl)};
            const result = Interception.isMatchingRequest('*'.repeat(40) + 'b***', 'a'.repeat(80));
            if (result !== false) process.exit(1);
        `], { timeout: 5000, encoding: 'utf8' })

        expect(result.error).toBeUndefined()
        expect(result.status, result.stderr).toBe(0)
    }, 10000)
})
