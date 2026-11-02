import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import BidiInterception from '../../../src/utils/interception/bidi.js'
import { mock as browserMockCommand } from '../../../src/commands/browser/mock.js'
import { mockRestoreAll } from '../../../src/commands/browser/mockRestoreAll.js'
import { getContextManager } from '../../../src/session/context.js'

function browserMock (browserName = 'chrome') {
    let id = 0
    return Object.assign(new EventEmitter(), {
        sessionId: 'session',
        capabilities: { browserName },
        isBidi: true,
        isFirefox: browserName === 'firefox',
        options: { waitforTimeout: 20, waitforInterval: 5 },
        call: (fn: () => unknown) => fn(),
        sessionSubscribe: vi.fn().mockResolvedValue({}),
        networkAddIntercept: vi.fn().mockImplementation(async () => ({ intercept: String(++id) })),
        networkContinueRequest: vi.fn().mockResolvedValue({}),
        networkFailRequest: vi.fn().mockResolvedValue({}),
        networkProvideResponse: vi.fn().mockResolvedValue({}),
        networkRemoveIntercept: vi.fn().mockResolvedValue({}),
        getWindowHandle: vi.fn().mockResolvedValue('window')
    })
}

function event (url: string, intercepts = ['1']) {
    return {
        isBlocked: true, intercepts,
        request: { request: 'request', url, method: 'GET', headers: [] },
        response: { status: 200, headers: [] }
    }
}

describe('BiDi interception routing', () => {
    it('does not send wildcard components as literal protocol URL parts', async () => {
        const browser = browserMock()
        await BidiInterception.initiate('**/api', {}, browser as any)
        expect(browser.networkAddIntercept).toHaveBeenCalledWith({
            phases: ['beforeRequestSent', 'responseStarted'],
            urlPatterns: [{ type: 'pattern' }]
        })
    })

    it('continues unmatched requests captured by a broad protocol intercept', async () => {
        const browser = browserMock()
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        mock.respond({ source: 'mock' })
        browser.emit('network.beforeRequestSent', event('https://example.org/other'))
        browser.emit('network.responseStarted', event('https://example.org/other'))
        expect(browser.networkContinueRequest).toHaveBeenCalledTimes(1)
        expect(browser.networkContinueRequest).toHaveBeenCalledWith({ request: 'request' })
        expect(browser.networkProvideResponse).toHaveBeenCalledTimes(1)
        expect(browser.networkProvideResponse).toHaveBeenCalledWith({ request: 'request' })
        expect(mock.calls).toEqual([])
    })

    it('leaves a request blocked by a plugin when a broad WDIO intercept does not match locally', async () => {
        const browser = browserMock()
        const spy = await BidiInterception.initiate('**/account', {}, browser as any)
        const invoice = event('https://example.org/invoice', ['plugin', '1'])

        browser.emit('network.beforeRequestSent', invoice)
        browser.emit('network.responseStarted', invoice)
        await spy.restore()

        expect(browser.networkContinueRequest).not.toHaveBeenCalled()
        expect(browser.networkProvideResponse).not.toHaveBeenCalled()
        expect(browser.networkFailRequest).not.toHaveBeenCalled()
    })

    it('does not fail a passive mock on a synthetic response already supplied by a plugin', async () => {
        const browser = browserMock()
        const spy = await BidiInterception.initiate('**/account', {}, browser as any)
        const url = 'https://example.org/invoice'
        browser.emit('network.beforeRequestSent', event(url, ['plugin', '1']))
        // Chromium announces responseStarted with only the broad response intercept.
        browser.networkProvideResponse.mockRejectedValue(new Error('network.provideResponse failed with error: no such request - No blocked request found'))
        browser.emit('network.responseStarted', event(url))

        await expect(spy.restore()).resolves.toBe(spy)
        expect(browser.networkFailRequest).not.toHaveBeenCalled()
    })

    it.each([false, true])('isolates a throwing predicate from other mocks (another responder: %s)', async responds => {
        const browser = browserMock()
        const unrelated = await BidiInterception.initiate('**/other', {}, browser as any)
        const error = new Error('bad filter')
        const method = vi.fn(() => { throw error })
        const invalid = await BidiInterception.initiate('**/api', { method }, browser as any)
        if (responds) {
            const responder = await BidiInterception.initiate('**/api', {}, browser as any)
            responder.respond('still works', { fetchResponse: false })
        }
        browser.emit('network.beforeRequestSent', event('https://example.org/api', responds ? ['1', '2', '3'] : ['1', '2']))

        await expect(invalid.restore()).rejects.toBe(error)
        await expect(unrelated.restore()).resolves.toBe(unrelated)
        expect(method).toHaveBeenCalledTimes(1)
        expect(browser.networkFailRequest).toHaveBeenCalledTimes(responds ? 0 : 1)
        if (responds) {
            expect(browser.networkProvideResponse).toHaveBeenCalledWith({
                request: 'request', body: { type: 'string', value: 'still works' }
            })
        }
    })

    it('routes overlapping intercepts once to the matching mock', async () => {
        const browser = browserMock()
        const other = await BidiInterception.initiate('**/other', {}, browser as any)
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        other.respond({ source: 'other' })
        mock.respond({ source: 'mock' })
        browser.emit('network.responseStarted', event('https://example.org/api', ['1', '2']))
        expect(browser.networkProvideResponse).toHaveBeenCalledTimes(1)
        expect(browser.networkProvideResponse).toHaveBeenCalledWith({
            request: 'request', body: { type: 'string', value: '{"source":"mock"}' }
        })
        expect(other.calls).toHaveLength(0)
        await vi.waitFor(() => expect(mock.calls).toHaveLength(1))
    })

    it('evaluates a response filter once even when multiple mocks observe the event', async () => {
        const browser = browserMock()
        const method = vi.fn().mockReturnValueOnce(true).mockReturnValue(false)
        const mock = await BidiInterception.initiate('**/api', { method }, browser as any)
        await BidiInterception.initiate('**/other', {}, browser as any)
        mock.respond('mock body')

        browser.emit('network.responseStarted', event('https://example.org/api', ['1', '2']))

        expect(method).toHaveBeenCalledTimes(1)
        expect(browser.networkProvideResponse).toHaveBeenCalledTimes(1)
        expect(browser.networkProvideResponse).toHaveBeenCalledWith({
            request: 'request', body: { type: 'string', value: 'mock body' }
        })
        await vi.waitFor(() => expect(mock.calls).toHaveLength(1))
    })

    it.each([
        ['chrome', true, true], ['chrome', true, false],
        ['chrome', false, true], ['chrome', false, false],
        ['firefox', false, true], ['firefox', false, false]
    ] as const)('settles overlapping observers with their responder (%s, fetchResponse: %s, spy first: %s)', async (browserName, fetchResponse, spyFirst) => {
        const browser = browserMock(browserName)
        const first = await BidiInterception.initiate('**/api', {}, browser as any)
        const second = await BidiInterception.initiate('**/api', {}, browser as any)
        const [spy, mock] = spyFirst ? [first, second] : [second, first]
        mock.respond('mock body', { fetchResponse })
        let resolve!: () => void
        let reject!: (error: Error) => void
        browser.networkProvideResponse.mockImplementation(() => new Promise<void>((done, fail) => { resolve = done; reject = fail }))
        const emitResponse = (id: string) => {
            const { response, ...request } = event('https://example.org/api', ['1', '2'])
            request.request.request = id
            browser.emit('network.beforeRequestSent', request)
            browser.emit('network.responseStarted', { ...request, response, isBlocked: browserName === 'chrome' })
        }

        emitResponse('successful')
        await new Promise(done => setImmediate(done))
        expect(spy.calls).toEqual([])
        expect(mock.calls).toEqual([])
        expect(browser.networkProvideResponse).toHaveBeenCalledTimes(1)
        expect(browser.networkProvideResponse).toHaveBeenCalledWith({
            request: 'successful', body: { type: 'string', value: 'mock body' }
        })
        resolve()
        await vi.waitFor(() => {
            expect(spy.calls).toHaveLength(1)
            expect(mock.calls).toHaveLength(1)
        })

        const spyCalls = spy.clear().calls
        const mockCalls = mock.clear().calls
        emitResponse('failed')
        await new Promise(done => setImmediate(done))
        expect(spyCalls).toEqual([])
        expect(mockCalls).toEqual([])
        const error = new Error('provide failed')
        reject(error)
        await expect(spy.waitForResponse()).rejects.toThrow(error.message)
        await expect(mock.waitForResponse()).rejects.toThrow(error.message)
        expect(spyCalls).toEqual([])
        expect(mockCalls).toEqual([])
        expect(browser.networkFailRequest).toHaveBeenCalledTimes(1)
        expect(browser.networkFailRequest).toHaveBeenCalledWith({ request: 'failed' })
    })

    it.each(['clear', 'reset'] as const)('does not wait for unrelated requests or restore calls cleared with %s', async clear => {
        const browser = browserMock()
        const spy = await BidiInterception.initiate('**/api', {}, browser as any)
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        mock.respond('mock body')
        let finishPending!: () => void
        browser.networkProvideResponse.mockImplementation(({ request }) => request === 'pending'
            ? new Promise<void>(resolve => { finishPending = resolve })
            : Promise.resolve())
        const pending = event('https://example.org/api', ['1', '2'])
        pending.request.request = 'pending'
        browser.emit('network.responseStarted', pending)
        const successful = event('https://example.org/api', ['1', '2'])
        successful.request.request = 'successful'
        browser.emit('network.responseStarted', successful)
        await vi.waitFor(() => {
            expect(spy.calls.map(call => call.request.request)).toEqual(['successful'])
            expect(mock.calls.map(call => call.request.request)).toEqual(['successful'])
        })
        spy[clear]()
        mock[clear]()
        finishPending()
        await new Promise(done => setImmediate(done))
        expect(spy.calls).toEqual([])
        expect(mock.calls).toEqual([])
        await Promise.all([spy.restore(), mock.restore()])
    })

    it('subscribes once per session, including concurrent mocks and a reloaded session', async () => {
        const browser = browserMock()
        await Promise.all([
            BidiInterception.initiate('**/one', {}, browser as any),
            BidiInterception.initiate('**/two', {}, browser as any)
        ])
        expect(browser.sessionSubscribe).toHaveBeenCalledTimes(1)
        browser.sessionId = 'reloaded'
        await BidiInterception.initiate('**/three', {}, browser as any)
        expect(browser.sessionSubscribe).toHaveBeenCalledTimes(2)
        const anotherBrowser = browserMock()
        await BidiInterception.initiate('**/four', {}, anotherBrowser as any)
        expect(anotherBrowser.sessionSubscribe).toHaveBeenCalledTimes(1)
    })

})

describe('BiDi response mocking phases', () => {
    const url = 'https://example.org/api'

    it('awaits a public respondOnce callback before allowing a request to reach the backend', async () => {
        const browser = browserMock()
        const mock = await browserMockCommand.call(browser as unknown as WebdriverIO.Browser, '**/api')
        mock.respondOnce(async ({ method, url, headers }) => ({ method, url, author: headers.author }), {
            fetchResponse: false, statusCode: 202,
            headers: ({ method }) => ({ 'x-method': method })
        })
        const { response: _response, ...request } = event(url)
        request.request.method = 'POST'
        browser.emit('network.beforeRequestSent', {
            ...request, request: { ...request.request, headers: [{ name: 'author', value: { type: 'string', value: 'me' } }] }
        })
        await vi.waitFor(() => expect(browser.networkProvideResponse).toHaveBeenCalledWith({
            request: 'request', statusCode: 202, headers: [{ name: 'x-method', value: { type: 'string', value: 'POST' } }],
            body: { type: 'string', value: '{"method":"POST","url":"https://example.org/api","author":"me"}' }
        }))
        expect(browser.networkContinueRequest).not.toHaveBeenCalled()
        browser.emit('network.beforeRequestSent', { ...request, request: { ...request.request, request: 'next' } })
        expect(browser.networkContinueRequest).toHaveBeenCalledTimes(1)
        expect(browser.networkContinueRequest).toHaveBeenCalledWith({ request: 'next' })
    })

    it('provides the fetched status and headers to response-stage callbacks', async () => {
        const browser = browserMock()
        const mock = await browserMockCommand.call(browser as unknown as WebdriverIO.Browser, '**/api')
        mock.respond(({ statusCode, responseHeaders }) => `${statusCode}: ${responseHeaders.source}`, {
            statusCode: ({ statusCode }) => statusCode + 1
        })
        const { response: _response, ...request } = event(url)
        browser.emit('network.beforeRequestSent', request)
        expect(browser.networkContinueRequest).toHaveBeenCalledWith({ request: 'request' })
        expect(browser.networkProvideResponse).not.toHaveBeenCalled()
        browser.emit('network.responseStarted', {
            ...request, response: { status: 201, headers: [{ name: 'source', value: { type: 'base64', value: 'c2VydmVy' } }] }
        })
        await vi.waitFor(() => expect(browser.networkProvideResponse).toHaveBeenCalledWith({
            request: 'request', body: { type: 'string', value: '201: server' }, statusCode: 202
        }))
    })

    it.each([false, true])('passes raw Buffer bytes to the browser (fetchResponse: %s)', async fetchResponse => {
        const browser = browserMock()
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        mock.respond(Buffer.from([0, 255, 1]), { fetchResponse })
        browser.emit(fetchResponse ? 'network.responseStarted' : 'network.beforeRequestSent', event(url))
        expect(browser.networkProvideResponse).toHaveBeenCalledWith({
            request: 'request', body: { type: 'base64', value: 'AP8B' }
        })
    })

    it('aborts instead of fetching the backend when a response callback rejects', async () => {
        const browser = browserMock()
        const mock = await browserMockCommand.call(browser as unknown as WebdriverIO.Browser, '**/api')
        const error = new Error('fixture failed')
        mock.respond(async () => { throw error }, { fetchResponse: false })
        browser.emit('network.beforeRequestSent', event(url))

        await expect(mock.restore()).rejects.toBe(error)
        expect(browser.networkFailRequest).toHaveBeenCalledTimes(1)
        expect(browser.networkFailRequest).toHaveBeenCalledWith({ request: 'request' })
        expect(browser.networkContinueRequest).not.toHaveBeenCalled()
        expect(browser.networkProvideResponse).not.toHaveBeenCalled()
    })

    it('does not suppress no-such-request failures when fulfilling a response before the request is sent', async () => {
        const browser = browserMock()
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        let reject!: (error: Error) => void
        browser.networkProvideResponse.mockImplementation(() => new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise }))
        mock.respond('mock body', { fetchResponse: false })
        const calls = mock.calls
        const { response, ...request } = event('https://example.org/api')
        browser.emit('network.beforeRequestSent', request)
        browser.emit('network.responseStarted', { ...request, response })
        const waiting = Promise.resolve(mock.waitForResponse({ timeout: 100 })).then(value => value, error => error)
        const error = new Error('WebDriver Bidi command failed: no such request')
        reject(error)
        const waitResult = await waiting
        const restoreResult = await mock.restore().then(value => value, error => error)
        expect(waitResult).toMatchObject({ message: expect.stringContaining(error.message) })
        expect(restoreResult).toBe(error)
        expect(browser.networkFailRequest).toHaveBeenCalledWith({ request: 'request' })
        expect(() => mock.calls).toThrow(error.message)
        expect(calls).toEqual([])
    })

    it('does not publish a late failed Firefox response after clear acknowledges its error', async () => {
        const browser = browserMock('firefox')
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        const error = new Error('provide failed')
        browser.networkProvideResponse.mockRejectedValue(error)
        mock.respond('mock body')
        const { response, ...request } = event('https://example.org/api')
        browser.emit('network.beforeRequestSent', request)
        await vi.waitFor(() => expect(browser.networkFailRequest).toHaveBeenCalledWith({ request: 'request' }))
        mock.clear()
        browser.emit('network.responseStarted', { ...request, response, isBlocked: false })
        await new Promise(resolve => setImmediate(resolve))
        expect(mock.calls).toEqual([])
        await expect(mock.waitForResponse()).rejects.toThrow('timed out')
        await expect(mock.restore()).resolves.toBe(mock)
    })

    it('retains a request failure arriving after reset while fulfillment was pending', async () => {
        const browser = browserMock('firefox')
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        let reject!: (error: Error) => void
        browser.networkProvideResponse.mockImplementation(() => new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise }))
        mock.respond('mock body')
        const { response, ...request } = event('https://example.org/api')
        browser.emit('network.beforeRequestSent', request)
        const calls = mock.reset().calls
        const error = new Error('provide failed after clearing history')
        reject(error)
        await vi.waitFor(() => expect(browser.networkFailRequest).toHaveBeenCalledWith({ request: 'request' }))
        browser.emit('network.responseStarted', { ...request, response, isBlocked: false })
        await new Promise(resolve => setImmediate(resolve))
        await expect(mock.waitForResponse()).rejects.toThrow(error.message)
        await expect(mock.restore()).rejects.toBe(error)
        expect(calls).toEqual([])
    })

    it('does not publish a synthetic response before its request fulfillment succeeds', async () => {
        const browser = browserMock('firefox')
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        let fulfill!: () => void
        browser.networkProvideResponse.mockImplementation(() => new Promise<void>(resolve => { fulfill = resolve }))
        mock.respond('mock body')
        const { response, ...request } = event('https://example.org/api')
        browser.emit('network.beforeRequestSent', request)
        browser.emit('network.responseStarted', { ...request, response, isBlocked: false })
        const settled = vi.fn()
        const waiting = Promise.resolve(mock.waitForResponse({ timeout: 1000 })).then(settled)
        try {
            await new Promise(resolve => setImmediate(resolve))
            expect(settled).not.toHaveBeenCalled()
            expect(mock.calls).toEqual([])
        } finally {
            fulfill()
            await waiting
        }
        expect(settled).toHaveBeenCalledWith(true)
        expect(mock.calls).toHaveLength(1)
        await mock.restore()
    })

    it('propagates a delayed response failure to an already waiting caller and immediate restore', async () => {
        const browser = browserMock()
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        let reject!: (error: Error) => void
        browser.networkProvideResponse.mockImplementation(() => new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise }))
        mock.respond('mock body')
        const { response, ...request } = event('https://example.org/api')
        browser.emit('network.responseStarted', { ...request, response })
        const waiting = Promise.resolve(mock.waitForResponse({ timeout: 1000 })).then(value => value, error => error)
        const restoring = mock.restore().then(value => value, error => error)
        await new Promise(resolve => setImmediate(resolve))
        const error = new Error('delayed provideResponse failure')
        reject(error)
        expect(await waiting).toMatchObject({ message: expect.stringContaining(error.message) })
        expect(await restoring).toBe(error)
        expect(() => mock.calls).toThrow(error.message)
        expect(browser.listenerCount('network.beforeRequestSent')).toBe(0)
        expect(browser.listenerCount('network.responseStarted')).toBe(0)
    })

    it('drains requests received while the remote intercept is being removed', async () => {
        const browser = browserMock()
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        let remove!: () => void
        let reject!: (error: Error) => void
        browser.networkRemoveIntercept.mockImplementation(() => new Promise<void>(resolve => { remove = resolve }))
        browser.networkProvideResponse.mockImplementation(() => new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise }))
        mock.respond('mock body')
        const settled = vi.fn()
        const restoring = mock.restore().then(settled, error => error)
        browser.emit('network.responseStarted', event('https://example.org/api'))
        expect(browser.networkProvideResponse).toHaveBeenCalledWith({ request: 'request' })
        remove()
        await new Promise(resolve => setImmediate(resolve))
        expect(settled).not.toHaveBeenCalled()
        const error = new Error('in-flight continuation failure during restore')
        reject(error)
        expect(await restoring).toBe(error)
        expect(browser.listenerCount('network.beforeRequestSent')).toBe(0)
        expect(browser.listenerCount('network.responseStarted')).toBe(0)
        expect(() => mock.respond('another body')).toThrow('restored mock')
    })

    it('restores the remaining intercepts before reporting a mock failure', async () => {
        const browser = browserMock()
        const client = browser as unknown as WebdriverIO.Browser
        getContextManager(client).setCurrentContext('window')
        const failing = await browserMockCommand.call(client, '**/api')
        await browserMockCommand.call(client, '**/other')
        const error = new Error('provide failed')
        browser.networkProvideResponse.mockRejectedValueOnce(error)
        failing.respond('mock body')
        browser.emit('network.responseStarted', event('https://example.org/api'))

        await expect(mockRestoreAll.call(client)).rejects.toBe(error)
        expect(browser.networkRemoveIntercept.mock.calls).toEqual([[{ intercept: '1' }], [{ intercept: '2' }]])
        expect(browser.listenerCount('network.beforeRequestSent')).toBe(0)
        expect(browser.listenerCount('network.responseStarted')).toBe(0)
        await mockRestoreAll.call(client)
        expect(browser.networkRemoveIntercept).toHaveBeenCalledTimes(2)
    })

    it('restores mocks only once after switching windows without touching another browser', async () => {
        const browser = browserMock()
        const other = browserMock()
        const client = browser as unknown as WebdriverIO.Browser
        const otherClient = other as unknown as WebdriverIO.Browser
        getContextManager(client).setCurrentContext('frame')
        getContextManager(otherClient).setCurrentContext('frame')
        await browserMockCommand.call(client, '**/one')
        await browserMockCommand.call(otherClient, '**/two')
        browser.getWindowHandle.mockResolvedValue('another-window')

        await mockRestoreAll.call(client)
        await mockRestoreAll.call(client)
        expect(browser.networkRemoveIntercept.mock.calls).toEqual([[{ intercept: '1' }]])
        expect(other.networkRemoveIntercept).not.toHaveBeenCalled()
        await mockRestoreAll.call(otherClient)
        expect(other.networkRemoveIntercept).toHaveBeenCalledTimes(1)
    })

    it('never removes intercepts from an ended session through the new session', async () => {
        const browser = browserMock()
        const client = browser as unknown as WebdriverIO.Browser
        const old = await browserMockCommand.call(client, '**/old')
        browser.sessionId = 'reloaded'
        await mockRestoreAll.call(client)
        expect(browser.networkRemoveIntercept).not.toHaveBeenCalled()
        expect(() => old.respond('stale')).toThrow('restored mock')

        await browserMockCommand.call(client, '**/new')
        await mockRestoreAll.call(client)
        await mockRestoreAll.call(client)
        expect(browser.networkRemoveIntercept.mock.calls).toEqual([[{ intercept: '2' }]])
    })

    it('publishes only successful concurrent responses while another response is pending or fails', async () => {
        const browser = browserMock()
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        let reject!: (error: Error) => void
        browser.networkProvideResponse.mockImplementation(({ request }) => request === 'pending'
            ? new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise })
            : Promise.resolve())
        mock.respond('mock body')
        const pending = event('https://example.org/api')
        pending.request.request = 'pending'
        const successful = event('https://example.org/api')
        successful.request.request = 'successful'
        const calls = mock.calls
        browser.emit('network.responseStarted', pending)
        browser.emit('network.responseStarted', successful)
        await vi.waitFor(() => expect(calls.map(call => call.request.request)).toEqual(['successful']))
        const error = new Error('pending response failed')
        reject(error)
        await expect(mock.restore()).rejects.toBe(error)
        expect(calls.map(call => call.request.request)).toEqual(['successful'])
    })

    it.each(['chrome', 'firefox'])('provides Firefox response bodies before the request is sent after a %s session', async (initialBrowser) => {
        const browser = browserMock(initialBrowser)
        browser.sessionId = 'reloaded'
        browser.capabilities = { browserName: 'firefox' }
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        expect(() => mock.respond('unsupported', { fetchResponse: true })).toThrow(/Firefox.*fetchResponse/)
        mock.respond({ source: 'mock' })
        expect(browser.networkAddIntercept).toHaveBeenCalledWith({
            phases: ['beforeRequestSent'], urlPatterns: [{ type: 'pattern' }]
        })
        const { response, ...request } = event('https://example.org/api')
        browser.emit('network.beforeRequestSent', request)
        browser.emit('network.responseStarted', { ...request, response, isBlocked: false })
        expect(browser.networkContinueRequest).not.toHaveBeenCalled()
        expect(browser.networkProvideResponse).toHaveBeenCalledTimes(1)
        expect(browser.networkProvideResponse).toHaveBeenCalledWith({
            request: 'request', body: { type: 'string', value: '{"source":"mock"}' }
        })
        await vi.waitFor(() => expect(mock.calls).toHaveLength(1))
    })

    it.each(['firefox', 'chrome'])('keeps Chromium default overwrites at responseStarted after a %s session', async (initialBrowser) => {
        const browser = browserMock(initialBrowser)
        browser.sessionId = 'reloaded'
        browser.capabilities = { browserName: 'chrome' }
        const mock = await BidiInterception.initiate('**/api', { statusCode: 201 }, browser as any)
        expect(browser.networkAddIntercept).toHaveBeenCalledWith({
            phases: ['beforeRequestSent', 'responseStarted'], urlPatterns: [{ type: 'pattern' }]
        })
        mock.respond('mock body')
        const { response, ...request } = event('https://example.org/api')
        response.status = 201

        browser.emit('network.beforeRequestSent', request)
        expect(browser.networkContinueRequest).toHaveBeenCalledWith({ request: 'request' })
        expect(browser.networkProvideResponse).not.toHaveBeenCalled()
        browser.emit('network.responseStarted', { ...request, response })
        expect(browser.networkProvideResponse).toHaveBeenCalledWith({
            request: 'request', body: { type: 'string', value: 'mock body' }
        })
        await vi.waitFor(() => expect(mock.calls).toHaveLength(1))
    })

    it('honors an explicit request-stage response with status and headers on Chromium', async () => {
        const browser = browserMock()
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        mock.respond('mock body', { fetchResponse: false, statusCode: 202, headers: { 'x-mock': 'yes' } })
        const { response: _response, ...request } = event('https://example.org/api')

        browser.emit('network.beforeRequestSent', request)
        expect(browser.networkContinueRequest).not.toHaveBeenCalled()
        expect(browser.networkProvideResponse).toHaveBeenCalledWith({
            request: 'request', statusCode: 202,
            headers: [{ name: 'x-mock', value: { type: 'string', value: 'yes' } }],
            body: { type: 'string', value: 'mock body' }
        })
    })

    it('provides an empty response body without fetching the real response', async () => {
        const browser = browserMock()
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        mock.respond('', { fetchResponse: false })
        const { response: _response, ...request } = event('https://example.org/api')

        browser.emit('network.beforeRequestSent', request)

        expect(browser.networkContinueRequest).not.toHaveBeenCalled()
        expect(browser.networkProvideResponse).toHaveBeenCalledWith({
            request: 'request', body: { type: 'string', value: '' }
        })
    })

    it.each(['chrome', 'firefox'])('does not consume the next respondOnce at the synthetic response phase (%s)', async browserName => {
        const browser = browserMock(browserName)
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        mock.respondOnce('first', { fetchResponse: false })
        mock.respondOnce('second', { fetchResponse: false })
        const { response, ...request } = event('https://example.org/api')

        browser.emit('network.beforeRequestSent', request)
        browser.emit('network.responseStarted', { ...request, response, isBlocked: browserName === 'chrome' })
        expect(browser.networkProvideResponse.mock.calls.map(([params]) => params.body?.value)).toEqual(['first'])
        await vi.waitFor(() => expect(mock.calls).toHaveLength(1))
        request.request = { ...request.request, request: 'next' }
        browser.emit('network.beforeRequestSent', request)
        expect(browser.networkProvideResponse).toHaveBeenLastCalledWith({
            request: 'next', body: { type: 'string', value: 'second' }
        })
    })

    it('rejects fetchResponse: true on Firefox before accepting a response overwrite', async () => {
        const browser = browserMock('firefox')
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        expect(() => mock.respond('mock body', { fetchResponse: true })).toThrow(/Firefox.*fetchResponse/)
        browser.emit('network.beforeRequestSent', event('https://example.org/api'))
        expect(browser.networkContinueRequest).toHaveBeenCalledWith({ request: 'request' })
    })

    it.each([{ statusCode: 200 }, { responseHeaders: { 'x-server': 'yes' } }])('rejects response-dependent filters for Firefox body mocking: %j', async filter => {
        const browser = browserMock('firefox')
        const mock = await BidiInterception.initiate('**/api', filter, browser as any)
        expect(() => mock.respond('mock body')).toThrow(/response.*filter/i)
    })

    it('rejects response-dependent status callbacks before request-stage mocking', async () => {
        const browser = browserMock('firefox')
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        expect(() => mock.respond('mock body', { statusCode: response => response.response.status })).toThrow(/statusCode.*function/)
    })

    it.each(['respond-first', 'request-first'])('rejects combining request overwrites with request-stage responses (%s)', async order => {
        const browser = browserMock('firefox')
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        if (order === 'respond-first') {
            mock.respond('mock body')
            expect(() => mock.request({ method: 'POST' })).toThrow(/request.*overwrite/i)
        } else {
            mock.request({ method: 'POST' })
            expect(() => mock.respond('mock body')).toThrow(/request.*overwrite/i)
        }
    })

    it('preserves abortOnce precedence without consuming the response overwrite', async () => {
        const browser = browserMock('firefox')
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        mock.abortOnce()
        mock.respondOnce('mock body')
        const { response: _response, ...request } = event('https://example.org/api')
        browser.emit('network.beforeRequestSent', request)
        expect(browser.networkFailRequest).toHaveBeenCalledWith({ request: 'request' })
        expect(browser.networkProvideResponse).not.toHaveBeenCalled()
        request.request = { ...request.request, request: 'next' }
        browser.emit('network.beforeRequestSent', request)
        expect(browser.networkProvideResponse).toHaveBeenCalledWith({
            request: 'next', body: { type: 'string', value: 'mock body' }
        })
    })

    it('does not apply a newly configured request-stage response to an already sent request', async () => {
        const browser = browserMock()
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        const { response, ...request } = event('https://example.org/api')
        browser.emit('network.beforeRequestSent', request)
        mock.respondOnce('mock body', { fetchResponse: false })
        browser.emit('network.responseStarted', { ...request, response })
        expect(browser.networkProvideResponse).toHaveBeenCalledWith({ request: 'request' })
        request.request = { ...request.request, request: 'next' }
        browser.emit('network.beforeRequestSent', request)
        expect(browser.networkProvideResponse).toHaveBeenLastCalledWith({
            request: 'next', body: { type: 'string', value: 'mock body' }
        })
    })

    it('retains in-flight response ownership when reset removes the configured overwrites', async () => {
        const browser = browserMock('firefox')
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        mock.respondOnce('first')
        const { response, ...request } = event('https://example.org/api')
        browser.emit('network.beforeRequestSent', request)
        mock.reset().respondOnce('next')
        browser.emit('network.responseStarted', { ...request, response, isBlocked: false })
        expect(browser.networkProvideResponse.mock.calls.map(([params]) => params.body?.value)).toEqual(['first'])
    })

    it('records matching unblocked Firefox responses while retaining response filters for spies', async () => {
        const browser = browserMock('firefox')
        const mock = await BidiInterception.initiate('**/api', { statusCode: 200 }, browser as any)
        browser.emit('network.responseStarted', { ...event('https://example.org/api'), isBlocked: false })
        browser.emit('network.responseStarted', { ...event('https://example.org/other'), isBlocked: false })
        browser.emit('network.responseStarted', {
            ...event('https://example.org/api'), isBlocked: false, response: { status: 404, headers: [] }
        })
        await vi.waitFor(() => expect(mock.calls).toHaveLength(1))
        expect(browser.networkProvideResponse).not.toHaveBeenCalled()
        await expect(mock.waitForResponse()).resolves.toBe(true)
    })

})
