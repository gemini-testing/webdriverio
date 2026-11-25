import logger from '@testplane/wdio-logger'
import { isFirefoxSession } from '@testplane/wdio-utils'
import type { JsonCompatible } from '@testplane/wdio-types'
import { type local } from '@testplane/webdriver'
import { URLPattern } from 'urlpattern-polyfill'

import Timer from '../Timer.js'
import { parseOverwrite, getPatternParam } from './utils.js'
import type { BidiResponseMetadata, MockFilterOptions, RequestWithOptions, RespondWithOptions } from './types.js'
import type { WaitForOptions } from '../../types.js'

const log = logger('BidiInterception')

type NetworkEvent = local.NetworkBeforeRequestSentParameters | local.NetworkResponseCompletedParameters
type InterceptionPhase = 'request' | 'response'
interface EventRoute {
    owner?: BidiInterception
    matches: Set<BidiInterception>
    filterErrors: Map<BidiInterception, Error>
    completion: Promise<void>
    complete: () => void
    error?: Error
}

const sessions = new WeakMap<WebdriverIO.Browser, {
    sessionId: string
    subscribed: Promise<unknown>
    mocks: Set<BidiInterception>
    routes: WeakMap<local.NetworkRequestData, Partial<Record<InterceptionPhase, EventRoute>>>
    pendingRequestRoutes: Map<string, EventRoute>
}>()

type RespondBody = string | JsonCompatible | Buffer
type BodyCallback = (request: BidiResponseMetadata) => RespondBody | Promise<RespondBody>
interface ResponseOverwrite extends Omit<RespondWithOptions, 'body'> {
    body: local.NetworkBytesValue | BodyCallback
    fetchResponse: boolean
}
interface Overwrite<T> {
    overwrite?: T
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
    #isFirefox: boolean

    #eventHandler: Map<string, Function[]> = new Map()
    #restored = false
    #requestOverwrites: Overwrite<RequestWithOptions>[] = []
    #respondOverwrites: Overwrite<ResponseOverwrite>[] = []
    #providedRequests = new Set<string>()
    #failedRequests = new Set<string>()
    #calls: local.NetworkResponseCompletedParameters[] = []
    #pendingCalls = new Map<string, local.NetworkResponseCompletedParameters[]>()
    #pendingRequests = new Map<string, number>()
    #pendingOperations = new Set<Promise<Error | undefined>>()
    #networkError?: Error
    #beforeRequestSent = (request: local.NetworkBeforeRequestSentParameters) => {
        void this.#handleNetworkEvent(() => this.#handleBeforeRequestSent(request), request, 'request')
    }
    #responseStarted = (request: local.NetworkResponseCompletedParameters) => {
        void this.#handleNetworkEvent(() => this.#handleResponseStarted(request), request, 'response')
    }

    constructor (
        pattern: URLPattern,
        mockId: string,
        filterOptions: MockFilterOptions,
        browser: WebdriverIO.Browser,
        isFirefox: boolean
    ) {
        this.#pattern = pattern
        this.#mockId = mockId
        this.#filterOptions = filterOptions
        this.#browser = browser
        this.#isFirefox = isFirefox

        /**
         * attach network listener to this mock
         */
        browser.on('network.beforeRequestSent', this.#beforeRequestSent)
        browser.on('network.responseStarted', this.#responseStarted)
    }

    static #getSession(browser: WebdriverIO.Browser) {
        const session = sessions.get(browser)
        if (session && session.sessionId !== browser.sessionId) {
            // The remote end discarded these intercepts with the old session.
            for (const mock of session.mocks) {
                mock.#detach()
            }
            sessions.delete(browser)
            return
        }
        return session
    }

    static getSessionMocks(browser: WebdriverIO.Browser) {
        return BidiInterception.#getSession(browser)?.mocks || []
    }

    static async initiate(
        url: string,
        filterOptions: MockFilterOptions,
        browser: WebdriverIO.Browser
    ) {
        const pattern = parseUrlPattern(url)
        let session = BidiInterception.#getSession(browser)
        if (!session) {
            session = {
                sessionId: browser.sessionId,
                subscribed: browser.sessionSubscribe({
                    events: ['network.beforeRequestSent', 'network.responseStarted']
                }),
                mocks: new Set(),
                routes: new WeakMap(),
                pendingRequestRoutes: new Map()
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
        // reloadSession replaces negotiated capabilities on the same browser object.
        const isFirefox = isFirefoxSession(browser.capabilities)
        const interception = await browser.networkAddIntercept({
            // Firefox can only replace bodies beforeRequestSent. Intercepting
            // its synthetic responseStarted event also races the first phase's
            // continuation, so observe those responses without blocking them.
            phases: isFirefox ? ['beforeRequestSent'] : ['beforeRequestSent', 'responseStarted'],
            urlPatterns: [{
                type: 'pattern',
                protocol: getPatternParam(pattern, 'protocol'),
                hostname: getPatternParam(pattern, 'hostname'),
                pathname: getPatternParam(pattern, 'pathname'),
                port: getPatternParam(pattern, 'port'),
                search: getPatternParam(pattern, 'search')
            }]
        })

        const mock = new BidiInterception(pattern, interception.intercept, filterOptions, browser, isFirefox)
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

    #handleNetworkEvent(handler: () => Promise<unknown> | undefined, request: NetworkEvent, phase: InterceptionPhase) {
        const requestData = request.request
        const requestId = requestData.request
        const session = BidiInterception.#getSession(this.#browser)
        if (!session || this.#restored) {
            return
        }
        this.#pendingRequests.set(requestId, (this.#pendingRequests.get(requestId) || 0) + 1)
        const operation = this.#runNetworkEvent(handler, request, phase)
        this.#pendingOperations.add(operation)
        void operation.then((error) => {
            this.#pendingOperations.delete(operation)
            const route = session?.routes.get(requestData)?.[phase]
            if (route?.owner === this) {
                route.error = error
                route.complete()
                if (session?.pendingRequestRoutes.get(requestId) === route) {
                    session.pendingRequestRoutes.delete(requestId)
                }
            }
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

    async #runNetworkEvent(handler: () => Promise<unknown> | undefined, request: NetworkEvent, phase: InterceptionPhase) {
        try {
            await handler()
        } catch (error) {
            // EventEmitter does not await listener promises. Keep the failure
            // observable through calls/waitForResponse instead of crashing the
            // process with an unhandled rejection, and release the blocked request.
            const requestId = request.request.request
            const failure = error instanceof Error ? error : new Error(String(error))
            this.#networkError ||= failure
            this.#failedRequests.add(requestId)
            this.#providedRequests.delete(requestId)
            this.#pendingCalls.delete(requestId)
            log.error(`Failed to mock request ${requestId}: ${failure.message}`)
            if (request.isBlocked && sessions.get(this.#browser)?.routes.get(request.request)?.[phase]?.owner === this) {
                try {
                    await this.#browser.networkFailRequest({ request: requestId })
                } catch (abortError) {
                    log.error(`Failed to abort mocked request ${requestId}: ${abortError}`)
                }
            }
            return failure
        }
    }

    #waitForRoute(route: EventRoute | undefined, requestId: string) {
        if (!route?.owner) {
            return
        }
        return route.completion.then(() => {
            if (route.error) {
                // The owner already aborted the request. Observers only retain
                // its error and discard their pending call, without aborting again.
                this.#networkError ||= route.error
                this.#failedRequests.add(requestId)
                this.#pendingCalls.delete(requestId)
            }
        })
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
        if (!request.isBlocked || this.#restored) {
            return
        }
        const route = this.#getRoute(request, 'request')
        const { owner, matches } = route
        const filterError = route.filterErrors.get(this)
        if (filterError) {
            throw filterError
        }
        if (matches.has(this)) {
            this.#emit('request', request)
        }
        if (owner !== this) {
            return matches.has(this) ? this.#waitForRoute(route, request.request.request) : undefined
        }

        /**
         * check if request matches filter option and do nothing if not
         */
        if (!matches.has(this)) {
            return this.#browser.networkContinueRequest({
                request: request.request.request
            })
        }

        const responseOverwrite = this.#respondOverwrites[0]
        if (
            responseOverwrite?.overwrite?.fetchResponse === false &&
            this.#requestOverwrites.length === 0
        ) {
            if (responseOverwrite.once) {
                this.#respondOverwrites.shift()
            }
            this.#providedRequests.add(request.request.request)
            this.#emit('overwrite', request)
            return this.#provideResponse(responseOverwrite.overwrite, request)
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
        const requestId = request.request.request
        const pendingRequestRoute = sessions.get(this.#browser)?.pendingRequestRoutes.get(requestId)
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
            return this.#waitForRoute(pendingRequestRoute, requestId)
        }

        // Firefox only intercepts the request phase, but spies still need real
        // response data and response filters without resuming unblocked events.
        if (this.#isFirefox && !request.isBlocked) {
            if (!this.#restored && this.#pattern.test(request.request.url) && this.#matchesFilterOptions(request)) {
                this.#recordResponse(request)
                return this.#waitForRoute(pendingRequestRoute, requestId)
            }
            return
        }

        /**
         * don't do anything if:
         * - request is not blocked
         * - request is not matching the pattern, e.g. a different mock is responsible for this request
         */
        if (!request.isBlocked || this.#restored) {
            return
        }
        const route = this.#getRoute(request, 'response')
        const { owner, matches } = route
        const filterError = route.filterErrors.get(this)
        if (filterError) {
            throw filterError
        }
        if (owner !== this) {
            if (matches.has(this)) {
                this.#recordResponse(request)
                return Promise.all([
                    this.#waitForRoute(route, requestId),
                    this.#waitForRoute(pendingRequestRoute, requestId)
                ])
            }
            return
        }

        /**
         * continue mock if not matching filter
         */
        if (!matches.has(this)) {
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
        const responseOverwrite = this.#respondOverwrites[0]
        if (!responseOverwrite?.overwrite?.fetchResponse) {
            this.#emit('continue', request.request.request)
            return this.#browser.networkProvideResponse({
                request: request.request.request
            }).catch(this.#handleNetworkProvideResponseError)
        }

        if (responseOverwrite.once) {
            this.#respondOverwrites.shift()
        }
        this.#emit('overwrite', request)
        return this.#provideResponse(responseOverwrite.overwrite, request)
    }

    /**
     * It appears that the networkProvideResponse method may throw an "no such request" error even though the request
     * is marked as "blocked", in these cases we can safely ignore the error.
     * @param err Bidi message error
     */
    #handleNetworkProvideResponseError(err: Error) {
        // Remote ends can append a description after the BiDi error code.
        if (/(?:^|: )no such request(?:\s|$)/.test(err.message)) {
            return
        }

        throw err
    }

    #provideResponse({ body, ...options }: ResponseOverwrite, event: NetworkEvent) {
        // Keep the raw BiDi fields for existing option callbacks and expose the
        // flat request/response metadata used by the public mock API.
        const response = 'response' in event ? event.response : undefined
        const match = {
            ...event, url: event.request.url, method: event.request.method, headers: headerMap(event.request.headers),
            statusCode: response?.status ?? 200, responseHeaders: response ? headerMap(response.headers) : {},
            body: response ? undefined : '' as const
        }
        const provide = (bytes: local.NetworkBytesValue) => {
            const operation = this.#browser.networkProvideResponse({
                request: event.request.request, ...parseOverwrite(options, match), body: bytes
            })
            // Ignore stale response-stage protocol errors, never user callback exceptions.
            return options.fetchResponse ? operation.catch(this.#handleNetworkProvideResponseError) : operation
        }
        return typeof body === 'function'
            ? Promise.resolve(body(match)).then(value => provide(encodeBody(value)))
            : provide(body)
    }

    #getRoute(request: NetworkEvent, phase: InterceptionPhase): EventRoute {
        const session = sessions.get(this.#browser)
        const routes = session?.routes.get(request.request) || {}
        if (routes[phase]) {
            return routes[phase]
        }

        // BiDi URL components are exact matches, so wildcard components are
        // filtered locally. Evaluate user predicates once per event and share
        // the result between listeners, before respondOnce consumes an overwrite.
        const mocks = [...(session?.mocks || [])].filter(mock => (
            !mock.#restored && (!request.intercepts || request.intercepts.includes(mock.#mockId))
        ))
        const matchingMocks: BidiInterception[] = []
        const filterErrors = new Map<BidiInterception, Error>()
        for (const mock of mocks) {
            try {
                if (mock.#pattern.test(request.request.url) && mock.#matchesFilterOptions(request)) {
                    matchingMocks.push(mock)
                }
            } catch (error) {
                filterErrors.set(mock, error instanceof Error ? error : new Error(String(error)))
            }
        }
        // Yield mixed-intercept events to their external handler in the absence
        // of an active WDIO overwrite. With no IDs, fall back only to a matching URL.
        const fallback = request.intercepts
            ? (mocks.length === request.intercepts.length ? mocks[0] : undefined)
            : mocks.find(mock => mock.#pattern.test(request.request.url))
        // A matching spy observes the event but must not consume the single
        // continuation needed by another mock's configured overwrite.
        const owner = mocks.find(mock => mock.#providedRequests.has(request.request.request)) || matchingMocks.find(mock => {
            const response = mock.#respondOverwrites[0]?.overwrite
            const providesBeforeRequest = response?.fetchResponse === false
            return phase === 'request'
                ? mock.#requestOverwrites.length > 0 || providesBeforeRequest
                : response?.fetchResponse
        }) || (fallback && (matchingMocks[0] || filterErrors.keys().next().value || fallback))
        let complete!: () => void
        const completion = new Promise<void>(resolve => { complete = resolve })
        const route = { owner, matches: new Set(matchingMocks), filterErrors, completion, complete }
        routes[phase] = route
        session?.routes.set(request.request, routes)
        if (phase === 'request' && owner) {
            session?.pendingRequestRoutes.set(request.request.request, route)
        }
        return route
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

    #setOverwrite = <T>(overwriteProp: Overwrite<T>[], { overwrite, abort, once }: Overwrite<T>) => {
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
        sessions.get(this.#browser)?.mocks.delete(this)
        this.#providedRequests.clear()
    }

    /**
     * Does everything that `mock.reset()` does, and also
     * removes any mocked return values or implementations.
     * Restored mock does not emit events and could not mock responses
     */
    async restore() {
        const session = BidiInterception.#getSession(this.#browser)
        // Stop applying overrides, but preserve in-flight failures until after
        // cleanup. Clearing the error here could turn a failed mock into a pass.
        this.#respondOverwrites = []
        this.#requestOverwrites = []
        // Keep listeners alive while the remote end removes the intercept:
        // requests already blocked by it still need to be continued.
        if (session?.mocks.has(this)) {
            await this.#browser.networkRemoveIntercept({ intercept: this.#mockId })
        }
        this.#detach()
        // Includes requests received while networkRemoveIntercept was pending.
        await Promise.all(this.#pendingOperations)
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
        if (this.#respondOverwrites.some(({ overwrite }) => overwrite?.fetchResponse === false)) {
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
    respond(payload: RespondBody | BodyCallback, params: Omit<RespondWithOptions, 'body'> = {}, once?: boolean) {
        this.#ensureNotRestored()
        if (this.#isFirefox && params.fetchResponse === true) {
            throw new Error('Firefox does not support mock.respond with fetchResponse: true; response bodies can only be provided before the request is sent')
        }
        const fetchResponse = params.fetchResponse ?? !this.#isFirefox
        if (!fetchResponse && (this.#filterOptions.responseHeaders || this.#filterOptions.statusCode !== undefined)) {
            throw new Error('Response filters (responseHeaders and statusCode) cannot be used when mock.respond does not fetch the real response')
        }
        if (!fetchResponse && typeof params.statusCode === 'function') {
            throw new Error('A statusCode function requires the real response; use a numeric statusCode when mock.respond does not fetch the real response')
        }
        if (!fetchResponse && this.#requestOverwrites.some(({ overwrite }) => overwrite)) {
            throw new Error('Request overwrites cannot be combined with mock.respond when it does not fetch the real response')
        }
        const body = typeof payload === 'function' ? payload : encodeBody(payload)
        const overwrite: ResponseOverwrite = { ...params, body, fetchResponse }
        this.#respondOverwrites = this.#setOverwrite(this.#respondOverwrites, { overwrite, once })
        return this
    }

    /**
     * alias for `mock.respond(…, true)`
     */
    respondOnce(payload: RespondBody | BodyCallback, params: Omit<RespondWithOptions, 'body'> = {}) {
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

function encodeBody(body: RespondBody): local.NetworkBytesValue {
    if (globalThis.Buffer?.isBuffer(body)) {
        return { type: 'base64', value: body.toString('base64') }
    }
    const value = typeof body === 'string' ? body : JSON.stringify(body)
    if (typeof value !== 'string') {
        throw new Error('mock.respond requires a string, JSON value or Buffer')
    }
    return { type: 'string', value }
}

function headerMap(headers: local.NetworkHeader[]): Record<string, string> {
    return Object.fromEntries(headers.map(({ name, value }) => [name, value.type === 'string' ? value.value : atob(value.value)]))
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
