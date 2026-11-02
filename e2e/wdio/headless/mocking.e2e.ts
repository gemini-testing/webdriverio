import { browser, expect } from '@wdio/globals'
import type { local } from '@testplane/webdriver'
import { startTestPages } from '../../__fixtures__/pages.js'

describe('network mocking', () => {
    let pages: Awaited<ReturnType<typeof startTestPages>>
    const backendHits: string[] = []
    before(async () => {
        pages = await startTestPages(pathname => backendHits.push(pathname))
    })
    after(async () => { await pages.close() })

    it('marks a request as mocked even without overwrites', async () => {
        const baseUrl = `${pages.url}/`
        const mock = await browser.mock(`${baseUrl}resource.js`, {
            method: 'get',
            statusCode: 200,
        })
        await browser.url(baseUrl)
        await browser.waitUntil(() => mock.calls.length === 1, {
            timeoutMsg: 'Expected mock to be made',
            timeout: 2000
        })
    })

    it('fulfills a BiDi request from its async callback without contacting the backend', async function () {
        if (!browser.isBidi) {
            return this.skip()
        }
        await browser.url(pages.url)
        const mock = await browser.mock(`${pages.url}/dynamic.json`)
        try {
            await mock.respondOnce(async ({ method, url }) => `${method} ${new URL(url).pathname}`, {
                fetchResponse: false, statusCode: 201
            })
            const result = await browser.execute(async () => {
                const response = await fetch('/dynamic.json', { method: 'POST', signal: AbortSignal.timeout(5000) })
                return [response.status, await response.text()]
            })
            expect(result).toEqual([201, 'POST /dynamic.json'])
            expect(backendHits).not.toContain('/dynamic.json')
        } finally {
            await mock.restore()
        }
    })

    it('leaves a plugin response alone when a broad BiDi spy does not match', async function () {
        if (!browser.isBidi) {
            return this.skip()
        }
        await browser.url(pages.url)
        const url = `${pages.url}/invoice`
        const plugin = await browser.networkAddIntercept({ phases: ['beforeRequestSent'], urlPatterns: [{ type: 'string', pattern: url }] })
        const spy = await browser.mock('**/account')
        let provided: Promise<boolean> | undefined
        const listener = (event: local.NetworkBeforeRequestSentParameters) => {
            if (event.isBlocked && event.request.url === url) {
                provided = browser.networkProvideResponse({
                    request: event.request.request, body: { type: 'string', value: 'plugin response' }
                }).then(() => true, () => false)
            }
        }
        browser.on('network.beforeRequestSent', listener)
        try {
            const result = await browser.execute(async () => (await fetch('/invoice', { signal: AbortSignal.timeout(5000) })).text())
            expect(result).toBe('plugin response')
            expect(await provided).toBe(true)
            expect(backendHits).not.toContain('/invoice')
        } finally {
            browser.off('network.beforeRequestSent', listener)
            await browser.networkRemoveIntercept(plugin)
            await spy.restore()
        }
    })
})
