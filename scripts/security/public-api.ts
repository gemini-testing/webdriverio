import { remote, type Browser } from '@testplane/webdriverio'
import { setupBrowser, setupDriver } from '@testplane/wdio-utils/node'
import type { Browser as PuppeteerBrowser, CDPSession } from 'puppeteer-core'

async function check(browser: Browser) {
    const compatible = await browser.getPuppeteer()
    const modern: PuppeteerBrowser = compatible
    const context = await compatible.createIncognitoBrowserContext()
    const privateContext: boolean = context.isIncognito()
    const connected: boolean = compatible.isConnected()
    const page = await context.newPage()
    const session: CDPSession = await page.target().createCDPSession()
    await session.detach()
    await context.close()
    await modern.disconnect()
    return { privateContext, connected }
}
void check
void remote
void setupBrowser
void setupDriver
