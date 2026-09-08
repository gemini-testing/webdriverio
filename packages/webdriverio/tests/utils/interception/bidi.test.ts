import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import BidiInterception from '../../../src/utils/interception/bidi.js'

function browserMock () {
    let id = 0
    return Object.assign(new EventEmitter(), {
        sessionId: 'session',
        sessionSubscribe: vi.fn().mockResolvedValue({}),
        networkAddIntercept: vi.fn().mockImplementation(async () => ({ intercept: String(++id) })),
        networkContinueRequest: vi.fn().mockResolvedValue({}),
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
        expect(mock.calls).toHaveLength(1)
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
