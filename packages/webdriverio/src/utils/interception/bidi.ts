import logger from '@testplane/wdio-logger'
import type { JsonCompatible } from '@testplane/wdio-types'
import { type local } from '@testplane/webdriver'
import { URLPattern } from 'urlpattern-polyfill'

import Timer from '../Timer.js'
import { parseOverwrite, getPatternParam } from './utils.js'
import { SESSION_BIDI_MOCKS } from '../../commands/browser/mock.js'
import type { MockFilterOptions, RequestWithOptions, RespondWithOptions } from './types.js'
import type { WaitForOptions } from '../../types.js'

const log = logger('BidiInterception')

const sessions = new WeakMap<WebdriverIO.Browser, {
    sessionId: string
    subscribed: Promise<unknown>
    mocks: Set<BidiInterception>
}>()

type RespondBody = string | JsonCompatible | Buffer
interface Overwrite {
    overwrite?: RequestWithOptions | RespondWithOptions
    once?: boolean
    abort?: boolean
}

/**
 * Network interception class based on a WebDriver Bidi implementation.
 *
 * Note: this code is executed in Node.js and in the browser, so make sure
 *       you use primitives that work in both environments.
 */
export default class BidiInterception {
    #pattern: URLPattern
    #mockId: string
    #filterOptions: MockFilterOptions
    #browser: WebdriverIO.Browser

    #eventHandler: Map<string, Function[]> = new Map()
    #restored = false
    #requestOverwrites: Overwrite[] = []
    #respondOverwrites: Overwrite[] = []
    #providedRequests = new Set<string>()
    #failedRequests = new Set<string>()
    #calls: local.NetworkResponseCompletedParameters[] = []
    #pendingCalls = new Map<string, local.NetworkResponseCompletedParameters[]>()
    #pendingRequests = new Map<string, number>()
    #pendingOperations = new Set<Promise<void>>()
    #networkError?: Error
    #beforeRequestSent = (request: local.NetworkBeforeRequestSentParameters) => {
        void this.#handleNetworkEvent(() => this.#handleBeforeRequestSent(request), request.request.request)
    }
    #responseStarted = (request: local.NetworkResponseCompletedParameters) => {
        void this.#handleNetworkEvent(() => this.#handleResponseStarted(request), request.request.request)
    }

    constructor (
        pattern: URLPattern,
        mockId: string,
        filterOptions: MockFilterOptions,
        browser: WebdriverIO.Browser
    ) {
        this.#pattern = pattern
        this.#mockId = mockId
        this.#filterOptions = filterOptions
        this.#browser = browser

        /**
         * attach network listener to this mock
         */
        browser.on('network.beforeRequestSent', this.#beforeRequestSent)
        browser.on('network.responseStarted', this.#responseStarted)
    }

    static async initiate(
        url: string,
        filterOptions: MockFilterOptions,
        browser: WebdriverIO.Browser
    ) {
        const pattern = parseUrlPattern(url)
        let session = sessions.get(browser)
        if (!session || session.sessionId !== browser.sessionId) {
            for (const mock of session?.mocks || []) {
                mock.#detach()
            }
            session = {
                sessionId: browser.sessionId,
                subscribed: browser.sessionSubscribe({
                    events: ['network.beforeRequestSent', 'network.responseStarted']
                }),
                mocks: new Set()
            }
            sessions.set(browser, session)
        }
        try {
            await session.subscribed
        } catch (error) {
            if (sessions.get(browser) === session) {
                sessions.delete(browser)
            }
            throw error
        }

        /**
         * register network intercept
         */
        const interception = await browser.networkAddIntercept({
            // Firefox can only replace bodies beforeRequestSent. Intercepting
            // its synthetic responseStarted event also races the first phase's
            // continuation, so observe those responses without blocking them.
            phases: browser.isFirefox ? ['beforeRequestSent'] : ['beforeRequestSent', 'responseStarted'],
            urlPatterns: [{
                type: 'pattern',
                protocol: getPatternParam(pattern, 'protocol'),
                hostname: getPatternParam(pattern, 'hostname'),
                pathname: getPatternParam(pattern, 'pathname'),
                port: getPatternParam(pattern, 'port'),
                search: getPatternParam(pattern, 'search')
            }]
        })

        const mock = new BidiInterception(pattern, interception.intercept, filterOptions, browser)
        session.mocks.add(mock)
        return mock
    }

    #emit (event: string, args: unknown) {
        if (!this.#eventHandler.has(event)) {
            return
        }

        const handlers = this.#eventHandler.get(event) || []
        for (const handler of handlers) {
            handler(args)
        }
    }

    #addEventHandler (event: string, handler: Function) {
        if (!this.#eventHandler.has(event)) {
            this.#eventHandler.set(event, [])
        }

        const handlers = this.#eventHandler.get(event)
        handlers?.push(handler)
    }

    #handleNetworkEvent(handler: () => Promise<unknown> | undefined, requestId: string) {
        this.#pendingRequests.set(requestId, (this.#pendingRequests.get(requestId) || 0) + 1)
        const operation = this.#runNetworkEvent(handler, requestId)
        this.#pendingOperations.add(operation)
        void operation.then(() => {
            this.#pendingOperations.delete(operation)
            const remaining = (this.#pendingRequests.get(requestId) || 1) - 1
            if (remaining > 0) {
                this.#pendingRequests.set(requestId, remaining)
                return
            }
            this.#pendingRequests.delete(requestId)
            this.#calls.push(...(this.#pendingCalls.get(requestId) || []))
            this.#pendingCalls.delete(requestId)
        })
    }

    async #runNetworkEvent(handler: () => Promise<unknown> | undefined, requestId: string) {
        try {
            await handler()
        } catch (error) {
            // EventEmitter does not await listener promises. Keep the failure
            // observable through calls/waitForResponse instead of crashing the
            // process with an unhandled rejection, and release the blocked request.
            this.#networkError ||= error instanceof Error ? error : new Error(String(error))
            this.#failedRequests.add(requestId)
            this.#providedRequests.delete(requestId)
            this.#pendingCalls.delete(requestId)
            log.error(`Failed to mock request ${requestId}: ${this.#networkError.message}`)
            try {
                await this.#browser.networkFailRequest({ request: requestId })
            } catch (abortError) {
                log.error(`Failed to abort mocked request ${requestId}: ${abortError}`)
            }
        }
    }

    #recordResponse(request: local.NetworkResponseCompletedParameters) {
        // A late browser event cannot turn a failed interception into a
        // successful call, even if clear/reset acknowledged the stored error.
        if (this.#failedRequests.has(request.request.request)) {
            return
        }
        const calls = this.#pendingCalls.get(request.request.request) || []
        calls.push(request)
        this.#pendingCalls.set(request.request.request, calls)
    }

    #handleBeforeRequestSent(request: local.NetworkBeforeRequestSentParameters) {
        /**
         * don't do anything if:
         * - request is not blocked
         * - request is not matching the pattern, e.g. a different mock is responsible for this request
         */
        if (!this.#isRequestMatching(request)) {
            return
        }

        /**
         * check if request matches filter option and do nothing if not
         */
        if (!this.#pattern.test(request.request.url) || !this.#matchesFilterOptions(request)) {
            return this.#browser.networkContinueRequest({
                request: request.request.request
            })
        }

        this.#emit('request', request)
        const responseOverwrite = this.#respondOverwrites[0]
        if (
            responseOverwrite?.overwrite &&
            'fetchResponse' in responseOverwrite.overwrite &&
            responseOverwrite.overwrite.fetchResponse === false &&
            this.#requestOverwrites.length === 0
        ) {
            if (responseOverwrite.once) {
                this.#respondOverwrites.shift()
            }
            this.#providedRequests.add(request.request.request)
            this.#emit('overwrite', request)
            return this.#browser.networkProvideResponse({
                request: request.request.request,
                ...parseOverwrite(responseOverwrite.overwrite, request)
            })
        }

        const hasRequestOverwrites = this.#requestOverwrites.length > 0
        if (hasRequestOverwrites) {
            const { overwrite, abort } = this.#requestOverwrites[0].once
                ? this.#requestOverwrites.shift() || {}
                : this.#requestOverwrites[0]

            if (abort) {
                this.#emit('fail', request.request.request)
                return this.#browser.networkFailRequest({ request: request.request.request })
            }

            this.#emit('overwrite', request)
            return this.#browser.networkContinueRequest({
                request: request.request.request,
                ...(overwrite ? parseOverwrite(overwrite, request) : {})
            })
        }

        this.#emit('continue', request.request.request)
        return this.#browser.networkContinueRequest({
            request: request.request.request
        })
    }

    #handleResponseStarted(request: local.NetworkResponseCompletedParameters) {
        // Providing a complete response before the request is sent still emits
        // response events. Record that response, but never consume another
        // respondOnce overwrite or provide its body a second time.
        if (!this.#restored && this.#providedRequests.has(request.request.request)) {
            this.#recordResponse(request)
            // Chromium can report isBlocked from the configured intercepts,
            // even though provideResponse already fulfilled this request.
            // Keep ownership until the other listeners saw this event.
            queueMicrotask(() => {
                this.#providedRequests.delete(request.request.request)
            })
            return
        }

        // Firefox only intercepts the request phase, but spies still need real
        // response data and response filters without resuming unblocked events.
        if (this.#browser.isFirefox && !request.isBlocked) {
            if (!this.#restored && this.#pattern.test(request.request.url) && this.#matchesFilterOptions(request)) {
                this.#recordResponse(request)
            }
            return
        }

        /**
         * don't do anything if:
         * - request is not blocked
         * - request is not matching the pattern, e.g. a different mock is responsible for this request
         */
        if (!this.#isRequestMatching(request)) {
            return
        }

        /**
         * continue mock if not matching filter
         */
        if (!this.#pattern.test(request.request.url) || !this.#matchesFilterOptions(request)) {
            this.#emit('continue', request.request.request)
            return this.#browser.networkProvideResponse({
                request: request.request.request
            }).catch(this.#handleNetworkProvideResponseError)
        }

        /**
         * Publish the call only after its protocol operations have settled.
         */
        this.#recordResponse(request)

        /**
         * continue response as mock has no respond overwrites
         */
        if (
            this.#respondOverwrites.length === 0 ||
            !this.#respondOverwrites[0].overwrite ||
            ('fetchResponse' in this.#respondOverwrites[0].overwrite &&
                this.#respondOverwrites[0].overwrite.fetchResponse === false)
        ) {
            this.#emit('continue', request.request.request)
            return this.#browser.networkProvideResponse({
                request: request.request.request
            }).catch(this.#handleNetworkProvideResponseError)
        }

        const { overwrite } = this.#respondOverwrites[0].once
            ? this.#respondOverwrites.shift() || {}
            : this.#respondOverwrites[0]

        /**
         * continue request (possibly with overwrites)
         */
        if (overwrite) {
            this.#emit('overwrite', request)
            return this.#browser.networkProvideResponse({
                request: request.request.request,
                ...parseOverwrite(overwrite, request)
            }).catch(this.#handleNetworkProvideResponseError)
        }

        /**
         * continue request as is
         */
        this.#emit('continue', request.request.request)
        return this.#browser.networkProvideResponse({
            request: request.request.request
        }).catch(this.#handleNetworkProvideResponseError)
    }

    /**
     * It appears that the networkProvideResponse method may throw an "no such request" error even though the request
     * is marked as "blocked", in these cases we can safely ignore the error.
     * @param err Bidi message error
     */
    #handleNetworkProvideResponseError(err: Error) {
        if (err.message.endsWith('no such request')) {
            return
        }

        throw err
    }

    #isRequestMatching<T extends local.NetworkBeforeRequestSentParameters | local.NetworkResponseCompletedParameters> (request: T) {
        if (!request.isBlocked || this.#restored) {
            return false
        }

        // BiDi URL components are exact matches, so wildcard components are
        // filtered locally. Only one mock may resume a blocked request, even
        // when several broad protocol intercepts captured it.
        const mocks = [...(sessions.get(this.#browser)?.mocks || [])].filter(mock => (
            !mock.#restored && (!request.intercepts || request.intercepts.includes(mock.#mockId))
        ))
        const owner = mocks.find(mock => mock.#providedRequests.has(request.request.request)) || mocks.find(mock => (
            mock.#pattern.test(request.request.url) && mock.#matchesFilterOptions(request)
        )) || mocks[0]
        return owner === this
    }

    #matchesFilterOptions<T extends local.NetworkBeforeRequestSentParameters | local.NetworkResponseCompletedParameters> (request: T) {
        let isRequestMatching = true

        if (isRequestMatching && this.#filterOptions.method) {
            isRequestMatching = typeof this.#filterOptions.method === 'function'
                ? this.#filterOptions.method(request.request.method)
                : this.#filterOptions.method.toLowerCase() === request.request.method.toLowerCase()
        }

        if (isRequestMatching && this.#filterOptions.requestHeaders) {
            isRequestMatching = typeof this.#filterOptions.requestHeaders === 'function'
                ? this.#filterOptions.requestHeaders(request.request.headers.reduce((acc, { name, value }) => {
                    acc[name] = value.type === 'string' ? value.value : Buffer.from(value.value, 'base64').toString()
                    return acc
                }, {} as Record<string, string>))
                : Object.entries(this.#filterOptions.requestHeaders).every(([key, value]) => {
                    const header = request.request.headers.find(({ name }) => name === key)
                    if (!header) {
                        return false
                    }

                    return header.value.type === 'string'
                        ? header.value.value === value
                        : Buffer.from(header.value.value, 'base64').toString() === value
                })
        }

        if (isRequestMatching && this.#filterOptions.responseHeaders && 'response' in request) {
            isRequestMatching = typeof this.#filterOptions.responseHeaders === 'function'
                ? this.#filterOptions.responseHeaders(request.response.headers.reduce((acc, { name, value }) => {
                    acc[name] = value.type === 'string' ? value.value : Buffer.from(value.value, 'base64').toString()
                    return acc
                }, {} as Record<string, string>))
                : Object.entries(this.#filterOptions.responseHeaders).every(([key, value]) => {
                    const header = request.response.headers.find(({ name }) => name === key)
                    if (!header) {
                        return false
                    }

                    return header.value.type === 'string'
                        ? header.value.value === value
                        : Buffer.from(header.value.value, 'base64').toString() === value
                })
        }

        if (isRequestMatching && this.#filterOptions.statusCode && 'response' in request) {
            isRequestMatching = typeof this.#filterOptions.statusCode === 'function'
                ? this.#filterOptions.statusCode(request.response.status)
                : this.#filterOptions.statusCode === request.response.status
        }

        return isRequestMatching
    }

    #setOverwrite = (overwriteProp: Overwrite[], { overwrite, abort, once }: Overwrite) => {
        return once
            ? [
                ...overwriteProp.filter(({ once }) => once),
                { overwrite, abort, once }
            ]
            : [{ overwrite, abort }]
    }

    /**
     * allows access to all requests made with given pattern
     */
    get calls(): local.NetworkResponseCompletedParameters[] {
        if (this.#networkError) {
            throw this.#networkError
        }
        return this.#calls
    }

    /**
     * Resets all information stored in the `mock.calls` set.
     */
    clear() {
        this.#calls = []
        this.#pendingCalls.clear()
        this.#networkError = undefined
        return this
    }

    /**
     * Does what `mock.clear()` does and makes removes custom request overrides
     * and response overwrites
     */
    reset() {
        this.clear()
        this.#respondOverwrites = []
        this.#requestOverwrites = []
        return this
    }

    #detach() {
        this.#browser.off('network.beforeRequestSent', this.#beforeRequestSent)
        this.#browser.off('network.responseStarted', this.#responseStarted)
        this.#restored = true
        this.#providedRequests.clear()
    }

    /**
     * Does everything that `mock.reset()` does, and also
     * removes any mocked return values or implementations.
     * Restored mock does not emit events and could not mock responses
     */
    async restore() {
        // Stop applying overrides, but preserve in-flight failures until after
        // cleanup. Clearing the error here could turn a failed mock into a pass.
        this.#respondOverwrites = []
        this.#requestOverwrites = []
        // Keep listeners alive while the remote end removes the intercept:
        // requests already blocked by it still need to be continued.
        if (this.#mockId) {
            await this.#browser.networkRemoveIntercept({ intercept: this.#mockId })
        }
        this.#detach()
        sessions.get(this.#browser)?.mocks.delete(this)
        // Includes requests received while networkRemoveIntercept was pending.
        await Promise.all(this.#pendingOperations)
        const handle = await this.#browser.getWindowHandle()

        log.trace(`Restoring mock for ${handle}`)
        SESSION_BIDI_MOCKS[handle]?.delete(this)

        if (this.#networkError) {
            throw this.#networkError
        }
        this.reset()
        return this
    }

    /**
     * Always use request modification for the next request done by the browser.
     * @param payload  payload to overwrite the request
     * @param once     apply overwrite only once for the next request
     * @returns        this instance to chain commands
     */
    request(overwrite: RequestWithOptions, once?: boolean) {
        this.#ensureNotRestored()
        if (this.#respondOverwrites.some(({ overwrite }) => overwrite && 'fetchResponse' in overwrite && overwrite.fetchResponse === false)) {
            throw new Error('Request overwrites cannot be combined with mock.respond when it does not fetch the real response')
        }
        this.#requestOverwrites = this.#setOverwrite(this.#requestOverwrites, { overwrite, once })
        return this
    }

    /**
     * alias for `mock.request(…, true)`
     */
    requestOnce(payload: RequestWithOptions) {
        return this.request(payload, true)
    }

    /**
     * Always respond with same overwrite
     * @param {*}       payload  payload to overwrite the response
     * @param {*}       params   additional respond parameters to overwrite
     * @param {boolean} once     apply overwrite only once for the next request
     * @returns                  this instance to chain commands
     */
    respond(payload: RespondBody, params: Omit<RespondWithOptions, 'body'> = {}, once?: boolean) {
        this.#ensureNotRestored()
        if (this.#browser.isFirefox && params.fetchResponse === true) {
            throw new Error('Firefox does not support mock.respond with fetchResponse: true; response bodies can only be provided before the request is sent')
        }
        const fetchResponse = params.fetchResponse ?? !this.#browser.isFirefox
        if (!fetchResponse && (this.#filterOptions.responseHeaders || this.#filterOptions.statusCode !== undefined)) {
            throw new Error('Response filters (responseHeaders and statusCode) cannot be used when mock.respond does not fetch the real response')
        }
        if (!fetchResponse && typeof params.statusCode === 'function') {
            throw new Error('A statusCode function requires the real response; use a numeric statusCode when mock.respond does not fetch the real response')
        }
        if (!fetchResponse && this.#requestOverwrites.some(({ overwrite }) => overwrite)) {
            throw new Error('Request overwrites cannot be combined with mock.respond when it does not fetch the real response')
        }
        const body = typeof payload === 'string'
            ? payload
            : globalThis.Buffer && globalThis.Buffer.isBuffer(payload)
                ? payload.toString('base64')
                : JSON.stringify(payload)
        const overwrite: RespondWithOptions = { body, ...params, fetchResponse }
        this.#respondOverwrites = this.#setOverwrite(this.#respondOverwrites, { overwrite, once })
        return this
    }

    /**
     * alias for `mock.respond(…, true)`
     */
    respondOnce(payload: RespondBody, params: Omit<RespondWithOptions, 'body'> = {}) {
        return this.respond(payload, params, true)
    }

    /**
     * Abort the request with an error code
     * @param {string} errorReason  error code of the response
     * @param {boolean} once        if request should be aborted only once for the next request
     */
    abort(once?: boolean) {
        this.#ensureNotRestored()
        this.#requestOverwrites = this.#setOverwrite(this.#requestOverwrites, { abort: true, once })
        return this
    }

    /**
     * alias for `mock.abort(true)`
     */
    abortOnce() {
        return this.abort(true)
    }

    /**
     * Redirect request to another URL
     * @param {string} redirectUrl  URL to redirect to
     * @param {boolean} sticky      if request should be redirected for all following requests
     */
    redirect(redirectUrl: string, once?: boolean) {
        this.#ensureNotRestored()
        const requestWith = { url: redirectUrl }
        this.request(requestWith, once)
        return this
    }

    /**
     * alias for `mock.redirect(…, true)`
     */
    redirectOnce(redirectUrl: string) {
        return this.redirect(redirectUrl, true)
    }

    on(event: 'request', callback: (request: local.NetworkBeforeRequestSentParameters) => void): BidiInterception
    on(event: 'match', callback: (match: local.NetworkBeforeRequestSentParameters) => void): BidiInterception
    on(event: 'continue', callback: (requestId: string) => void): BidiInterception
    on(event: 'fail', callback: (requestId: string) => void): BidiInterception
    on(event: 'overwrite', callback: (response: local.NetworkResponseCompletedParameters) => void): BidiInterception
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, callback: (...args: any[]) => void): BidiInterception {
        this.#addEventHandler(event, callback)
        return this
    }

    #ensureNotRestored() {
        if (this.#restored) {
            throw new Error('This can\'t be done on restored mock')
        }
    }

    waitForResponse ({
        timeout = this.#browser.options.waitforTimeout,
        interval = this.#browser.options.waitforInterval,
        timeoutMsg,
    }: WaitForOptions = {}) {
        /*!
         * ensure that timeout and interval are set properly
         */
        if (typeof timeout !== 'number') {
            timeout = this.#browser.options.waitforTimeout as number
        }

        if (typeof interval !== 'number') {
            interval = this.#browser.options.waitforInterval as number
        }

        /* istanbul ignore next */
        const fn = async () => this.calls && (await this.calls).length > 0
        const timer = new Timer(interval, timeout, fn, true) as unknown as Promise<boolean>

        return this.#browser.call(() => timer.catch((e) => {
            if (e.message === 'timeout') {
                if (typeof timeoutMsg === 'string') {
                    throw new Error(timeoutMsg)
                }
                throw new Error(`waitForResponse timed out after ${timeout}ms`)
            }

            throw new Error(`waitForResponse failed with the following reason: ${(e && e.message) || e}`)
        }))
    }
}

export function parseUrlPattern(url: string | URLPattern) {
    /**
     * return early if it's already a URLPattern
     */
    if (typeof url === 'object') {
        return url
    }

    /**
     * parse URLPattern from absolute URL
     */
    if (url.startsWith('http')) {
        return new URLPattern(url)
    }

    /**
     * parse URLPattern from relative URL
     */
    return new URLPattern({
        pathname: url
    })
}
