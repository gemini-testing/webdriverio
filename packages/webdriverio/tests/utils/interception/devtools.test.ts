import { describe, expect, it, vi } from 'vitest'
import type { CDPSession, Protocol } from 'puppeteer-core'
import DevtoolsInterception from '../../../src/utils/interception/devtools.js'

describe('CDP response interception', () => {
    it('enriches a raw CDP request in place and fulfills a mocked response', async () => {
        const send = vi.fn().mockResolvedValue({ body: '{"original":true}' })
        const client = { send } as unknown as CDPSession
        const mock = new DevtoolsInterception('**/api', {}, {} as WebdriverIO.Browser)
        mock.respond({ mocked: true })
        const event: Protocol.Fetch.RequestPausedEvent = {
            requestId: 'request', frameId: 'frame', resourceType: 'Fetch',
            request: {
                url: 'https://example.test/api', method: 'GET', headers: {},
                initialPriority: 'High', referrerPolicy: 'no-referrer'
            },
            responseStatusCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }]
        }

        await DevtoolsInterception.handleRequestInterception(client, new Set([mock]))(event)

        expect(mock.calls).toHaveLength(1)
        expect(mock.calls[0]).toBe(event.request)
        expect(mock.calls[0]).toMatchObject({
            body: { original: true }, statusCode: 200,
            responseHeaders: { 'Content-Type': 'application/json' },
            mockedResponse: '{"mocked":true}'
        })
        expect(send).toHaveBeenCalledWith('Fetch.fulfillRequest', {
            requestId: 'request', responseCode: 200,
            responseHeaders: event.responseHeaders,
            body: Buffer.from('{"mocked":true}').toString('base64')
        })
    })
})
