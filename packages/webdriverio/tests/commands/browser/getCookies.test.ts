import path from 'node:path'
import { expect, describe, it, vi, afterEach, beforeEach, beforeAll, type MockInstance } from 'vitest'
import { remote } from '../../../src/index.js'
import { getContextManager } from '../../../src/session/context.js'

vi.mock('fetch')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('getCookies', () => {
    let browser: WebdriverIO.Browser

    it('scopes Android Chrome cookie commands to a browsing context, not an Appium context', async () => {
        vi.mocked(fetch).setMockResponse({
            sessionId: 'android',
            capabilities: {
                browserName: 'chrome', platformName: 'Android', setWindowRect: true, webSocketUrl: 'ws://webdriver.io'
            }
        })
        const mobile = await remote({ capabilities: { browserName: 'chrome' } })
        mobile.emit('result', { command: 'getAppiumContext', result: { value: 'CHROMIUM' } })
        vi.spyOn(mobile, 'getWindowHandle').mockResolvedValue('android-tab')
        const set = vi.spyOn(mobile, 'storageSetCookie').mockResolvedValue({ partitionKey: {} })
        const get = vi.spyOn(mobile, 'storageGetCookies').mockResolvedValue({ partitionKey: {}, cookies: [] })
        const remove = vi.spyOn(mobile, 'storageDeleteCookies').mockResolvedValue({ partitionKey: {} })
        const partition = { type: 'context', context: 'android-tab' }

        await mobile.setCookies({ name: 'example', value: 'first', domain: 'example.org' })
        await mobile.getCookies({ name: 'example' })
        await mobile.deleteCookies()
        expect(set).toHaveBeenCalledWith(expect.objectContaining({ partition }))
        expect(get).toHaveBeenCalledWith({ partition, filter: { name: 'example' } })
        expect(remove).toHaveBeenCalledWith({ partition })

        // switchFrame records a real BiDi ID, which is not necessarily the top-level handle.
        getContextManager(mobile).setCurrentContext('android-frame')
        mobile.emit('result', { command: 'getAppiumContext', result: { value: 'CHROMIUM' } })
        await mobile.getCookies()
        expect(get).toHaveBeenLastCalledWith({ partition: { type: 'context', context: 'android-frame' } })

        mobile.emit('command', { command: 'switchAppiumContext', body: { name: 'WEBVIEW_example' } })
        mobile.emit('result', { command: 'switchAppiumContext', body: { name: 'WEBVIEW_example' }, result: { value: null } })
        vi.mocked(mobile.getWindowHandle).mockResolvedValue('webview-tab')
        await mobile.getCookies()
        expect(get).toHaveBeenLastCalledWith({ partition: { type: 'context', context: 'webview-tab' } })
    })

    describe('classic', () => {
        beforeAll(async () => {
            browser = await remote({
                baseUrl: 'http://foobar.com',
                capabilities: {
                    browserName: 'foobar'
                }
            })
        })

        beforeEach(() => {
            vi.mocked(fetch).mockClear()
        })

        it('should return all cookies', async () => {
            const cookies = await browser.getCookies()
            expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('GET')
            // @ts-expect-error mock implementation
            expect(vi.mocked(fetch).mock.calls[0][0]!.pathname)
                .toBe('/session/foobar-123/cookie')
            expect(cookies).toEqual([
                { name: 'cookie1', value: 'dummy-value-1' },
                { name: 'cookie2', value: 'dummy-value-2' },
                { name: 'cookie3', value: 'dummy-value-3' },
            ])
        })

        it('should support passing a string', async () => {
            const cookies = await browser.getCookies('cookie1')

            expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('GET')
            // @ts-expect-error mock implementation
            expect(vi.mocked(fetch).mock.calls[0][0]!.pathname)
                .toBe('/session/foobar-123/cookie')
            expect(cookies).toEqual([{ name: 'cookie1', value: 'dummy-value-1' }])
        })

        it('should support passing a array with strings', async () => {
            const cookies = await browser.getCookies(['cookie1'])

            expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('GET')
            // @ts-expect-error mock implementation
            expect(vi.mocked(fetch).mock.calls[0][0]!.pathname)
                .toBe('/session/foobar-123/cookie')
            expect(cookies).toEqual([{ name: 'cookie1', value: 'dummy-value-1' }])
        })

        it('should get all cookies and filter out cookies that match by name', async () => {
            const cookieNames = ['cookie1', 'doesn-not-exist', 'cookie3']
            const cookies = await browser.getCookies(cookieNames)

            expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('GET')
            // @ts-expect-error mock implementation
            expect(vi.mocked(fetch).mock.calls[0][0]!.pathname)
                .toBe('/session/foobar-123/cookie')
            expect(cookies).toEqual([
                { name: 'cookie1', value: 'dummy-value-1' },
                { name: 'cookie3', value: 'dummy-value-3' },
            ])
        })

        it('should throw error if invalid arguments are passed', async () => {
            // @ts-ignore test invalid input
            const cookies = await browser.getCookies([2])
            expect(cookies).toEqual([])
        })

        afterEach(() => {
            vi.mocked(fetch).mockClear()
        })
    })

    describe('bidi', () => {
        let storageGetCookies: MockInstance

        beforeAll(async () => {
            browser = await remote({
                baseUrl: 'http://foobar.com',
                capabilities: {
                    browserName: 'bidi'
                }
            })

            storageGetCookies =  vi.spyOn(browser, 'storageGetCookies')
            storageGetCookies.mockImplementation((() => ({
                cookies: [{
                    name: 'cookie',
                    value: {
                        type: 'base64',
                        value: btoa('hello world')
                    }
                }]
            }) as any))
        })

        beforeEach(async () => {
            await browser.switchWindow('window-handle-2')
            vi.mocked(fetch).mockClear()
            storageGetCookies.mockClear()
        })

        it('should return all cookies', async () => {
            const cookies = await browser.getCookies()
            expect(storageGetCookies).toBeCalledTimes(1)
            expect(storageGetCookies).toBeCalledWith({
                partition: { type: 'context', context: 'window-handle-2' }
            })
            expect(cookies).toEqual([
                {
                    name: 'cookie',
                    value: 'hello world'
                }
            ])
        })

        it.each([
            ['cookie', { name: 'cookie' }],
            [['cookie'], { name: 'cookie' }],
            [{ domain: 'foobar.com' }, { domain: 'foobar.com' }],
        ])('should scope the filter %j to the current context', async (filter, expectedFilter) => {
            await browser.getCookies(filter)
            expect(storageGetCookies).toBeCalledWith({
                filter: expectedFilter,
                partition: { type: 'context', context: 'window-handle-2' }
            })
        })

        it('should use the new partition after switching windows', async () => {
            await browser.getCookies()
            await browser.switchWindow('window-handle-3')
            await browser.getCookies()

            expect(storageGetCookies).toHaveBeenNthCalledWith(1, {
                partition: { type: 'context', context: 'window-handle-2' }
            })
            expect(storageGetCookies).toHaveBeenNthCalledWith(2, {
                partition: { type: 'context', context: 'window-handle-3' }
            })
        })

        it('should preserve the Classic fallback for multiple cookie names', async () => {
            const cookies = await browser.getCookies(['cookie1', 'cookie3'])

            expect(storageGetCookies).not.toBeCalled()
            expect(cookies).toEqual([
                { name: 'cookie1', value: 'dummy-value-1' },
                { name: 'cookie3', value: 'dummy-value-3' }
            ])
        })

        afterEach(() => {
            vi.mocked(fetch).mockClear()
        })
    })
})
