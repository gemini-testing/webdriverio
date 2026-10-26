import path from 'node:path'
import { expect, describe, beforeEach, beforeAll, afterEach, it, vi, type MockInstance } from 'vitest'

import { remote } from '../../../src/index.js'

vi.mock('fetch')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('setCookies', () => {
    const cookie1 = { name: 'cookie1', value: 'dummy-value-1' }
    const cookie2 = { name: 'cookie2', value: 'dummy-value-2' }
    const cookie3 = { name: 'cookie2', value: 'dummy-value-3' }
    let browser: WebdriverIO.Browser

    describe('classic', () => {
        beforeAll(async () => {
            browser = await remote({
                baseUrl: 'http://foobar.com',
                capabilities: {
                    browserName: 'foobar'
                }
            })
        })

        it('should output the expected format', async () => {
            await browser.setCookies([cookie1])
            expect(vi.mocked(fetch).mock.calls).toHaveLength(2!)
            expect(vi.mocked(fetch).mock.calls[1][1]!.method).toBe('POST')
            // @ts-expect-error mock implementation
            expect(vi.mocked(fetch).mock.calls[1][0]!.pathname)
                .toBe('/session/foobar-123/cookie')
            expect(vi.mocked(fetch).mock.calls[1][1]!.body)
                .toEqual(JSON.stringify({ 'cookie': cookie1 }))
        })

        it('should support passing an object', async () => {
            await browser.setCookies(cookie1)
            expect(vi.mocked(fetch).mock.calls).toHaveLength(1!)
            expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('POST')
            // @ts-expect-error mock implementation
            expect(vi.mocked(fetch).mock.calls[0][0]!.pathname)
                .toBe('/session/foobar-123/cookie')
            expect(vi.mocked(fetch).mock.calls[0][1]!.body)
                .toEqual(JSON.stringify({ 'cookie': cookie1 }))
        })

        it('can be called multiple times', async () => {
            await browser.setCookies(cookie1)
            await browser.setCookies(cookie2)
            expect(vi.mocked(fetch).mock.calls).toHaveLength(2!)
            expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('POST')
            // @ts-expect-error mock implementation
            expect(vi.mocked(fetch).mock.calls[0][0]!.pathname)
                .toBe('/session/foobar-123/cookie')
            expect(vi.mocked(fetch).mock.calls[0][1]!.body)
                .toEqual(JSON.stringify({ 'cookie': cookie1 }))
            expect(vi.mocked(fetch).mock.calls[1][1]!.method).toBe('POST')
            // @ts-expect-error mock implementation
            expect(vi.mocked(fetch).mock.calls[1][0]!.pathname)
                .toBe('/session/foobar-123/cookie')
            expect(vi.mocked(fetch).mock.calls[1][1]!.body)
                .toEqual(JSON.stringify({ 'cookie': cookie2 }))
        })

        it('should work with multiple objects passed', async () => {
            const cookies = [cookie1, cookie2, cookie3]
            await browser.setCookies(cookies)

            cookies.forEach((cookie, i) => {
                expect(vi.mocked(fetch).mock.calls[i][1]!.method).toBe('POST')
                // @ts-expect-error mock implementation
                expect(vi.mocked(fetch).mock.calls[i][0]!.pathname)
                    .toBe('/session/foobar-123/cookie')
                expect(vi.mocked(fetch).mock.calls[i][1]!.body)
                    .toEqual(JSON.stringify({ 'cookie': cookie }))
            })
        })

        it('should throw error if invalid arguments are passed', async () => {
            // @ts-ignore test invalid parameter
            await expect(browser.setCookies([2]))
                .rejects
                .toEqual(new Error('Invalid input (see https://webdriver.io/docs/api/browser/setCookies for documentation)'))
        })

        afterEach(() => {
            vi.mocked(fetch).mockClear()
        })
    })

    describe('bidi', () => {
        let storageSetCookie: MockInstance

        beforeAll(async () => {
            browser = await remote({
                baseUrl: 'http://foobar.com',
                capabilities: {
                    browserName: 'bidi'
                }
            })

            storageSetCookie =  vi.spyOn(browser, 'storageSetCookie')
            storageSetCookie.mockImplementation((() => {}) as any)
        })

        beforeEach(async () => {
            await browser.switchWindow('window-handle-2')
            storageSetCookie.mockClear()
        })

        it('should support passing an array', async () => {
            await browser.setCookies([cookie1])
            expect(storageSetCookie).toBeCalledTimes(1)
            expect(storageSetCookie).toBeCalledWith({
                partition: { type: 'context', context: 'window-handle-2' },
                cookie: {
                    domain: 'webdriver.io',
                    name: 'cookie1',
                    value: {
                        type: 'string',
                        value: cookie1.value
                    }
                }
            })
        })

        it('should support passing an object', async () => {
            await browser.setCookies(cookie1)
            expect(storageSetCookie).toBeCalledTimes(1)
            expect(storageSetCookie).toBeCalledWith({
                partition: { type: 'context', context: 'window-handle-2' },
                cookie: {
                    domain: 'webdriver.io',
                    name: 'cookie1',
                    value: {
                        type: 'string',
                        value: cookie1.value
                    }
                }
            })
        })

        it('can be called multiple times', async () => {
            await browser.setCookies([cookie1, cookie2, cookie3])
            expect(storageSetCookie).toBeCalledTimes(3)
            for (let i = 1; i <= 3; i++) {
                expect(storageSetCookie).toHaveBeenNthCalledWith(i, expect.objectContaining({
                    partition: { type: 'context', context: 'window-handle-2' }
                }))
            }
        })

        it('should use the new partition after switching windows with an explicit domain', async () => {
            const cookie = { ...cookie1, domain: 'foobar.com' }
            await browser.setCookies(cookie)
            await browser.switchWindow('window-handle-3')
            await browser.setCookies(cookie)

            expect(storageSetCookie).toHaveBeenNthCalledWith(1, {
                partition: { type: 'context', context: 'window-handle-2' },
                cookie: { ...cookie, value: { type: 'string', value: cookie.value } }
            })
            expect(storageSetCookie).toHaveBeenNthCalledWith(2, {
                partition: { type: 'context', context: 'window-handle-3' },
                cookie: { ...cookie, value: { type: 'string', value: cookie.value } }
            })
        })
    })
})
