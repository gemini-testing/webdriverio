import os from 'node:os'
import { afterEach, test, expect } from 'vitest'
import { startTestPages } from '../__fixtures__/pages.js'

import { remote, attach } from '@testplane/webdriverio'

let browser: WebdriverIO.Browser | undefined
let pages: Awaited<ReturnType<typeof startTestPages>> | undefined

afterEach(async () => {
    try {
        await browser?.deleteSession().catch(() => {})
    } finally {
        await pages?.close()
    }
})

test('allow to attach to an existing session', async () => {
    /**
     * fails in windows due to timeout:
     * > Command browsingContext.navigate with id 1 (with the following parameter: {"context":"BD746B5679530BC3403539C2FEC5A45A","url":"https://guinea-pig.webdriver.io","wait":"interactive"}) timed out
     */
    if (os.platform() === 'win32') {
        return
    }

    pages = await startTestPages()
    browser = await remote({
        capabilities: {
            browserName: 'chrome',
            'goog:chromeOptions': {
                args: ['headless', 'disable-gpu']
            }
        }
    })

    await browser.url(pages.url)
    expect(await browser.getTitle()).toBe('WebdriverJS Testpage')
    const origContextTree = await browser.browsingContextGetTree({ maxDepth: 1 })
    expect(origContextTree.contexts).toHaveLength(1)
    expect(typeof origContextTree.contexts[0].context).toBe('string')

    const otherBrowser = await attach(browser)
    expect(await otherBrowser.getTitle()).toBe('WebdriverJS Testpage')
    const newContextTree = await otherBrowser.browsingContextGetTree({ maxDepth: 1 })
    expect(origContextTree.contexts[0].context).toBe(newContextTree.contexts[0].context)

    /**
     * can open other pages which requires e.g. network manager to be reinitialized correctly
     */
    await otherBrowser.url(`${pages.url}/two.html`)
    expect(await otherBrowser.getTitle()).toBe('two')

    await otherBrowser.deleteSession()

    /**
     * verify that browser session is deleted
     */
    const error = await browser.status().catch((err) => err)
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('ECONNREFUSED')
})
