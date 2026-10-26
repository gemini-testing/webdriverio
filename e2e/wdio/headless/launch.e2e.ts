import { browser, $, expect } from '@wdio/globals'
import { startTestPages } from '../../__fixtures__/pages.js'

describe('Launch Test', () => {
    let pages: Awaited<ReturnType<typeof startTestPages>>
    before(async () => { pages = await startTestPages() })
    after(async () => { await pages?.close() })

    it('should verify that right browser was initiated', async () => {
        const caps = browser.capabilities as WebdriverIO.Capabilities
        const assertionValue = caps.browserName?.toLowerCase().includes('edge')
            ? 'Edg/'
            : caps.browserName && caps.browserName.includes('chrome') ? 'chrome/' : caps.browserName!.toLowerCase()
        await browser.url(pages.url)
        await expect($('#useragent')).toHaveText(expect.stringContaining(assertionValue), { ignoreCase: true })

    // @ts-expect-error
    }, { retry: 2 })
})
