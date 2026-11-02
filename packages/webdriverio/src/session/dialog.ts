import { type local } from '@testplane/webdriver'
import logger from '@testplane/wdio-logger'
import { SessionManager } from './session.js'

const log = logger('webdriverio:DialogManager')

export function getDialogManager(browser: WebdriverIO.Browser) {
    return SessionManager.getSessionManager(browser, DialogManager)
}

/**
 * Dispatch dialog events to user listeners, or dismiss unhandled dialogs.
 */
export class DialogManager extends SessionManager {
    #browser: WebdriverIO.Browser
    #initialize: Promise<boolean>

    constructor(browser: WebdriverIO.Browser) {
        super(browser, DialogManager.name)
        this.#browser = browser

        /**
         * don't run setup when Bidi is not supported or running unit tests
         */
        if (!this.isEnabled()) {
            this.#initialize = Promise.resolve(true)
            return
        }

        /**
         * listen on required bidi events
         */
        this.#initialize = this.#browser.sessionSubscribe({
            events: ['browsingContext.userPromptOpened']
        }).then(() => true, () => false)
        this.#browser.on('browsingContext.userPromptOpened', this.#handleUserPrompt)
    }

    removeListeners(): void {
        super.removeListeners()
        this.#browser.off('browsingContext.userPromptOpened', this.#handleUserPrompt)
    }

    async initialize () {
        return this.#initialize
    }

    #handleUserPrompt = async (event: local.BrowsingContextUserPromptOpenedParameters) => {
        // Query the live listener count: once(), addListener(), removeAllListeners()
        // and removing one of several listeners cannot be represented by a boolean.
        if (this.#browser.listenerCount('dialog') === 0) {
            return this.#browser.browsingContextHandleUserPrompt({
                accept: false,
                context: event.context
            }).catch((error: Error) => {
                // EventEmitter does not await async listeners. Report the failure
                // instead of leaking an unhandled rejection from automatic handling.
                log.warn(`Unable to auto-dismiss dialog in context ${event.context}: ${error.message}`)
            })
        }

        this.#browser.emit('dialog', new Dialog(event, this.#browser))
    }
}

export class Dialog {
    #browser: WebdriverIO.Browser
    #context: string
    #message: string
    #defaultValue?: string
    #type: local.BrowsingContextUserPromptOpenedParameters['type']

    constructor (event: local.BrowsingContextUserPromptOpenedParameters, browser: WebdriverIO.Browser) {
        this.#message = event.message
        this.#defaultValue = event.defaultValue
        this.#type = event.type
        this.#context = event.context
        this.#browser = browser
    }

    message() {
        return this.#message
    }

    defaultValue() {
        return this.#defaultValue
    }

    type() {
        return this.#type
    }

    /**
     * Returns when the dialog has been accepted.
     *
     * @alias dialog.accept
     * @param {string=} promptText  A text to enter into prompt. Does not cause any effects if the dialog's type is not prompt.
     * @returns {Promise<void>}
     */
    async accept(userText?: string) {
        await this.#browser.browsingContextHandleUserPrompt({
            accept: true,
            context: this.#context,
            userText
        })
    }

    async dismiss() {
        await this.#browser.browsingContextHandleUserPrompt({
            accept: false,
            context: this.#context
        })
    }
}
