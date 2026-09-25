import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebRequest } from '../src/request/web.js'
import type { RequestLibOptions } from '../src/request/types.js'

const options = {
    protocol: 'http', hostname: 'localhost', port: 4444,
    connectionRetryCount: 0, connectionRetryTimeout: 1000
}
const originalFetch = globalThis.fetch

afterEach(() => {
    vi.useRealTimers()
    vi.stubGlobal('fetch', originalFetch)
})

async function capture (method: string, body?: Record<string, unknown>, extra = {}, endpoint = '/session/:sessionId/element') {
    let wire: Request | undefined
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
        wire = request
        return Response.json({ value: 'ok' })
    }))
    const request = new WebRequest(method, endpoint, body)
    await request.makeRequest({ ...options, ...extra }, 'abc')
    return wire!
}

describe('webdriver request public API', () => {
    it('preserves method and endpoint and sends a request for the supplied session', async () => {
        const request = new WebRequest('POST', '/session/:sessionId/element', { using: 'css selector', value: '#foo' })
        const agent = { request: vi.fn().mockResolvedValue({ statusCode: 200, body: { value: 42 } }) }
        expect(request.method).toBe('POST')
        expect(request.endpoint).toBe('/session/:sessionId/element')
        await expect(request.makeRequest({ ...options, customWdRequestAgent: agent }, 'abc')).resolves.toEqual({ value: 42 })
        expect(agent.request).toHaveBeenCalledWith(new URL('http://localhost:4444/session/abc/element'), expect.objectContaining({
            method: 'POST', json: { using: 'css selector', value: '#foo' }
        }))
    })

    it('rejects a missing session ID before sending the request', async () => {
        const send = vi.fn()
        vi.stubGlobal('fetch', send)
        await expect(new WebRequest('POST', '/session/:sessionId/element', {}).makeRequest(options)).rejects.toThrow('A sessionId is required')
        expect(send).not.toHaveBeenCalled()
    })

    it('creates the URL and default/custom headers', async () => {
        const request = await capture('POST', {}, { protocol: 'https', port: 4445, path: '/wd/hub', headers: { foo: 'bar' } })
        expect(request.url).toBe('https://localhost:4445/wd/hub/session/abc/element')
        expect([...request.headers.keys()]).toEqual(['accept', 'connection', 'content-length', 'content-type', 'foo', 'user-agent'])
        expect(request.headers.get('foo')).toBe('bar')
        expect(request.signal.aborted).toBe(false)
    })

    it('adds Basic authorization for user and key', async () => {
        const request = await capture('POST', { some: 'body' }, { user: 'foo', key: 'bar' }, '/session')
        expect(request.headers.get('authorization')).toBe('Basic ' + btoa('foo:bar'))
        expect(await request.json()).toEqual({ some: 'body' })
    })

    it.each(['GET', 'DELETE'])('does not send an empty object for %s', async method => {
        const request = await capture(method, {})
        expect(request.body).toBeNull()
        expect(request.headers.has('content-length')).toBe(false)
    })

    it('sends an empty JSON object for POST', async () => {
        const request = await capture('POST', {})
        expect(await request.json()).toEqual({})
        expect(request.headers.get('content-length')).toBe('2')
    })

    it('calculates Content-Length in bytes and preserves custom headers', async () => {
        const body = { foo: 'тест' }
        const request = await capture('POST', body, { headers: { foo: 'bar' } })
        expect(request.headers.get('content-length')).toBe(String(Buffer.byteLength(JSON.stringify(body))))
        expect(request.headers.get('foo')).toBe('bar')
    })

    it('does not add Content-Length when no body was supplied', async () => {
        const request = await capture('POST', undefined, { headers: { foo: 'bar' } })
        expect(request.headers.has('content-length')).toBe(false)
        expect(request.headers.get('foo')).toBe('bar')
    })

    it('uses the options returned by transformRequest', async () => {
        const transformRequest = vi.fn((request: RequestLibOptions) => ({ ...request, json: { foo: 'baz' } }))
        expect(await (await capture('POST', { foo: 'bar' }, { transformRequest })).json()).toEqual({ foo: 'baz' })
        expect(transformRequest).toHaveBeenCalledTimes(1)
    })

    it('passes response and request options to transformResponse', async () => {
        const transformResponse = vi.fn((response, request) => ({ ...response, body: { value: request.json } }))
        const request = new WebRequest('POST', '/status', { foo: 'requestBody' })
        const agent = { request: vi.fn().mockResolvedValue({ statusCode: 200, body: { value: 'original' } }) }
        await expect(request.makeRequest({ ...options, transformResponse, customWdRequestAgent: agent })).resolves.toEqual({ value: { foo: 'requestBody' } })
        expect(transformResponse).toHaveBeenCalledWith({ statusCode: 200, body: { value: 'original' } }, expect.objectContaining({ json: { foo: 'requestBody' } }))
    })

    it.each([
        [200, { value: 'ok' }, true],
        [404, { value: { error: 'stale element reference', message: 'element is not attached to the page document' } }, false],
        [500, '', false]
    ])('emits request, response and performance events (status %s, success %s)', async (statusCode, body, success) => {
        const request = new WebRequest('POST', '/status', {})
        const onRequest = vi.fn(), onResponse = vi.fn(), onPerformance = vi.fn()
        request.on('request', onRequest).on('response', onResponse).on('performance', onPerformance)
        const agent = { request: vi.fn().mockResolvedValue({ statusCode, body }) }
        const promise = request.makeRequest({ ...options, customWdRequestAgent: agent })
        if (success) {
            await expect(promise).resolves.toEqual(body)
            expect(onResponse).toHaveBeenCalledWith({ result: body })
        } else {
            await expect(promise).rejects.toThrow(body ? 'element is not attached' : 'Response has empty body')
            expect(onResponse).toHaveBeenCalledWith({ error: expect.any(Error) })
        }
        expect(onRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST' }))
        expect(onPerformance).toHaveBeenCalledWith(expect.objectContaining({ success, retryCount: 0, durationMillisecond: expect.any(Number) }))
        expect(agent.request).toHaveBeenCalledTimes(1)
    })

    it.each([false, true])('retries failures and reports each attempt (eventual success: %s)', async succeeds => {
        const request = new WebRequest('POST', '/status', {})
        const onRetry = vi.fn(), onPerformance = vi.fn(), onResponse = vi.fn()
        request.on('retry', onRetry).on('performance', onPerformance).on('response', onResponse)
        const send = vi.fn().mockResolvedValue({ statusCode: 500, body: { value: { error: 'unknown error', message: 'failure' } } })
        if (succeeds) {
            send.mockResolvedValueOnce({ statusCode: 500, body: {} }).mockResolvedValueOnce({ statusCode: 200, body: { value: 'caught' } })
        }
        const promise = request.makeRequest({ ...options, connectionRetryCount: 2, customWdRequestAgent: { request: send } })
        await (succeeds ? expect(promise).resolves.toEqual({ value: 'caught' }) : expect(promise).rejects.toThrow('failure'))
        expect(send).toHaveBeenCalledTimes(succeeds ? 2 : 3)
        expect(onRetry).toHaveBeenCalledTimes(succeeds ? 1 : 2)
        expect(onResponse).toHaveBeenCalledTimes(1)
        expect(onPerformance).toHaveBeenCalledTimes(succeeds ? 2 : 3)
        expect(onPerformance).toHaveBeenLastCalledWith(expect.objectContaining({ success: succeeds }))
    })

    it.each([
        [{ some: 'config' }, { value: { some: 'config' } }],
        ['', { value: null }]
    ])('handles non-WebDriver hub responses', async (body, expected) => {
        const request = new WebRequest('POST', '/grid/api/hub', {}, true)
        const send = vi.fn().mockResolvedValue({ statusCode: 200, body })
        await expect(request.makeRequest({ ...options, path: '/ignored', customWdRequestAgent: { request: send } })).resolves.toEqual(expected)
        expect(send.mock.calls[0][0].href).toBe('http://localhost:4444/grid/api/hub')
    })

    it('rejects a hub command sent directly to a node', async () => {
        const request = new WebRequest('POST', '/grid/api/hub', {}, true)
        const send = vi.fn().mockResolvedValue({ statusCode: 200, body: '<!DOCTYPE html>not a hub' })
        await expect(request.makeRequest({ ...options, customWdRequestAgent: { request: send } })).rejects.toThrow('Command can only be called to a Selenium Hub')
    })

    it.each(['connect', 'response'])('handles %s timeouts without duplicating response-timeout commands', async event => {
        const error = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT', event })
        const send = vi.fn().mockRejectedValue(error)
        const request = new WebRequest('POST', '/status', {})
        const onRetry = vi.fn(), onResponse = vi.fn()
        request.on('retry', onRetry).on('response', onResponse)
        await expect(request.makeRequest({ ...options, connectionRetryCount: 2, customWdRequestAgent: { request: send } })).rejects.toMatchObject({ code: 'ETIMEDOUT' })
        expect(send).toHaveBeenCalledTimes(event === 'response' ? 1 : 3)
        expect(onRetry).toHaveBeenCalledTimes(event === 'response' ? 0 : 2)
        expect(onResponse).toHaveBeenCalledWith({ error: expect.objectContaining({ code: 'ETIMEDOUT' }) })
    })

    it.each(['timeout', 'connection refused'])('can succeed after a transient %s error', async reason => {
        const send = vi.fn().mockResolvedValue({ statusCode: 200, body: { value: 'recovered' } })
        if (reason === 'timeout') {send.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))} else {send.mockResolvedValueOnce({ statusCode: 500, body: { value: { message: 'java.net.ConnectException: Connection refused: connect' } } })}
        await expect(new WebRequest('POST', '/status', {}).makeRequest({ ...options, connectionRetryCount: 2, customWdRequestAgent: { request: send } })).resolves.toEqual({ value: 'recovered' })
        expect(send).toHaveBeenCalledTimes(2)
    })

    it('does not swallow or retry an unknown transport error', async () => {
        const error = new Error('ups')
        const send = vi.fn().mockRejectedValue(error)
        await expect(new WebRequest('POST', '/status', {}).makeRequest({ ...options, connectionRetryCount: 2, customWdRequestAgent: { request: send } })).rejects.toBe(error)
        expect(send).toHaveBeenCalledTimes(1)
    })

    it('retries a rate-limited request only after the 429 backoff', async () => {
        vi.useFakeTimers()
        const send = vi.fn().mockResolvedValueOnce({ statusCode: 429, body: {} }).mockResolvedValue({ statusCode: 200, body: { value: 'ok' } })
        const promise = new WebRequest('POST', '/status', {}).makeRequest({ ...options, connectionRetryCount: 1, customWdRequestAgent: { request: send } })
        await vi.advanceTimersByTimeAsync(4999)
        expect(send).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(1001)
        await expect(promise).resolves.toEqual({ value: 'ok' })
        expect(send).toHaveBeenCalledTimes(2)
    })
})
