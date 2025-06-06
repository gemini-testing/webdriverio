import path from 'node:path'

import { expect, describe, it, vi, beforeEach, beforeAll } from 'vitest'
import puppeteer from 'puppeteer-core'

import { remote } from '../../../src/index.js'

vi.mock('fetch')
vi.mock('puppeteer-core')
/**
 * Given that Puppeteer is not a direct dependency of this package, we can't mock
 * it and dynamically import it. Instead, we mock the "userImport" helper and make
 * it resolve to the mocked Puppeteer.
 */
vi.mock('@testplane/wdio-utils', async (origMod) => {
    const orig = await origMod() as any
    // resolve the mocked puppeteer-core
    const puppeteer = await import('puppeteer-core')
    return {
        ...orig,
        userImport: vi.fn().mockResolvedValue(puppeteer.default)
    }
})
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

const puppeteerConnect = vi.mocked(puppeteer.connect)

describe('attach Puppeteer', () => {
    let browser: WebdriverIO.Browser

    beforeEach(() => {
        puppeteerConnect.mockClear()
    })

    beforeAll(async () => {
        browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            },
            headers: {
                Authorization: 'OAuth token'
            }
        })
    })

    it('should pass for Chrome', async () => {
        const pptr = await browser.getPuppeteer.call({
            ...browser,
            options: browser.options,
            capabilities: {
                browserName: 'chrome',
                'goog:chromeOptions': {
                    debuggerAddress: 'localhost:1234'
                }
            },
            requestedCapabilities: {}
        } as WebdriverIO.Browser)
        expect(typeof pptr).toBe('object')
        expect(puppeteerConnect.mock.calls).toMatchSnapshot()
    })

    it('should pass for Firefox', async () => {
        const pprt = await browser.getPuppeteer.call({
            ...browser,
            options: browser.options,
            capabilities: {
                browserName: 'firefox',
                browserVersion: '79.0b'
            },
            requestedCapabilities: {
                'moz:firefoxOptions': {
                    args: ['foo', 'bar', '-remote-debugging-port', 4321, 'barfoo']
                } as any
            }
        } as WebdriverIO.Browser)
        expect(typeof pprt).toBe('object')
        expect(puppeteerConnect.mock.calls).toMatchSnapshot()
    })

    it('should pass for Firefox (DevTools)', async () => {
        const pptr = await browser.getPuppeteer.call({
            ...browser,
            options: browser.options,
            capabilities: {
                browserName: 'firefox',
                browserVersion: '79.0b',
                'moz:firefoxOptions': {
                    debuggerAddress: 'localhost:1234'
                }
            },
            requestedCapabilities: {
                'moz:firefoxOptions': {
                    args: []
                } as any
            }
        } as WebdriverIO.Browser)
        expect(typeof pptr).toBe('object')
        expect(puppeteerConnect.mock.calls).toMatchSnapshot()
    })

    it('should pass for Firefox and moz:debuggerAddress flag enabled', async () => {
        const pptr = await browser.getPuppeteer.call({
            ...browser,
            options: browser.options,
            capabilities: {
                browserName: 'firefox',
                browserVersion: '79.0b',
                'moz:debuggerAddress': 'localhost:1234'
            },
            requestedCapabilities: {
                'moz:firefoxOptions': {
                    args: []
                } as any
            }
        } as WebdriverIO.Browser)
        expect(typeof pptr).toBe('object')
        expect(puppeteerConnect.mock.calls).toMatchSnapshot()
    })

    it('should fail for Firefox if no info is given', async () => {
        await expect(browser.getPuppeteer.call({
            ...browser,
            options: browser.options,
            capabilities: {
                browserName: 'firefox',
                browserVersion: '79.0b'
            },
            requestedCapabilities: {
                'moz:firefoxOptions': {
                    args: []
                } as any
            }
        } as WebdriverIO.Browser)).rejects.toThrow('Could\'t find a websocket url')
    })

    it('should pass for Edge', async () => {
        const pptr = await browser.getPuppeteer.call({
            ...browser,
            options: browser.options,
            capabilities: {
                browserName: 'edge',
                'ms:edgeOptions': {
                    debuggerAddress: 'localhost:1234'
                }
            },
            requestedCapabilities: {}
        } as WebdriverIO.Browser)
        expect(typeof pptr).toBe('object')
        expect(puppeteerConnect.mock.calls).toMatchSnapshot()
    })

    it('should fail for old Firefox version', async () => {
        const err = await browser.getPuppeteer.call({
            ...browser,
            options: browser.options,
            capabilities: {
                browserName: 'firefox',
                browserVersion: '78.0b'
            },
            requestedCapabilities: {
                'moz:firefoxOptions': {
                    args: ['foo', 'bar', '-remote-debugging-port', 4321, 'barfoo']
                } as any
            }
        // @ts-ignore uses sync command
        } as WebdriverIO.Browser).catch(err => err)

        expect(err.message).toContain('Using DevTools capabilities is not supported for this session.')
    })

    it('should not re-attach if connection was already established', async () => {
        const pptr = await browser.getPuppeteer.call({
            ...browser,
            options: browser.options,
            capabilities: {
                browserName: 'chrome',
                'goog:chromeOptions': {
                    debuggerAddress: 'localhost:1234'
                }
            },
            puppeteer: {
                connected: true
            } as any
        } as WebdriverIO.Browser)
        expect(typeof pptr).toBe('object')
        expect(puppeteerConnect).toHaveBeenCalledTimes(0)
    })

    it('should pass for Selenium CDP', async () => {
        const pptr = await browser.getPuppeteer.call({
            ...browser,
            options: browser.options,
            capabilities: {
                'se:cdp': 'http://my.grid:1234/session/mytestsession/se/cdp'
            }
        } as WebdriverIO.Browser)
        expect(typeof pptr).toBe('object')
        expect(puppeteerConnect.mock.calls).toMatchSnapshot()
    })

    it('should pass for Aerokube Selenoid CDP', async () => {
        const pptr = await browser.getPuppeteer.call({
            ...browser,
            capabilities: {
                'selenoid:options': {
                    foo: 'bar'
                } as any
            },
            requestedCapabilities: {
                'selenoid:options': {
                    foo: 'bar'
                } as any
            },
            options: {
                hostname: 'my.grid',
                port: 4444,
                path: '/wd/hub',
                headers: {
                    Authorization: 'OAuth token'
                }
            } as any
        } as WebdriverIO.Browser)
        expect(typeof pptr).toBe('object')
        expect(puppeteerConnect.mock.calls).toMatchSnapshot()
    })

    it('should pass for Aerokube Moon CDP', async () => {
        const pptr = await browser.getPuppeteer.call({
            ...browser,
            capabilities: {
                'moon:options': {
                    foo: 'bar'
                } as any
            },
            requestedCapabilities: {
                'moon:options': {
                    foo: 'bar'
                } as any
            },
            options: {
                hostname: 'my.grid',
                port: 4444,
                path: '/wd/hub',
                headers: {
                    Authorization: 'OAuth token'
                }
            } as any
        } as WebdriverIO.Browser)
        expect(typeof pptr).toBe('object')
        expect(puppeteerConnect.mock.calls).toMatchSnapshot()
    })

    it('should throw an error if Puppeteer is not supported', async () => {
        // @ts-expect-error
        globalThis.wdio = true
        await expect(browser.getPuppeteer.call({
            ...browser,
            options: browser.options,
            capabilities: { browserName: 'chrome' }
        } as WebdriverIO.Browser)).rejects.toThrow('Puppeteer is not supported in browser runner')
    })
})
