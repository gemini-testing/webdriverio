import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebRequest } from '../src/request/web.js'

describe('browser HTTP transport', () => {
    const fetch = globalThis.fetch
    afterEach(() => vi.stubGlobal('fetch', fetch))

    it('sends JSON using a native Request with read-only duplex', async () => {
        let received: Request | undefined
        const send = vi.fn(async (request: Request) => {
            received = request
            return Response.json({ value: { sessionId: 'native-request' } })
        })
        vi.stubGlobal('fetch', send)

        const result = await new WebRequest('POST', '/session', { capabilities: {} }).makeRequest({
            protocol: 'http', hostname: 'localhost', port: 4444,
            connectionRetryCount: 0, connectionRetryTimeout: 1000
        })

        expect(result).toEqual({ value: { sessionId: 'native-request' } })
        expect(received).toBeInstanceOf(Request)
        expect(await received!.json()).toEqual({ capabilities: {} })
    })
    it('uses the configured response timeout instead of coercing its options object to 1 ms', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            await new Promise(resolve => setTimeout(resolve, 20))
            return Response.json({ value: 'delayed response' })
        }))

        await expect(new WebRequest('GET', '/status').makeRequest({
            protocol: 'http', hostname: 'localhost', port: 4444,
            connectionRetryCount: 0, connectionRetryTimeout: 1000
        })).resolves.toEqual({ value: 'delayed response' })
    })

})
