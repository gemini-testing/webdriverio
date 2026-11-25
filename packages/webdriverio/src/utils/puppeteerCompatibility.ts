import type {
    AwaitablePredicate, Browser, BrowserContext, BrowserContextEvents, BrowserContextOptions, BrowserEvents, ConsoleMessage,
    ConsoleMessageType, CreatePageOptions, EventsWithWildcard, EventType, Frame, HTTPRequest, HTTPResponse, Page, PageEvents, Target,
    WaitForTargetOptions, WaitTimeoutOptions
} from 'puppeteer-core'

// Narrow the events on this connection only, keeping Puppeteer's other events (including
// newer ones) and fluent return types. No declaration merging with puppeteer-core.
interface CompatibleEventPayloads {
    targetcreated: CompatibleTarget
    targetchanged: CompatibleTarget
    targetdestroyed: CompatibleTarget
    popup: CompatiblePage | null
    pageerror: Error
    frameattached: CompatibleFrame
    framedetached: CompatibleFrame
    framenavigated: CompatibleFrame
    request: CompatibleRequest
    requestfinished: CompatibleRequest
    requestfailed: CompatibleRequest
    requestservedfromcache: CompatibleRequest
    response: CompatibleResponse
    console: Omit<ConsoleMessage, 'type'> & { type(): ConsoleMessageType | 'warning' }
}

type EventsOf<Events> = { [K in keyof Events]: K extends keyof CompatibleEventPayloads ? CompatibleEventPayloads[K] : Events[K] }
type EventMap = Record<EventType, unknown>
type Handler<Events extends EventMap, K extends keyof Events> = (
    value: EventsWithWildcard<EventsOf<Events>>[K], data: K extends '*' ? Events[keyof Events] : never
) => void
type Listen<Events extends EventMap, Self> = <K extends keyof Events>(event: K, listener: Handler<Events, K>) => Self
type Unlisten<Events extends EventMap, Self> = <K extends keyof Events>(event: K, listener?: Handler<Events, K>) => Self

interface CompatibleFrame extends Frame {
    page(): CompatiblePage
    parentFrame(): CompatibleFrame | null
    childFrames(): CompatibleFrame[]
}

interface CompatibleRequest extends HTTPRequest {
    frame(): CompatibleFrame | null
    response(): CompatibleResponse | null
    redirectChain(): CompatibleRequest[]
}

interface CompatibleResponse extends HTTPResponse {
    frame(): CompatibleFrame | null
    request(): CompatibleRequest
}

interface CompatiblePage extends Page {
    on: Listen<PageEvents, this>
    once: Listen<PageEvents, this>
    off: Unlisten<PageEvents, this>
    browser(): CompatiblePuppeteerBrowser
    browserContext(): CompatibleBrowserContext
    target(): CompatibleTarget
    mainFrame(): CompatibleFrame
    frames(): CompatibleFrame[]
    waitForFrame(urlOrPredicate: string | AwaitablePredicate<CompatibleFrame>, options?: WaitTimeoutOptions): Promise<CompatibleFrame>
    waitForRequest(urlOrPredicate: string | AwaitablePredicate<CompatibleRequest>, options?: WaitTimeoutOptions): Promise<CompatibleRequest>
    waitForResponse(urlOrPredicate: string | AwaitablePredicate<CompatibleResponse>, options?: WaitTimeoutOptions): Promise<CompatibleResponse>
}

interface CompatibleTarget extends Target {
    browser(): CompatiblePuppeteerBrowser
    browserContext(): CompatibleBrowserContext
    page(): Promise<CompatiblePage | null>
    asPage(): Promise<CompatiblePage>
    opener(): CompatibleTarget | undefined
}

type WaitForTarget = (predicate: (target: CompatibleTarget) => boolean | Promise<boolean>, options?: WaitForTargetOptions) => Promise<CompatibleTarget>

// Redeclare the native members rather than intersecting signatures: ReturnType must
// see the decorated result, and the objects still carry Puppeteer's nominal types.
export interface CompatibleBrowserContext extends BrowserContext {
    on: Listen<BrowserContextEvents, this>
    once: Listen<BrowserContextEvents, this>
    off: Unlisten<BrowserContextEvents, this>
    newPage(options?: CreatePageOptions): Promise<CompatiblePage>
    pages(includeAll?: boolean): Promise<CompatiblePage[]>
    targets(): CompatibleTarget[]
    waitForTarget: WaitForTarget
    browser(): CompatiblePuppeteerBrowser
    /** @deprecated Use context.id to distinguish the default context. */
    isIncognito(): boolean
}

export interface CompatiblePuppeteerBrowser extends Browser {
    on: Listen<BrowserEvents, this>
    once: Listen<BrowserEvents, this>
    off: Unlisten<BrowserEvents, this>
    newPage(options?: CreatePageOptions): Promise<CompatiblePage>
    pages(includeAll?: boolean): Promise<CompatiblePage[]>
    targets(): CompatibleTarget[]
    waitForTarget: WaitForTarget
    target(): CompatibleTarget
    /** @deprecated Use browser.connected. */
    isConnected(): boolean
    /** @deprecated Use browser.createBrowserContext(). */
    createIncognitoBrowserContext(options?: BrowserContextOptions): Promise<CompatibleBrowserContext>
    createBrowserContext(options?: BrowserContextOptions): Promise<CompatibleBrowserContext>
    browserContexts(): CompatibleBrowserContext[]
    defaultBrowserContext(): CompatibleBrowserContext
}

const adaptedBrowsers = new WeakSet<Browser>()
const adaptedTargets = new WeakSet<Target>()
const adaptedPages = new WeakSet<Page>()

function asPageError(value: unknown): Error {
    if (value instanceof Error) {
        return value
    }
    try {
        const message = value && typeof value === 'object' && 'message' in value ? value.message : value
        return new Error(String(message), { cause: value })
    } catch {
        // A thrown object need not have a working toString (or even a prototype).
        return new Error('Non-Error exception', { cause: value })
    }
}

function adaptPage(page: Page): Page {
    if (adaptedPages.has(page)) {
        return page
    }
    adaptedPages.add(page)

    const { emit } = page
    // Convert payloads at emission so that request interception, waitForRequest/
    // waitForResponse predicates and listener removal still run in Puppeteer itself.
    page.emit = (event, value) => {
        if (event === 'pageerror') {
            return emit.call(page, event, asPageError(value))
        }
        if (event === 'popup' && value) {
            adaptPage(value as Page)
        } else if (event === 'console') {
            const message = value as ConsoleMessage
            if (message.type() === 'warn') {
                Object.defineProperty(message, 'type', { configurable: true, value: () => 'warning' })
            }
        } else if (event === 'request' || event === 'response' || event === 'requestfinished' ||
            event === 'requestfailed' || event === 'requestservedfromcache') {
            const data = value as HTTPRequest | HTTPResponse
            const url = data.url()
            const hash = url.indexOf('#')
            if (hash !== -1 && /^https?:\/\//i.test(url)) {
                const networkUrl = url.slice(0, hash)
                Object.defineProperty(data, 'url', { configurable: true, value: () => networkUrl })
            }
        }
        return emit.call(page, event, value)
    }
    return page
}

function adaptTarget(target: Target): Target {
    if (!adaptedTargets.has(target)) {
        const { page, asPage } = target
        target.page = async () => {
            const result = await page.call(target)
            return result && adaptPage(result)
        }
        target.asPage = async () => adaptPage(await asPage.call(target))
        adaptedTargets.add(target)
    }
    return target
}

/** Adapt the owned Puppeteer connection, never another connection or its prototypes. */
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
    const { createBrowserContext, browserContexts, defaultBrowserContext, targets, emit } = browser
    const createContext = async (options?: BrowserContextOptions) => (
        decorateContext(await createBrowserContext.call(browser, options))
    )

    browserContexts.call(browser).forEach(decorateContext)
    // CDP opens pages through their targets, including context.newPage() and
    // context.pages(). Decorate lazily; do not attach a session to every tab.
    browser.targets = () => targets.call(browser).map(adaptTarget)
    browser.emit = (event, value) => {
        if (event === 'targetcreated' || event === 'targetchanged' || event === 'targetdestroyed') {
            adaptTarget(value as Target)
        }
        return emit.call(browser, event, value)
    }

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
