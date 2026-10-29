import { afterEach, test, expect } from 'vitest'
import { startTestPages } from '../__fixtures__/pages.js'

import { remote } from '@testplane/webdriverio'

let browser: WebdriverIO.Browser | undefined
let pages: Awaited<ReturnType<typeof startTestPages>> | undefined

afterEach(async () => {
    try {
        await browser?.deleteSession().catch(() => {})
    } finally {
        await pages?.close()
    }
})

test('can reconnect to WebDriver Bidi session', async () => {
    pages = await startTestPages()
    browser = await remote({
        capabilities: {
            browserName: 'chrome',
            'goog:chromeOptions': {
                args: ['headless', 'disable-gpu']
            }
        }
    })

    expect(typeof await browser.browsingContextGetTree({})).toBe('object')
    await browser.reloadSession()
    console.log('\n\nRESTARTED\n\n')

    expect(typeof await browser.browsingContextGetTree({})).toBe('object')
    await browser.url(pages.url)
    expect(await browser.getTitle()).toBe('WebdriverJS Testpage')
    const h1 = await browser.$('h1')
    expect(await h1.getText()).toBe('WebdriverJS Testpage')
    await browser.deleteSession()
})
