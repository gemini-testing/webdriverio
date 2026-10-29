import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import puppeteer from 'puppeteer-core'
import WebDriver from '@testplane/webdriver'
import { getPuppeteer } from '../../../src/commands/browser/getPuppeteer.js'
import { reloadSession } from '../../../src/commands/browser/reloadSession.js'
import { throttleCPU } from '../../../src/commands/browser/throttleCPU.js'
import { throttleNetwork } from '../../../src/commands/browser/throttleNetwork.js'

vi.mock('puppeteer-core', () => ({ default: { connect: vi.fn() } }))
vi.mock('@testplane/webdriver', () => ({ default: { reloadSession: vi.fn() } }))
vi.mock('../../../src/session/index.js', () => ({ registerSessionManager: vi.fn() }))
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('Puppeteer session lifecycle', () => {
    beforeEach(() => vi.clearAllMocks())

    function browserWith(puppeteerSession?: object) {
        const browser = {
            sessionId: 'old-session',
            options: { automationProtocol: '@testplane/webdriver', headers: { Authorization: 'token' } },
            capabilities: { 'se:cdp': 'ws://localhost/session/cdp' },
            requestedCapabilities: {},
            puppeteer: puppeteerSession,
            deleteSession: vi.fn().mockResolvedValue(undefined)
        } as unknown as WebdriverIO.Browser
        browser.getPuppeteer = getPuppeteer.bind(browser)
        return browser
    }

    it('reuses a connected Puppeteer session', async () => {
        const session = { connected: true, browserContexts: () => [] }
        expect(await getPuppeteer.call(browserWith(session))).toBe(session)
        expect(puppeteer.connect).not.toHaveBeenCalled()
    })

    it('preserves the context isolation API used by Testplane', async () => {
        const defaultContext = { id: undefined }
        const privateContext = { id: 'isolated', close: vi.fn() }
        const createBrowserContext = vi.fn().mockResolvedValue(privateContext)
        const session = {
            connected: true,
            browserContexts: () => [defaultContext, privateContext],
            defaultBrowserContext: () => defaultContext,
            createBrowserContext
        }
        const browser = browserWith(session)
        const compatible = await getPuppeteer.call(browser)

        expect(compatible.isConnected()).toBe(true)
        expect(compatible.browserContexts().map(ctx => ctx.isIncognito())).toEqual([false, true])
        expect(compatible.defaultBrowserContext().isIncognito()).toBe(false)
        expect(await compatible.createIncognitoBrowserContext({ proxyServer: 'http://proxy.test' })).toBe(privateContext)
        expect(createBrowserContext).toHaveBeenCalledWith({ proxyServer: 'http://proxy.test' })
        session.connected = false
        expect(compatible.isConnected()).toBe(false)
    })

    it('does not stack context wrappers on repeated getPuppeteer calls', async () => {
        const context = { id: 'isolated' }
        const session = {
            connected: true,
            browserContexts: () => [context],
            defaultBrowserContext: () => context,
            createBrowserContext: vi.fn().mockResolvedValue(context)
        }
        const browser = browserWith(session)
        const compatible = await getPuppeteer.call(browser)
        const createContext = compatible.createIncognitoBrowserContext

        expect(await getPuppeteer.call(browser)).toBe(compatible)
        expect(compatible.createIncognitoBrowserContext).toBe(createContext)
        expect((await compatible.createBrowserContext()).isIncognito()).toBe(true)
    })

    it('decorates existing contexts reached through targets and pages before browser context accessors', async () => {
        const defaultContext: { id?: string, isIncognito?: () => boolean } = {}
        const privateContext: { id?: string, isIncognito?: () => boolean } = { id: 'isolated' }
        const target = { browserContext: () => defaultContext }
        const page = { browserContext: () => privateContext }
        const session = {
            connected: true,
            browserContexts: () => [defaultContext, privateContext],
            defaultBrowserContext: () => defaultContext,
            createBrowserContext: vi.fn()
        }

        await getPuppeteer.call(browserWith(session))

        expect(target.browserContext().isIncognito?.()).toBe(false)
        expect(page.browserContext().isIncognito?.()).toBe(true)
    })

    it('reloads the default webdriver protocol using the Testplane fork', async () => {
        const browser = browserWith()
        browser.options.automationProtocol = 'webdriver'

        await reloadSession.call(browser)

        expect(WebDriver.reloadSession).toHaveBeenCalledWith(browser, undefined)
    })

    it('reconnects when the previous Puppeteer session is disconnected', async () => {
        const session = { connected: true, browserContexts: () => [] }
        vi.mocked(puppeteer.connect).mockResolvedValue(session as any)
        const browser = browserWith({ connected: false })
        expect(await getPuppeteer.call(browser)).toBe(session)
        expect(browser.puppeteer).toBe(session)
        expect(puppeteer.connect).toHaveBeenCalledWith({
            browserWSEndpoint: 'ws://localhost/session/cdp',
            defaultViewport: null,
            headers: { Authorization: 'token' }
        })
    })

    it('waits for Puppeteer disconnect before reloading the WebDriver session', async () => {
        const order: string[] = []
        const browser = browserWith({
            connected: true,
            disconnect: async () => {
                await new Promise(resolve => setTimeout(resolve, 20))
                order.push('disconnect')
            }
        })
        vi.mocked(WebDriver.reloadSession).mockImplementation(async () => {
            order.push('reload')
            browser.sessionId = 'new-session'
            return 'new-session' as any
        })
        expect(await reloadSession.call(browser)).toBe('new-session')
        expect(order).toEqual(['disconnect', 'reload'])
    })

    it('sends CPU and network throttling commands through the CDP session', async () => {
        const send = vi.fn().mockResolvedValue(undefined)
        const browser = browserWith({
            connected: true,
            browserContexts: () => [],
            pages: async () => [{ target: () => ({ createCDPSession: async () => ({ send }) }) }]
        })
        await throttleCPU.call(browser, 2)
        await throttleNetwork.call(browser, 'online')
        expect(send.mock.calls).toEqual([
            ['Emulation.setCPUThrottlingRate', { rate: 2 }],
            ['Network.emulateNetworkConditions', {
                offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1
            }]
        ])
    })
})
