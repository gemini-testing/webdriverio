import type { Browser, BrowserContext, BrowserContextOptions, CreatePageOptions, Page, Target, WaitForTargetOptions } from 'puppeteer-core'

interface CompatiblePage extends Page {
    browser(): CompatiblePuppeteerBrowser
    browserContext(): CompatibleBrowserContext
    target(): CompatibleTarget
}

interface CompatibleTarget extends Target {
    browser(): CompatiblePuppeteerBrowser
    browserContext(): CompatibleBrowserContext
    page(): Promise<CompatiblePage | null>
    asPage(): Promise<CompatiblePage>
    opener(): CompatibleTarget | undefined
}

// Only objects reached from the adapted browser have the legacy methods.
// Do not add them to the declarations of every puppeteer-core instance.
interface CompatiblePagesAndTargets {
    newPage(options?: CreatePageOptions): Promise<CompatiblePage>
    pages(includeAll?: boolean): Promise<CompatiblePage[]>
    targets(): CompatibleTarget[]
    waitForTarget(predicate: (target: CompatibleTarget) => boolean | Promise<boolean>, options?: WaitForTargetOptions): Promise<CompatibleTarget>
}

export type CompatibleBrowserContext = CompatiblePagesAndTargets & {
    browser(): CompatiblePuppeteerBrowser
    /** @deprecated Use context.id to distinguish the default context. */
    isIncognito(): boolean
} & BrowserContext

export type CompatiblePuppeteerBrowser = CompatiblePagesAndTargets & {
    target(): CompatibleTarget
    /** @deprecated Use browser.connected. */
    isConnected(): boolean
    /** @deprecated Use browser.createBrowserContext(). */
    createIncognitoBrowserContext(options?: BrowserContextOptions): Promise<CompatibleBrowserContext>
    createBrowserContext(options?: BrowserContextOptions): Promise<CompatibleBrowserContext>
    browserContexts(): CompatibleBrowserContext[]
    defaultBrowserContext(): CompatibleBrowserContext
} & Browser

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

    browserContexts.call(browser).forEach(decorateContext)

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
