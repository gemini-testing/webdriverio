import { browser } from '@wdio/globals'
import scripts from './__fixtures__/script.js'
import { startTestPages } from '../../__fixtures__/pages.js'

let pages: Awaited<ReturnType<typeof startTestPages>>
before(async () => { pages = await startTestPages() })
after(async () => { await pages?.close() })

describe('__name polyfill', () => {
    it('suppports __name polyfill for classic sessions', async () => {
        await browser.url(pages.url)
        expect(await browser.execute(scripts.someScript, 'foo')).toBe('Hello World! foo')
        expect(await browser.executeAsync(scripts.someAsyncScript, 'foo')).toBe('Hello World! foo')
    })
})

describe('handle windows in webdriver classic', () => {
    it('should handle window closing and switching in WebDriver Classic mode', async () => {
        await browser.url(pages.url)
        const newWindowLink = await $('#open-window')
        await newWindowLink.waitForDisplayed()
        await newWindowLink.click()
        await browser.waitUntil(async () => (await browser.getWindowHandles()).length === 2)
        await browser.switchWindow(`${pages.url}/two.html`)
        await $('#second-window').waitForDisplayed()
        await browser.closeWindow()
        await browser.waitUntil(async () => (await browser.getWindowHandles()).length === 1)
        // Classic closeWindow closes the context but does not select another one.
        await browser.switchWindow(pages.url)
        await $('#second-window').waitForDisplayed({ reverse: true })

        // Verify we're on the original window
        expect(await $('h1').getText()).toBe('WebdriverJS Testpage')
    })
})
