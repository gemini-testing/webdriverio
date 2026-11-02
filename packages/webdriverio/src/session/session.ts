const sessionManager = new Map<string, Map<WebdriverIO.Browser, SessionManager>>()

const listenerRegisteredSession = new WeakMap<WebdriverIO.Browser, Map<string, SessionManager>>()

export class SessionManager {
    #browser: WebdriverIO.Browser
    #scope: string

    /**
     * SessionManager constructor
     * Logic in here should be executed for all session singletons, e.g. remove instance
     * of itself when a session was deleted.
     * @param browser WebdriverIO.Browser
     * @param scope   scope of the session manager, e.g. context, network etc.
     */
    constructor(browser: WebdriverIO.Browser, scope: string) {
        this.#browser = browser
        this.#scope = scope
        let registeredManagers = listenerRegisteredSession.get(browser)
        if (!registeredManagers) {
            registeredManagers = new Map()
            listenerRegisteredSession.set(browser, registeredManagers)
        }
        if (!registeredManagers.has(scope)) {
            this.#browser.on('command', this.#onCommand)
            registeredManagers.set(scope, this)
        }
    }

    #onCommand = (ev: { command: string }) => {
        if (ev.command === 'deleteSession') {
            this.removeListeners()
            const sessionManagerInstances = sessionManager.get(this.#scope)
            if (sessionManagerInstances?.get(this.#browser) === this) {
                sessionManagerInstances.delete(this.#browser)
            }
        }
    }

    removeListeners() {
        this.#browser.off('command', this.#onCommand)
        const registeredManagers = listenerRegisteredSession.get(this.#browser)
        if (registeredManagers?.get(this.#scope) === this) {
            registeredManagers.delete(this.#scope)
        }
    }

    initialize(): unknown {
        return undefined as unknown
    }

    /**
     * check if session manager should be enabled, if
     */
    isEnabled() {
        return (
            // we are in a Bidi session
            this.#browser.isBidi &&
            // we are not running unit tests
            !process.env.WDIO_UNIT_TESTS
        )
    }

    static getSessionManager<T extends SessionManager>(browser: WebdriverIO.Browser, Manager: new (browser: WebdriverIO.Browser) => T): T {
        const scope = Manager.name
        let sessionManagerInstances = sessionManager.get(scope)
        if (!sessionManagerInstances) {
            sessionManagerInstances = new Map()
            sessionManager.set(scope, sessionManagerInstances)
        }

        let sessionManagerInstance = sessionManagerInstances.get(browser)
        if (!sessionManagerInstance) {
            sessionManagerInstance = new Manager(browser)
            sessionManagerInstances.set(browser, sessionManagerInstance)
        }

        return sessionManagerInstance as T
    }
}
