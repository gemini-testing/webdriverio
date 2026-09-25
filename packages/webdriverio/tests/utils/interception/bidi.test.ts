import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import BidiInterception from '../../../src/utils/interception/bidi.js'

function browserMock (browserName = 'chrome') {
    let id = 0
    return Object.assign(new EventEmitter(), {
        sessionId: 'session',
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
    it('continues in-flight requests until the intercept has been removed', async () => {
        const browser = browserMock()
        let finishRemoval!: () => void
        browser.networkRemoveIntercept.mockImplementation(() => new Promise<void>(resolve => { finishRemoval = resolve }))
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        mock.respond({ source: 'mock' })
        const restoring = mock.restore()
        // Let the public restore command reach the remote-end removal call.
        await Promise.resolve()
        browser.emit('network.responseStarted', event('https://example.org/api'))
        expect(browser.networkProvideResponse).toHaveBeenCalledWith({ request: 'request' })
        finishRemoval()
        await restoring
        expect(browser.listenerCount('network.beforeRequestSent')).toBe(0)
        expect(browser.listenerCount('network.responseStarted')).toBe(0)
        expect(() => mock.respond({})).toThrow()
    })

})

describe('BiDi response mocking phases', () => {
    it.each(['chrome', 'firefox'])('does not suppress no-such-request failures when fulfilling a response before the request is sent (%s)', async browserName => {
        const browser = browserMock(browserName)
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        let reject!: (error: Error) => void
        browser.networkProvideResponse.mockImplementation(() => new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise }))
        mock.respond('mock body', { fetchResponse: false })
        const calls = mock.calls
        const { response, ...request } = event('https://example.org/api')
        browser.emit('network.beforeRequestSent', request)
        browser.emit('network.responseStarted', { ...request, response, isBlocked: browserName === 'chrome' })
        const waiting = Promise.resolve(mock.waitForResponse({ timeout: 100 })).then(value => value, error => error)
        const error = new Error('WebDriver Bidi command failed: no such request')
        reject(error)
        const waitResult = await waiting
        const restoreResult = await mock.restore().then(value => value, error => error)
        expect(waitResult).toMatchObject({ message: expect.stringContaining(error.message) })
        expect(restoreResult).toBe(error)
        expect(calls).toEqual([])
    })

    it.each(['none', 'clear', 'reset'])('does not publish a late Firefox response after its request fulfillment failed (history reset: %s)', async historyReset => {
        const browser = browserMock('firefox')
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        const error = new Error('provide failed')
        browser.networkProvideResponse.mockRejectedValue(error)
        mock.respond('mock body')
        const originalCalls = mock.calls
        const { response, ...request } = event('https://example.org/api')
        browser.emit('network.beforeRequestSent', request)
        await vi.waitFor(() => expect(browser.networkFailRequest).toHaveBeenCalledWith({ request: 'request' }))
        const calls = historyReset === 'clear'
            ? mock.clear().calls
            : historyReset === 'reset' ? mock.reset().calls : originalCalls
        browser.emit('network.responseStarted', { ...request, response, isBlocked: false })
        await new Promise(resolve => setImmediate(resolve))
        const waitResult = await Promise.resolve(mock.waitForResponse()).then(value => value, error => error)
        const restoreResult = await mock.restore().then(value => value, error => error)
        expect(waitResult).toBeInstanceOf(Error)
        expect(restoreResult).toBe(historyReset === 'none' ? error : mock)
        expect(originalCalls).toEqual([])
        expect(calls).toEqual([])
        if (historyReset === 'none') {
            expect(() => mock.calls).toThrow(error.message)
        }
    })

    it.each(['clear', 'reset'] as const)('retains a request failure that arrives after %s was called while fulfillment was pending', async historyReset => {
        const browser = browserMock('firefox')
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        let reject!: (error: Error) => void
        browser.networkProvideResponse.mockImplementation(() => new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise }))
        mock.respond('mock body')
        const { response, ...request } = event('https://example.org/api')
        browser.emit('network.beforeRequestSent', request)
        const calls = mock[historyReset]().calls
        const error = new Error('provide failed after clearing history')
        reject(error)
        await vi.waitFor(() => expect(browser.networkFailRequest).toHaveBeenCalledWith({ request: 'request' }))
        browser.emit('network.responseStarted', { ...request, response, isBlocked: false })
        await new Promise(resolve => setImmediate(resolve))
        await expect(mock.waitForResponse()).rejects.toThrow(error.message)
        await expect(mock.restore()).rejects.toBe(error)
        expect(calls).toEqual([])
    })

    it.each(['chrome', 'firefox'])('does not publish a response before its protocol operation succeeds (%s)', async browserName => {
        const browser = browserMock(browserName)
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        let fulfill!: () => void
        browser.networkProvideResponse.mockImplementation(() => new Promise<void>(resolve => { fulfill = resolve }))
        mock.respond('mock body')
        const { response, ...request } = event('https://example.org/api')
        if (browserName === 'firefox') {
            browser.emit('network.beforeRequestSent', request)
        }
        browser.emit('network.responseStarted', { ...request, response, isBlocked: browserName === 'chrome' })
        const settled = vi.fn()
        const waiting = Promise.resolve(mock.waitForResponse({ timeout: 1000 })).then(settled)
        try {
            await new Promise(resolve => setTimeout(resolve, 20))
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

    it.each(['chrome', 'firefox'])('propagates a delayed response failure to an already waiting caller and immediate restore (%s)', async browserName => {
        const browser = browserMock(browserName)
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        let reject!: (error: Error) => void
        browser.networkProvideResponse.mockImplementation(() => new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise }))
        mock.respond('mock body')
        const { response, ...request } = event('https://example.org/api')
        if (browserName === 'firefox') {
            browser.emit('network.beforeRequestSent', request)
        }
        browser.emit('network.responseStarted', { ...request, response, isBlocked: browserName === 'chrome' })
        const waiting = Promise.resolve(mock.waitForResponse({ timeout: 1000 })).then(value => value, error => error)
        const restoring = mock.restore().then(value => value, error => error)
        await new Promise(resolve => setTimeout(resolve, 20))
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
        const settled = vi.fn()
        const restoring = mock.restore().then(settled, error => error)
        browser.emit('network.responseStarted', event('https://example.org/api'))
        remove()
        await new Promise(resolve => setTimeout(resolve, 20))
        expect(settled).not.toHaveBeenCalled()
        const error = new Error('in-flight continuation failure during restore')
        reject(error)
        expect(await restoring).toBe(error)
        expect(browser.listenerCount('network.beforeRequestSent')).toBe(0)
        expect(browser.listenerCount('network.responseStarted')).toBe(0)
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

    it('provides Firefox response bodies before the request is sent', async () => {
        const browser = browserMock('firefox')
        const first = await BidiInterception.initiate('**/first', {}, browser as any)
        const second = await BidiInterception.initiate('**/second', {}, browser as any)
        first.respond({ source: 'first' })
        second.respond({ source: 'second' })

        for (const name of ['first', 'second']) {
            const { response, ...request } = event(`https://example.org/${name}`, ['1', '2'])
            request.request.request = name
            browser.emit('network.beforeRequestSent', request)
            expect(browser.networkProvideResponse).toHaveBeenLastCalledWith({
                request: name, body: { type: 'string', value: `{"source":"${name}"}` }
            })
            // Firefox responses are observed, not intercepted: intercepting a
            // synthetic response races its beforeRequestSent continuation.
            browser.emit('network.responseStarted', { ...request, response, isBlocked: false })
        }

        expect(browser.networkContinueRequest).not.toHaveBeenCalled()
        expect(browser.networkProvideResponse).toHaveBeenCalledTimes(2)
        await vi.waitFor(() => expect(first.calls).toHaveLength(1))
        await vi.waitFor(() => expect(second.calls).toHaveLength(1))
    })

    it('keeps Chromium default overwrites at responseStarted to retain the real response', async () => {
        const browser = browserMock()
        const mock = await BidiInterception.initiate('**/api', { statusCode: 201 }, browser as any)
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

    it.each(['chrome', 'firefox'])('honors fetchResponse: false on %s', async browserName => {
        const browser = browserMock(browserName)
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

    it('does not consume the next respondOnce overwrite at the synthetic response phase', async () => {
        const browser = browserMock('firefox')
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        mock.respondOnce('first')
        mock.respondOnce('second')
        const { response, ...request } = event('https://example.org/api')

        browser.emit('network.beforeRequestSent', request)
        browser.emit('network.responseStarted', { ...request, response, isBlocked: false })
        expect(browser.networkProvideResponse.mock.calls.map(([params]) => params.body?.value)).toEqual(['first'])
        request.request = { ...request.request, request: 'next' }
        browser.emit('network.beforeRequestSent', request)
        expect(browser.networkProvideResponse).toHaveBeenLastCalledWith({
            request: 'next', body: { type: 'string', value: 'second' }
        })
    })

    it('records an unblocked synthetic response without attempting to resume it', async () => {
        const browser = browserMock('firefox')
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        mock.respond('mock body')
        const { response, ...request } = event('https://example.org/api')
        browser.emit('network.beforeRequestSent', request)
        browser.emit('network.responseStarted', { ...request, response, isBlocked: false })
        await vi.waitFor(() => expect(mock.calls).toHaveLength(1))
        expect(browser.networkProvideResponse).toHaveBeenCalledTimes(1)
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

    it('does not silently ignore response filters when fetchResponse: false is explicit', async () => {
        const browser = browserMock()
        const mock = await BidiInterception.initiate('**/api', { statusCode: 200 }, browser as any)
        expect(() => mock.respond('mock body', { fetchResponse: false })).toThrow(/response.*filter/i)
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

    it('does not apply a newly configured Firefox response to an already sent request', async () => {
        const browser = browserMock('firefox')
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        const { response, ...request } = event('https://example.org/api')
        browser.emit('network.beforeRequestSent', request)
        mock.respondOnce('mock body')
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

    it.each(['chrome', 'firefox'])('reports asynchronous response failures through the mock rather than an unhandled rejection (%s)', async browserName => {
        const browser = browserMock(browserName)
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        browser.networkProvideResponse.mockRejectedValue(new Error('unsupported operation: cannot provide response'))
        mock.respond('mock body')
        const { response, ...request } = event('https://example.org/api')
        browser.emit(browserName === 'firefox' ? 'network.beforeRequestSent' : 'network.responseStarted', { ...request, ...(browserName === 'chrome' ? { response } : {}) })

        await vi.waitFor(() => expect(browser.networkFailRequest).toHaveBeenCalledWith({ request: 'request' }))
        expect(() => mock.calls).toThrow('unsupported operation: cannot provide response')
        await expect(mock.waitForResponse()).rejects.toThrow('unsupported operation: cannot provide response')
        mock.reset()
        expect(mock.calls).toEqual([])
    })

    it('does not intercept Firefox responses while providing synthetic request-stage responses', async () => {
        const browser = browserMock('firefox')
        await BidiInterception.initiate('**/api', {}, browser as any)
        expect(browser.networkAddIntercept).toHaveBeenCalledWith({
            phases: ['beforeRequestSent'], urlPatterns: [{ type: 'pattern' }]
        })
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

    it('does not resume an already provided Chromium response even when its event advertises intercepts', async () => {
        const browser = browserMock()
        const mock = await BidiInterception.initiate('**/api', {}, browser as any)
        mock.respondOnce('first', { fetchResponse: false })
        mock.respondOnce('second', { fetchResponse: false })
        const { response, ...request } = event('https://example.org/api')
        browser.emit('network.beforeRequestSent', request)
        browser.emit('network.responseStarted', { ...request, response })
        expect(browser.networkProvideResponse.mock.calls.map(([params]) => params.body?.value)).toEqual(['first'])
        await vi.waitFor(() => expect(mock.calls).toHaveLength(1))
    })
})
