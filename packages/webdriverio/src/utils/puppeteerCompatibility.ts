import type { Browser, BrowserContext, BrowserContextOptions } from 'puppeteer-core'

export interface CompatibleBrowserContext extends BrowserContext {
    /** @deprecated Use context.id to distinguish the default context. */
    isIncognito(): boolean
}

export interface CompatiblePuppeteerBrowser extends Browser {
    /** @deprecated Use browser.connected. */
    isConnected(): boolean
    /** @deprecated Use browser.createBrowserContext(). */
    createIncognitoBrowserContext(options?: BrowserContextOptions): Promise<CompatibleBrowserContext>
    createBrowserContext(options?: BrowserContextOptions): Promise<CompatibleBrowserContext>
    browserContexts(): CompatibleBrowserContext[]
    defaultBrowserContext(): CompatibleBrowserContext
}

const adaptedBrowsers = new WeakSet<Browser>()

/** Preserve the Puppeteer 20 context APIs used by Testplane's session isolation. */
export function addPuppeteerCompatibility(browser: Browser): CompatiblePuppeteerBrowser {
    if (adaptedBrowsers.has(browser)) {
        return browser as CompatiblePuppeteerBrowser
    }

    const decorateContext = (context: BrowserContext): CompatibleBrowserContext => {
        if (!('isIncognito' in context)) {
            Object.defineProperty(context, 'isIncognito', {
                configurable: true,
                value: () => Boolean(context.id)
            })
        }
        return context as CompatibleBrowserContext
    }
    const createBrowserContext = browser.createBrowserContext
    const browserContexts = browser.browserContexts
    const defaultBrowserContext = browser.defaultBrowserContext
    const createContext = async (options?: BrowserContextOptions) => (
        decorateContext(await createBrowserContext.call(browser, options))
    )

    Object.assign(browser, {
        isConnected: () => browser.connected,
        createIncognitoBrowserContext: createContext,
        createBrowserContext: createContext,
        browserContexts: () => browserContexts.call(browser).map(decorateContext),
        defaultBrowserContext: () => decorateContext(defaultBrowserContext.call(browser))
    })
    adaptedBrowsers.add(browser)
    return browser as CompatiblePuppeteerBrowser
}
