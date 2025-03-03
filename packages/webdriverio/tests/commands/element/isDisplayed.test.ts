import path from 'node:path'
import { expect, describe, it, beforeEach, vi } from 'vitest'

import { remote } from '../../../src/index.js'

vi.mock('fetch')
vi.mock('devtools')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

vi.mock('../../../src/scripts/isElementDisplayed', () => ({
    __esModule: true,
    default: function () { return true }
}))

vi.mock('../../../src/scripts/isElementInViewport', () => ({
    __esModule: true,
    default: function () { return true }
}))

describe('isDisplayed test', () => {
    let browser: WebdriverIO.Browser
    let elem: WebdriverIO.Element

    beforeEach(async () => {
        browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        elem = await browser.$('#foo')
        vi.mocked(fetch).mockClear()
    })

    it('should allow to check if element is displayed', async () => {
        expect(await elem.isDisplayed()).toBe(true)
        expect(fetch).toBeCalledTimes(1)
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[0][0]!.pathname)
            .toBe('/session/foobar-123/execute/sync')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as any).args[0]).toEqual({
            ELEMENT: 'some-elem-123',
            'element-6066-11e4-a52e-4f735466cecf': 'some-elem-123'
        })
    })

    it('should allow to check if element is displayed within viewport', async () => {
        expect(await elem.isDisplayed({ withinViewport: true })).toBe(true)
        expect(fetch).toBeCalledTimes(2)
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[0][0]!.pathname)
            .toBe('/session/foobar-123/execute/sync')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as any).args[0]).toEqual({
            ELEMENT: 'some-elem-123',
            'element-6066-11e4-a52e-4f735466cecf': 'some-elem-123',
        })
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[1][0]!.pathname)
            .toBe('/session/foobar-123/execute/sync')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as any).args[0]).toEqual({
            ELEMENT: 'some-elem-123',
            'element-6066-11e4-a52e-4f735466cecf': 'some-elem-123',
        })
    })

    it('should allow to check if element is displayed in mobile mode without browserName', async () => {
        browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                // @ts-ignore mock feature
                keepBrowserName: true,
                mobileMode: true
            } as any
        })
        elem = await browser.$('#foo')
        vi.mocked(fetch).mockClear()
        expect(await elem.isDisplayed()).toBe(true)
        // Due to mobileMode being enabled we will have extra calls to fetch
        expect(fetch).toBeCalledTimes(1)
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[0][0]!.pathname)
            .toBe('/session/foobar-123/element/some-elem-123/displayed')
    })

    it('should throw if displayed check within viewport is done for native mobile apps', async () => {
        browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                // @ts-ignore mock feature
                keepBrowserName: true,
                mobileMode: true
            } as any
        })
        elem = await browser.$('#foo')
        vi.mocked(fetch).mockClear()
        await expect(elem.isDisplayed({ withinViewport: true }))
            .rejects.toThrow(/Cannot determine element visibility within viewport for native mobile apps/)
    })

    it('should refetch element if non existing', async () => {
        // @ts-ignore test scenario
        delete elem.elementId
        expect(await elem.isDisplayed()).toBe(true)
        expect(fetch).toBeCalledTimes(2)
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[0][0]!.pathname)
            .toBe('/session/foobar-123/element')
            // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[1][0]!.pathname)
            .toBe('/session/foobar-123/execute/sync')
    })

    it('should refetch React element if non existing', async () => {
        elem = await browser.react$('FooCmp')
        // @ts-ignore test scenario
        delete elem.elementId

        expect(await elem.isDisplayed()).toBe(true)
    })

    it('should return false if element is not existing anymore', async () => {
        browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'safari',
                // @ts-ignore mock feature
                keepBrowserName: true
            } as any
        })
        elem = await browser.$('#foo')

        expect(await elem.isDisplayed()).toBe(true)

        elem.selector = '#nonexisting'
        // @ts-ignore mock feature
        vi.mocked(fetch).setMockResponse([{ error: 'no such element', statusCode: 404 }])

        expect(await elem.isDisplayed()).toBe(false)
    })

    it('should return false if element can\'t be found after refetching it', async () => {
        const elem = await browser.$('#nonexisting')
        expect(await elem.isDisplayed()).toBe(false)
        expect(fetch).toBeCalledTimes(2)
    })

    describe('isElementDisplayed script', () => {
        it('should be used if safari and w3c', async () => {
            browser = await remote({
                baseUrl: 'http://foobar.com',
                capabilities: {
                    browserName: 'safari',
                    // @ts-ignore mock feature
                    keepBrowserName: true
                } as any
            })
            elem = await browser.$('#foo')
            vi.mocked(fetch).mockClear()

            expect(await elem.isDisplayed()).toBe(true)
            expect(fetch).toBeCalledTimes(1)
            expect(vi.mocked(fetch).mock.calls[0][0]!.pathname)
                .toBe('/session/foobar-123/execute/sync')
            expect(vi.mocked(fetch).mock.calls[0][1]!.json.args[0]).toEqual({
                'element-6066-11e4-a52e-4f735466cecf': 'some-elem-123',
                ELEMENT: 'some-elem-123'
            })
        })
        it('should be used if stp and w3c', async () => {
            browser = await remote({
                baseUrl: 'http://foobar.com',
                capabilities: {
                    browserName: 'safari technology preview',
                    // @ts-ignore mock feature
                    keepBrowserName: true
                } as any
            })
            elem = await browser.$('#foo')
            vi.mocked(fetch).mockClear()

            expect(await elem.isDisplayed()).toBe(true)
            expect(fetch).toBeCalledTimes(1)
            expect(vi.mocked(fetch).mock.calls[0][0]!.pathname)
                .toBe('/session/foobar-123/execute/sync')
            expect(vi.mocked(fetch).mock.calls[0][1]!.json.args[0]).toEqual({
                'element-6066-11e4-a52e-4f735466cecf': 'some-elem-123',
                ELEMENT: 'some-elem-123'
            })
        })
        it('should be used if edge and wc3', async () => {
            browser = await remote({
                baseUrl: 'http://foobar.com',
                capabilities: {
                    browserName: 'MicrosoftEdge',
                    // @ts-ignore mock feature
                    keepBrowserName: true
                } as any
            })
            elem = await browser.$('#foo')
            vi.mocked(fetch).mockClear()

            expect(await elem.isDisplayed()).toBe(true)
            expect(fetch).toBeCalledTimes(1)
            expect(vi.mocked(fetch).mock.calls[0][0]!.pathname)
                .toBe('/session/foobar-123/execute/sync')
            expect(vi.mocked(fetch).mock.calls[0][1]!.json.args[0]).toEqual({
                'element-6066-11e4-a52e-4f735466cecf': 'some-elem-123',
                ELEMENT: 'some-elem-123'
            })
        })
        it('should be used if chrome and wc3', async () => {
            browser = await remote({
                baseUrl: 'http://foobar.com',
                capabilities: {
                    browserName: 'chrome',
                    // @ts-ignore mock feature
                    keepBrowserName: true
                } as any
            })
            elem = await browser.$('#foo')
            vi.mocked(fetch).mockClear()

            expect(await elem.isDisplayed()).toBe(true)
            expect(fetch).toBeCalledTimes(1)
            expect(vi.mocked(fetch).mock.calls[0][0]!.pathname)
                .toBe('/session/foobar-123/execute/sync')
            expect(vi.mocked(fetch).mock.calls[0][1]!.json.args[0]).toEqual({
                'element-6066-11e4-a52e-4f735466cecf': 'some-elem-123',
                ELEMENT: 'some-elem-123'
            })
        })
        it('should be used if devtools', async () => {
            browser = await remote({
                baseUrl: 'http://foobar.com',
                capabilities: {
                    browserName: 'firefox',
                }
            })
            elem = await browser.$('#foo')
            vi.mocked(fetch).mockClear()
            browser.isDevTools = true

            expect(await elem.isDisplayed()).toBe(true)
            expect(fetch).toBeCalledTimes(1)
            expect(vi.mocked(fetch).mock.calls[0][0]!.pathname)
                .toBe('/session/foobar-123/execute/sync')
            expect(vi.mocked(fetch).mock.calls[0][1]!.json.args[0]).toEqual({
                'element-6066-11e4-a52e-4f735466cecf': 'some-elem-123',
                ELEMENT: 'some-elem-123'
            })
        })
    })
})
