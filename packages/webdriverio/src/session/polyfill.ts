import logger from '@testplane/wdio-logger'
import type { local } from '@testplane/webdriver'

import { SessionManager } from './session.js'
import { createFunctionDeclarationFromString } from '../utils/index.js'

export function getPolyfillManager(browser: WebdriverIO.Browser) {
    return SessionManager.getSessionManager(browser, PolyfillManager)
}

const log = logger('webdriverio:PolyfillManager')

type WebdriverioPolyfillGlobal = {
    __name: (target: unknown, fnName: unknown) => unknown
}

/**
 * A polyfill to set `__name` to the global scope which is needed for WebdriverIO to properly
 * execute custom (preload) scripts. When using `tsx` Esbuild runs some optimizations which
 * assume that the file contains these global variables. This is a workaround until this issue
 * is fixed.
 *
 * @see https://github.com/evanw/esbuild/issues/2605
 */
export const polyfillFn = function webdriverioPolyfill () {
    ;(
        ((typeof globalThis === 'object' && globalThis) ||
            (typeof window === 'object' && window)) as unknown as WebdriverioPolyfillGlobal
    ).__name = function (target: unknown, fnName: unknown) {
        return Object.defineProperty(target, 'name', { value: fnName, configurable: true })
    }
}

/**
 * This class is responsible for setting polyfill scripts in the browser.
 */
export class PolyfillManager extends SessionManager {
    #initialize: Promise<boolean>
    #browser: WebdriverIO.Browser
    #scriptsRegisteredInContexts: Set<string> = new Set()
    #onContextCreated = (context: Pick<local.BrowsingContextInfo, 'context' | 'parent'>) => (
        this.#registerScripts(context)?.catch((error: Error) => {
            log.warn(`Unable to register polyfill in context ${context.context}: ${error.message}`)
        })
    )

    constructor(browser: WebdriverIO.Browser) {
        super(browser, PolyfillManager.name)
        this.#browser = browser

        /**
         * don't run setup when Bidi is not supported or running unit tests
         */
        if (!this.isEnabled()) {
            this.#initialize = Promise.resolve(true)
            return
        }

        this.#browser.on('browsingContext.contextCreated', this.#onContextCreated)

        /**
         * apply polyfill script for upcoming as well as current execution context
         */
        this.#initialize = Promise.all([
            this.#browser.browsingContextGetTree({}).then(({ contexts }) => {
                return Promise.all(contexts.map((context) => this.#registerScripts(context)))
            }),
            this.#browser.sessionSubscribe({
                events: ['browsingContext.contextCreated']
            })
        ]).then(() => true, () => false)
    }

    removeListeners() {
        super.removeListeners()
        this.#browser.off('browsingContext.contextCreated', this.#onContextCreated)
    }

    #registerScripts = (context: Pick<local.BrowsingContextInfo, 'context' | 'parent'>) => {
        if (this.#scriptsRegisteredInContexts.has(context.context)) {
            return
        }

        const functionDeclaration = createFunctionDeclarationFromString(polyfillFn)
        log.info(`Adding polyfill script to context with id ${context.context}`)
        this.#scriptsRegisteredInContexts.add(context.context)
        return Promise.all([
            !context.parent
                ? this.#browser.scriptAddPreloadScript({
                    functionDeclaration,
                    contexts: [context.context]
                })
                : Promise.resolve(),
            this.#browser.scriptCallFunction({
                functionDeclaration,
                target: context,
                awaitPromise: false
            })
        ]).catch((error: Error) => {
            this.#scriptsRegisteredInContexts.delete(context.context)
            if (/no such frame|no such browsing context/.test(error.message)) {
                // A contextCreated event can race with closing that tab. Both
                // preload registration and immediate injection can then fail.
                log.debug(`Context ${context.context} was destroyed before polyfill registration`)
                return
            }
            throw error
        })
    }

    async initialize () {
        return this.#initialize
    }
}
