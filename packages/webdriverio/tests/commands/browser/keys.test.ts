import path from 'node:path'
import { expect, describe, it, afterEach, vi } from 'vitest'
import { remote, Key } from '../../../src/index.js'

vi.mock('fetch')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('keys', () => {
    it('should send keys', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })

        await browser.keys('foobar')
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[1][0]!.pathname)
            .toContain('/actions')
        expect(JSON.parse((vi.mocked(fetch).mock.calls[1][1] as any).body).actions)
            .toHaveLength(1)
        expect(JSON.parse((vi.mocked(fetch).mock.calls[1][1] as any).body).actions[0].type)
            .toBe('key')
        expect(JSON.parse((vi.mocked(fetch).mock.calls[1][1] as any).body).actions[0].actions)
            .toHaveLength(('foobar'.length * 2) + 1 /* includes pause call */)
        expect(JSON.parse((vi.mocked(fetch).mock.calls[1][1] as any).body).actions[0].actions[0])
            .toEqual({ type: 'keyDown', value: 'f' })
        expect(JSON.parse((vi.mocked(fetch).mock.calls[1][1] as any).body).actions[0].actions[12])
            .toEqual({ type: 'keyUp', value: 'r' })
    })

    it('should send keys (no w3c)', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar-noW3C'
            }
        })

        await browser.keys('foobar')
        expect((vi.mocked(fetch).mock.calls[1][0] as any).pathname).toContain('/keys')
        expect((vi.mocked(fetch).mock.calls[1][1] as any).json.value).toEqual(['f', 'o', 'o', 'b', 'a', 'r'])

        await browser.keys('Enter')
        expect((vi.mocked(fetch).mock.calls[2][0] as any).pathname).toContain('/keys')
        expect((vi.mocked(fetch).mock.calls[2][1] as any).json.value).toEqual(['\uE007'])
    })

    it('should allow send keys as array', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar-noW3C'
            }
        })

        await browser.keys(['f', 'o', 'Enter', 'b', 'a', 'r'])
        expect((vi.mocked(fetch).mock.calls[1][0] as any).pathname).toContain('/keys')
        expect((vi.mocked(fetch).mock.calls[1][1] as any).json.value).toEqual(['f', 'o', '\uE007', 'b', 'a', 'r'])

        await browser.keys('Enter')
        expect((vi.mocked(fetch).mock.calls[2][0] as any).pathname).toContain('/keys')
        expect((vi.mocked(fetch).mock.calls[2][1]as any).json.value).toEqual(['\uE007'])
    })

    it('should throw if invalid character was provided', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })

        // @ts-expect-error wrong param
        await expect(() => browser.keys()).rejects.toThrow()
        // @ts-expect-error wrong param
        await expect(() => browser.keys(1)).rejects.toThrow()
        // @ts-expect-error wrong param
        await expect(() => browser.keys(true)).rejects.toThrow()
    })

    it('transforms control', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        await browser.keys([Key.Ctrl, 'c'])
        expect(JSON.parse((vi.mocked(fetch).mock.calls[1][1] as any).body).actions[0].actions).toEqual([
            { type: 'keyDown', value: expect.any(String) },
            { type: 'keyDown', value: 'c' },
            { type: 'pause', duration: 10 },
            { type: 'keyUp', value: expect.any(String) },
            { type: 'keyUp', value: 'c' }
        ])
    })

    it('should not send a pause for iOS', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'safari',
                platformName: 'iOS',
            }
        })
        await browser.keys(['c'])
        expect(JSON.parse((vi.mocked(fetch).mock.calls[1][1] as any).body).actions[0].actions).toEqual([
            { type: 'keyDown', value: 'c' },
            { type: 'keyUp', value: 'c' }
        ])
    })

    afterEach(() => {
        vi.mocked(fetch).mockClear()
    })
})
