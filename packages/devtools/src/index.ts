import os from 'node:os'
import path from 'node:path'
import UAParser from 'ua-parser-js'
import { v4 as uuidv4 } from 'uuid'

import logger from '@testplane/wdio-logger'
import { webdriverMonad, devtoolsEnvironmentDetector } from '@testplane/wdio-utils'
import { validateConfig } from '@testplane/wdio-config'
import type { CommandEndpoint } from '@testplane/wdio-protocols'
import type { Options, Capabilities } from '@testplane/wdio-types'
import type { Browser } from 'puppeteer-core/lib/esm/puppeteer/api/Browser.js'

import DevToolsDriver from './devtoolsdriver.js'
import launch from './launcher.js'
import { DEFAULTS, SUPPORTED_BROWSER, VENDOR_PREFIX } from './constants.js'
import { getPrototype, patchDebug } from './utils.js'
import type { Client, AttachOptions, DevToolsOptions as WDIODevtoolsOptionsExtension } from './types.js'

const log = logger('devtools:puppeteer')

export const sessionMap = new Map()
let isDebugPatched = false

/**
 * patch debug package to log Puppeteer CDP messages
 */
async function patchDebugPkg() {
    if (!isDebugPatched) {
        await patchDebug(log)
        isDebugPatched = true
    }
}

export default class DevTools {
    static async newSession (
        options: Capabilities.WebdriverIOConfig,
        modifier?: Function,
        userPrototype = {},
        customCommandWrapper?: Function
    ): Promise<Client> {
        await patchDebugPkg()

        const envLogLevel = process.env.WDIO_LOG_LEVEL as Options.WebDriverLogTypes | undefined
        options.logLevel = envLogLevel ?? options.logLevel
        const params = validateConfig(DEFAULTS, options)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (params.logLevel && (!options.logLevels || !(options.logLevels as any).devtools)) {
            logger.setLevel('devtools', params.logLevel)
        }

        /**
         * Store all log events in a file
         */
        if (params.outputDir && !process.env.WDIO_LOG_PATH) {
            process.env.WDIO_LOG_PATH = path.join(params.outputDir, 'wdio.log')
        }

        log.info('Initiate new session using the DevTools protocol')

        const requestedCapabilities = { ...params.capabilities }
        const browser = await launch(params.capabilities as WebdriverIO.Capabilities)
        const pages = await browser.pages()
        const driver = new DevToolsDriver(browser, pages)
        const sessionId = uuidv4()
        const uaParser = new UAParser(await browser.userAgent())
        const userAgent = uaParser.getResult()

        /**
         * find vendor key in capabilities
         */
        type ValueOf<T> = T[keyof T]
        const availableVendorPrefixes = Object.values(VENDOR_PREFIX)
        const vendorCapPrefix = Object.keys(params.capabilities as WebdriverIO.Capabilities)
            .find(
                (capKey: ValueOf<typeof VENDOR_PREFIX>) => availableVendorPrefixes.includes(capKey)
            ) as keyof WebdriverIO.Capabilities
            ||
            VENDOR_PREFIX[userAgent.browser.name?.toLocaleLowerCase() as keyof typeof VENDOR_PREFIX]

        const { browserName } = (requestedCapabilities as Capabilities.W3CCapabilities).alwaysMatch || requestedCapabilities
        params.capabilities = {
            browserName: (userAgent.browser.name || browserName || 'unknown').split(' ').shift()?.toLowerCase(),
            browserVersion: userAgent.browser.version,
            platformName: os.platform(),
            // platform: os.release()
        }

        if (vendorCapPrefix) {
            Object.assign(params.capabilities, {
                [vendorCapPrefix]: Object.assign(
                    { debuggerAddress: browser.wsEndpoint().split('/')[2] },
                    params.capabilities[vendorCapPrefix]
                )
            })
        }

        sessionMap.set(sessionId, { browser, session: driver })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const environmentPrototype: Record<string, { value: any }> = {}
        Object.entries(devtoolsEnvironmentDetector({
            browserName: userAgent?.browser?.name?.toLowerCase()
        })).forEach(([name, value]) => {
            environmentPrototype[name] = { value }
        })
        const commandWrapper = (
            method: string,
            endpoint: string,
            commandInfo: CommandEndpoint
        ) => driver.register(commandInfo)
        const protocolCommands = getPrototype(commandWrapper)
        const prototype = {
            ...protocolCommands,
            ...userPrototype,
            ...environmentPrototype
        }

        const monad = webdriverMonad(
            { ...params, requestedCapabilities },
            modifier,
            prototype
        )
        return monad(sessionId, customCommandWrapper)
    }

    /**
     * Changes The instance session id and browser capabilities for the new session
     * directly into the passed in browser object
     *
     * @param   {object} instance  the object we get from a new browser session.
     * @returns {string}           the new session id of the browser
     */
    static async reloadSession (instance: Client, newCapabilities: WebdriverIO.Capabilities): Promise<string> {
        await patchDebugPkg()

        const { session } = sessionMap.get(instance.sessionId)
        const browser = await launch({
            ...instance.requestedCapabilities as WebdriverIO.Capabilities,
            ...(newCapabilities || {})
        })
        const pages = await browser.pages()
        session.initBrowser.call(session, browser, pages)
        instance.puppeteer = browser
        sessionMap.set(instance.sessionId, { browser, session })
        return instance.sessionId
    }

    /**
     * allows user to attach to existing sessions
     */
    static async attachToSession (
        options: AttachOptions,
        modifier?: Function,
        userPrototype = {},
        customCommandWrapper?: Function
    ): Promise<Client> {
        await patchDebugPkg()

        const browser = await launch(options.capabilities)
        const pages = await browser.pages()
        const driver = new DevToolsDriver(browser, pages)
        const sessionId = uuidv4()
        const uaParser = new UAParser(await browser.userAgent())
        const userAgent = uaParser.getResult()

        const environmentPrototype: Record<string, { value: Browser | boolean, writable?: boolean }> = { puppeteer: { value: browser, writable: true } }
        Object.entries(devtoolsEnvironmentDetector({
            browserName: userAgent?.browser?.name?.toLowerCase()
        })).forEach(([name, value]) => {
            environmentPrototype[name] = { value }
        })
        const commandWrapper = (
            method: string,
            endpoint: string,
            commandInfo: CommandEndpoint
        ) => driver.register(commandInfo)
        const protocolCommands = getPrototype(commandWrapper)
        const prototype = {
            ...protocolCommands,
            ...userPrototype,
            ...environmentPrototype
        }

        const monad = webdriverMonad(
            options,
            modifier,
            prototype
        )
        return monad(sessionId, customCommandWrapper)
    }
}

export { SUPPORTED_BROWSER }
export * from './types.js'

declare global {
    namespace WebdriverIO {
        interface WDIODevtoolsOptions extends WDIODevtoolsOptionsExtension {}
    }
}
