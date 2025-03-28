import path from 'node:path'
import { expect, describe, it, vi, beforeAll, afterEach } from 'vitest'
import { remote } from '../../../src/index.js'

vi.mock('fetch')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('getWindowSize', () => {
    let browser: WebdriverIO.Browser

    beforeAll(async () => {
        browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
    })

    it('should get size of W3C browser window', async () => {
        await browser.getWindowSize()
        expect(vi.mocked(fetch).mock.calls[1][1]!.method).toBe('GET')
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[1][0]!.pathname)
            .toBe('/session/foobar-123/window/rect')
    })

    it('should get size of NO-W3C browser window', async () => {
        browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar-noW3C'
            }
        })

        await browser.getWindowSize()
        expect((vi.mocked(fetch) as any).mock.calls[1][1]!.method).toBe('GET')
        expect((vi.mocked(fetch) as any).mock.calls[1][0]!.pathname)
            .toBe('/session/foobar-123/window/current/size')
    })

    afterEach(() => {
        vi.mocked(fetch).mockClear()
    })
})
