import { expectAssignable, expectType } from 'tsd'
import type { Browser, BrowserContext, EventsWithWildcard, Page, PageEvents } from 'puppeteer-core'

async function bar() {
    const pptr = await browser.getPuppeteer()
    const page = await pptr.newPage()
    expectAssignable<Browser>(pptr)
    expectAssignable<BrowserContext>(pptr.defaultBrowserContext())
    expectAssignable<Page>(page)
    page.on('*', event => expectType<EventsWithWildcard<PageEvents>['*']>(event))
    expectType<boolean>(page.browser().isConnected())
    expectType<boolean>(page.browserContext().isIncognito())
    const target = await pptr.waitForTarget(target => target.browserContext().isIncognito())
    expectType<boolean>(target.browser().isConnected())
    expectType<boolean>((await target.page())!.browserContext().isIncognito())
    expectType<boolean>((await pptr.defaultBrowserContext().pages())[0].target().browserContext().isIncognito())
    browser.puppeteer?.defaultBrowserContext().isIncognito()
    pptr.on('targetcreated', target => expectType<boolean>(target.browserContext().isIncognito()))
    pptr.defaultBrowserContext().once('targetdestroyed', target => expectType<boolean>(target.browser().isConnected()))
    page.on('popup', popup => popup?.browserContext().isIncognito())
    const onError = (error: Error) => expectType<string>(error.message)
    page.on('pageerror', onError).off('pageerror', onError)
    page.once('pageerror', error => expectType<string>(error.message))
    page.on('request', req => req.frame()?.page().browser().isConnected())
    expectType<boolean>(page.mainFrame().page().browserContext().isIncognito())
    const fromReturnType: Awaited<ReturnType<typeof pptr.newPage>> = page
    expectType<boolean>(fromReturnType.browserContext().isIncognito())
    page.on('console', message => expectType<boolean>(message.type() === 'warning'))

    browser.enablePerformanceAudits()
    browser.enablePerformanceAudits({
        networkThrottling: 'online',
        cpuThrottling: 0,
        cacheEnabled: false,
        formFactor: 'desktop'
    })
    browser.disablePerformanceAudits()

    const metrics = await browser.getMetrics()
    expectType<number>(metrics.totalBlockingTime)
    expectType<number>(metrics.maxPotentialFID)

    const diagnostics = await browser.getDiagnostics()
    const mainThreadWorkBreakdown = await browser.getMainThreadWorkBreakdown()
    expectType<number>(mainThreadWorkBreakdown[0].duration)

    const performanceScore: number = await browser.getPerformanceScore()
    expectType<number>(performanceScore)

    const pwaCheck = await browser.checkPWA()
    pwaCheck.passed
    expectType<number>(pwaCheck.details['foo'].score)

    const pwaFilterdCheck = await browser.checkPWA(['maskableIcon', 'isInstallable'])
    expectType<boolean>(pwaFilterdCheck.passed)

    browser.startTracing()
    browser.startTracing({ path: '/foo' })
    browser.endTracing()

    const traceLogs = await browser.getTraceLogs()
    expectType<string>(traceLogs[0].cat)

    const pageWeight = await browser.getPageWeight()
    expectType<number>(pageWeight.requestCount)
}
