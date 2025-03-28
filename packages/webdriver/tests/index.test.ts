import path from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
// @ts-ignore mock feature
import logger, { logMock } from '@testplane/wdio-logger'
import { sessionEnvironmentDetector } from '@testplane/wdio-utils'
import { startWebDriver } from '@testplane/wdio-utils'

import '../src/browser.js'

import WebDriver, { getPrototype, DEFAULTS, command } from '../src/index.js'
// @ts-expect-error mock feature
import { initCount } from '../src/bidi/core.js'
import * as utils from '../src/utils.js'
import type { Client } from '../src/types.js'

vi.mock('geckodriver', () => ({ start: vi.fn() }))
vi.mock('@testplane/wdio-utils', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-utils')))
vi.mock('@testplane/wdio-utils/node', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-utils/node')))
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))
vi.mock('fs')
vi.mock('wait-port')
vi.mock('ws')
vi.mock('fetch')

vi.mock('../src/bidi/core.js', () => {
    let initCount = 0
    return {
        BidiCore: class BidiHandlerMock {
            connect = vi.fn().mockResolvedValue({})
            constructor () {
                ++initCount
            }
            waitForConnected() {
                return Promise.resolve()
            }
            get socket () {
                return {
                    on: vi.fn(),
                    send: vi.fn(),
                    close: vi.fn()
                }
            }
        },
        initCount: () => initCount
    }
})

const sessionOptions = {
    protocol: 'http',
    hostname: 'localhost',
    port: 4444,
    path: '/',
    sessionId: 'foobar'
}

// @ts-expect-error
interface TestClient extends Client {
    getUrl (): string
    getApplicationCacheStatus (): void
    takeElementScreenshot (): void
    getDeviceTime (): void
}

beforeEach(() => {
    vi.mocked(sessionEnvironmentDetector).mockClear()
})

describe('WebDriver', () => {
    it('exports getPrototype, DEFAULTS', () => {
        expect(typeof getPrototype).toBe('function')
        expect(typeof DEFAULTS).toBe('object')
        expect(typeof command).toBe('function')
    })

    describe('newSession', () => {
        afterEach(() => {
            delete process.env.WDIO_LOG_PATH

            logMock.error.mockRestore()
            logMock.warn.mockRestore()
            logMock.info.mockRestore()
            logMock.debug.mockRestore()
        })

        it('should allow to create a new session using jsonwire caps', async () => {
            const testDirPath = './logs'
            await WebDriver.newSession({
                path: '/',
                outputDir: testDirPath,
                capabilities: { browserName: 'firefox' }
            })

            expect(fetch).toHaveBeenCalledWith(
                expect.objectContaining({ pathname: '/session' }),
                expect.objectContaining({ body: JSON.stringify({
                    capabilities: {
                        alwaysMatch: {
                            browserName: 'firefox',
                            webSocketUrl: true,
                            unhandledPromptBehavior: 'ignore'
                        },
                        firstMatch: [{}]
                    }
                }) })
            )
        })

        it('should allow to create a new session using w3c compliant caps', async () => {
            await WebDriver.newSession({
                path: '/',
                capabilities: {
                    alwaysMatch: { browserName: 'firefox' },
                    firstMatch: [{}]
                }
            })

            expect(fetch).toHaveBeenCalledWith(
                expect.objectContaining({ pathname: '/session' }),
                expect.objectContaining({ body: JSON.stringify({
                    capabilities: {
                        alwaysMatch: {
                            browserName: 'firefox',
                            webSocketUrl: true,
                            unhandledPromptBehavior: 'ignore'
                        },
                        firstMatch: [{}]
                    }
                }) })
            )

            expect(vi.mocked(sessionEnvironmentDetector).mock.calls)
                .toMatchSnapshot()
        })

        it('should be possible to skip setting logLevel', async () => {
            await WebDriver.newSession({
                capabilities: { browserName: 'chrome' },
                logLevel: 'info',
                logLevels: { webdriver: 'silent' }
            })

            expect(logger.setLevel).not.toBeCalled()
        })

        it('should be possible to set logLevel', async () => {
            await WebDriver.newSession({
                capabilities: { browserName: 'chrome' },
                logLevel: 'info'
            })

            expect(logger.setLevel).toBeCalled()
        })

        it('propagates capabilities and requestedCapabilities', async () => {
            const browser = await WebDriver.newSession({
                path: '/',
                capabilities: { browserName: 'firefox' }
            })
            expect(browser.capabilities.browserName).toBe('mockBrowser')
            expect((browser.requestedCapabilities as WebdriverIO.Capabilities).browserName).toBe('firefox')
        })

        it('attaches bidi handler if socket url is given', async () => {
            const wid = process.env.WDIO_UNIT_TESTS
            delete process.env.WDIO_UNIT_TESTS
            vi.mocked(fetch).mockResolvedValueOnce(Response.json({ value: { webSocketUrl: 'ws://foo/bar' } }))
            await WebDriver.newSession({
                path: '/',
                capabilities: { browserName: 'firefox' }
            })
            expect(initCount()).toBe(1)
            process.env.WDIO_UNIT_TESTS = wid
        })

        it('should call "initiateBidi" with correct arguments', async () => {
            const webSocketUrl = 'ws://foo/bar'
            const strictSSL = true
            const headers = { 'Authorization': 'OAuth 12345' }

            vi.spyOn(utils, 'initiateBidi')
            vi.mocked(fetch).mockResolvedValueOnce(Response.json({ value: { webSocketUrl } }))
            await WebDriver.newSession({
                path: '/',
                capabilities: { browserName: 'firefox' },
                strictSSL,
                headers
            })

            expect(utils.initiateBidi).toHaveBeenCalledWith(webSocketUrl, strictSSL, headers)
        })
    })

    describe('attachToSession', () => {
        it('should allow to attach to existing session', async () => {
            const client = WebDriver.attachToSession({ ...sessionOptions, logLevel: 'error' }) as unknown as TestClient
            await client.getUrl()
            expect(fetch).toHaveBeenCalledWith(
                expect.objectContaining({ href: 'http://localhost:4444/session/foobar/url' }),
                expect.anything()
            )
            expect(logger.setLevel).toBeCalled()
        })

        it('should allow to attach to existing session2', async () => {
            const client = WebDriver.attachToSession({ ...sessionOptions }) as unknown as TestClient
            await client.getUrl()
            expect(fetch).toHaveBeenCalledWith(
                expect.objectContaining({ href: 'http://localhost:4444/session/foobar/url' }),
                expect.anything()
            )
            expect(logger.setLevel).not.toBeCalled()
        })

        it('should allow to attach to existing session - W3C', async () => {
            const client = WebDriver.attachToSession({ ...sessionOptions }) as unknown as TestClient
            await client.getUrl()

            expect(client.isChromium).toBeFalsy()
            expect(client.isMobile).toBeFalsy()
            expect(client.isSauce).toBeFalsy()
            expect(client.getApplicationCacheStatus).toBeFalsy()
            expect(client.takeElementScreenshot).toBeTruthy()
            expect(client.getDeviceTime).toBeFalsy()
        })

        it('should allow to attach to existing session - mobile', async () => {
            const client = WebDriver.attachToSession({ ...sessionOptions,
                isChromium: true,
                isMobile: true
            }) as unknown as TestClient

            await client.getUrl()

            expect(client.isChromium).toBe(true)
            expect(client.isMobile).toBe(true)
            expect(client.getApplicationCacheStatus).toBeTruthy()
            expect(client.takeElementScreenshot).toBeTruthy()
            expect(client.getDeviceTime).toBeTruthy()
        })

        it('should allow to attach to existing session - non W3C', async () => {
            const client = WebDriver.attachToSession({ ...sessionOptions,
                isW3C: false,
                isSauce: true,
            }) as any as TestClient

            await client.getUrl()

            expect(client.isSauce).toBe(true)
            expect(client.getApplicationCacheStatus).toBeTruthy()
            expect(client.takeElementScreenshot).toBeFalsy()
            expect(client.getDeviceTime).toBeFalsy()
        })

        it('it should propagate all environment flags', () => {
            const client = WebDriver.attachToSession({ ...sessionOptions,
                isW3C: false,
                isMobile: false,
                isIOS: false,
                isAndroid: false,
                isChromium: false,
                isSauce: false
            })
            expect(client.isW3C).toBe(false)
            expect(client.isMobile).toBe(false)
            expect(client.isIOS).toBe(false)
            expect(client.isAndroid).toBe(false)
            expect(client.isChromium).toBe(false)
            expect(client.isSauce).toBe(false)

            const anotherClient = WebDriver.attachToSession({ ...sessionOptions,
                isW3C: true,
                isMobile: true,
                isIOS: true,
                isAndroid: true,
                isChromium: true,
                isSauce: true
            })
            expect(anotherClient.isW3C).toBe(true)
            expect(anotherClient.isMobile).toBe(true)
            expect(anotherClient.isIOS).toBe(true)
            expect(anotherClient.isAndroid).toBe(true)
            expect(anotherClient.isChromium).toBe(true)
            expect(anotherClient.isSauce).toBe(true)
        })

        it('should apply default connection details', () => {
            const client = WebDriver.attachToSession({ sessionId: '123', port: 4321 })
            expect(client.options.protocol).toBe('http')
            expect(client.options.hostname).toBe('localhost')
            expect(client.options.port).toBe(4321)
            expect(client.options.path).toBe('/')
        })

        it('should allow to attach to appium session', async () => {
            const client = WebDriver.attachToSession({
                ...sessionOptions,
                capabilities: {
                    'appium:automationName': 'foo',
                    'platformName': 'ios',
                }
            }) as unknown as TestClient
            expect(client.isMobile).toBe(true)
            expect(client.isLocked).toBeTruthy()
            expect(client.shake).toBeTruthy()
        })

        it('should fail attaching to session if sessionId is not given', () => {
            // @ts-ignore
            expect(() => WebDriver.attachToSession({}))
                .toThrow(/sessionId is required/)
        })
    })

    describe('reloadSession', () => {
        it('should reload session', async () => {
            const session = await WebDriver.newSession({
                path: '/',
                capabilities: { browserName: 'firefox' }
            })
            vi.mocked(startWebDriver).mockClear()
            await WebDriver.reloadSession(session)
            expect(startWebDriver).not.toHaveBeenCalledOnce()
            expect(fetch).toHaveBeenCalledTimes(2)
        })

        it('starts a new driver process if browserName is given', async () => {
            vi.mocked(startWebDriver).mockImplementation((params) => {
                params.hostname = 'localhost'
                params.port = 4444
                return { pid: 1234 } as any
            })
            const session = await WebDriver.newSession({
                path: '/',
                capabilities: { browserName: 'firefox' }
            })
            vi.mocked(startWebDriver).mockClear()
            await WebDriver.reloadSession(session, { browserName: 'chrome' })
            expect(startWebDriver).toHaveBeenCalledOnce()
            expect((session.capabilities as WebdriverIO.Capabilities)['wdio:driverPID']).toBe(1234)
        })

        it('connects to the new remote', async () => {
            const session = await WebDriver.newSession({
                path: '/',
                capabilities: { browserName: 'firefox' }
            })
            vi.mocked(startWebDriver).mockClear()
            await WebDriver.reloadSession(session, { protocol: 'https', hostname: '1.1.1.1', port: 5555, browserName: 'chrome' })
            expect(startWebDriver).not.toHaveBeenCalledOnce()
            expect(session.options.protocol).toBe('https')
            expect(session.options.hostname).toBe('1.1.1.1')
            expect(session.options.port).toBe(5555)

            await WebDriver.reloadSession(session, { protocol: 'http', hostname: 'localhost', browserName: 'firefox' })
            expect(startWebDriver).toHaveBeenCalledOnce()
            expect(session.options.protocol).toBe('http')
            expect(session.options.hostname).toBe('localhost')
            expect((session.requestedCapabilities as WebdriverIO.Capabilities)['browserName']).toBe('firefox')
        })
    })

    it('ensure that WebDriver interface exports protocols and other objects', () => {
        expect(WebDriver.WebDriver).not.toBe(undefined)
    })

    afterEach(() => {
        vi.mocked(logger.setLevel).mockClear()
        vi.mocked(fetch).mockClear()
        vi.mocked(sessionEnvironmentDetector).mockClear()
        vi.mocked(startWebDriver).mockClear()
    })
})
