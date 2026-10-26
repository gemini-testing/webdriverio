import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import path from 'node:path'
import { remote } from '@testplane/webdriverio'

const mode = process.env.BROWSER || 'chrome'
assert.ok(['chrome', 'firefox'].includes(mode))
const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (req.url === '/api') {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ source: 'server' }))
    } else {
        res.setHeader('Content-Type', 'text/html')
        res.end('<!doctype html><title>Security smoke</title><h1 id="hello">Hello</h1>')
    }
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const url = `http://127.0.0.1:${server.address().port}`
let browser
try {
    browser = await remote({
        cacheDir: path.resolve(process.env.BROWSER_CACHE || 'browser-cache'),
        logLevel: 'warn', connectionRetryCount: 0, connectionRetryTimeout: 30000,
        capabilities: {
            browserName: mode,
            browserVersion: process.env.BROWSER_VERSION,
            'wdio:enforceWebDriverClassic': process.env.BIDI !== '1',
            [mode === 'chrome' ? 'goog:chromeOptions' : 'moz:firefoxOptions']: {
                binary: process.env.BROWSER_BINARY,
                args: mode === 'chrome' ? ['--headless=new', '--disable-gpu', '--no-first-run'] : ['-headless']
            }
        }
    })
    console.log(`${process.version}: ${mode} ${browser.capabilities.browserVersion}, BiDi=${browser.isBidi}`)
    await browser.url(url)
    assert.equal(await browser.getTitle(), 'Security smoke')
    assert.equal(await browser.$('#hello').getText(), 'Hello')
    if (mode === 'chrome') {
        const pptr = await browser.getPuppeteer()
        assert.equal(pptr.isConnected(), true)
        assert.equal(await browser.getPuppeteer(), pptr)

        // The context calls below reproduce Testplane's existing session isolation API.
        const originalHandle = await browser.getWindowHandle()
        const defaultContext = pptr.defaultBrowserContext()
        assert.equal(defaultContext.isIncognito(), false)
        await browser.setCookies([{ name: 'security-original', value: 'yes', domain: '127.0.0.1', path: '/' }])
        const context = await pptr.createIncognitoBrowserContext()
        try {
            assert.equal(context.isIncognito(), true)
            assert.ok(pptr.browserContexts().includes(context))
            const page = await context.newPage()
            await page.goto(url)
            assert.equal(await page.evaluate(() => globalThis.document.cookie), '')
            const handle = (await browser.getWindowHandles()).find(id => id.includes(page.target()._targetId))
            assert.ok(handle, 'Testplane target ID to WebDriver window mapping')
            await browser.switchToWindow(handle)
            await page.bringToFront()
            assert.equal(await browser.getTitle(), 'Security smoke')
        } finally {
            await context.close()
            await browser.switchToWindow(originalHandle)
        }
        assert.ok((await browser.getCookies()).some(cookie => cookie.name === 'security-original'))

        const response = await browser.mock('**/api')
        await response.respond({ source: 'mock' })
        const request = () => browser.executeAsync(done => {
            fetch('/api').then(r => r.json()).then(done, error => done({ error: String(error) }))
        })
        assert.deepEqual(await request(), { source: 'mock' })
        await response.restore()
        assert.deepEqual(await request(), { source: 'server' })
        await browser.throttleCPU(2)
        await browser.throttleCPU(1)
        await browser.throttleNetwork('WiFi')
        await browser.throttleNetwork('online')
        console.log(`PASS isolation, target mapping, ${browser.isBidi ? 'BiDi' : 'CDP'} mock/restore, CPU/network throttle`)
    }
    const oldSession = browser.sessionId
    await browser.reloadSession()
    assert.notEqual(browser.sessionId, oldSession)
    await browser.url(url)
    assert.equal(await browser.getTitle(), 'Security smoke')
    if (mode === 'chrome') {
        // A second mock after reload proves the new session subscribed again.
        const response = await browser.mock('**/api')
        response.respond({ source: 'after-reload' })
        const value = await browser.executeAsync(done => {
            fetch('/api').then(r => r.json()).then(done, error => done({ error: String(error) }))
        })
        assert.deepEqual(value, { source: 'after-reload' })
        // A wildcard intercept must not leave unrelated requests blocked.
        assert.equal(await browser.executeAsync(done => {
            fetch('/unmatched').then(r => r.text()).then(text => done(text.includes('Security smoke')))
        }), true)
        await response.restore()
        const pptr = await browser.getPuppeteer()
        await pptr.disconnect()
        assert.equal(pptr.isConnected(), false)
    }
    console.log('PASS navigation, element, reload, disconnect')
} finally {
    try {
        if (browser) {
            await browser.deleteSession()
        }
    } finally {
        server.closeAllConnections()
        await new Promise(resolve => server.close(resolve))
    }
}
