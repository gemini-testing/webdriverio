import { browser } from '@wdio/globals'
import { startTestPages } from '../../__fixtures__/pages.js'

describe('network mocking', () => {
    let pages: Awaited<ReturnType<typeof startTestPages>>
    before(async () => { pages = await startTestPages() })
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
})
