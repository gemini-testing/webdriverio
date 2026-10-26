import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import puppeteer from 'puppeteer-core'
import { remote } from '@testplane/webdriverio'

assert.ok(process.env.OLD_PUPPETEER_DIR, 'Set OLD_PUPPETEER_DIR to a separate npm project containing puppeteer-core@20.9.0')
const oldRequire = createRequire(path.resolve(process.env.OLD_PUPPETEER_DIR, 'package.json'))
const oldPuppeteer = oldRequire('puppeteer-core')
assert.equal(oldRequire('puppeteer-core/package.json').version, '20.9.0')
const mode = process.env.BROWSER || 'chrome'
assert.ok(['chrome', 'firefox'].includes(mode))
const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><title>Compatibility</title><h1>Same browser, two clients</h1>')
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const url = `http://127.0.0.1:${server.address().port}`
const results = []
let browser
async function probe(client, name, action) {
    let timer
    try {
        const detail = await Promise.race([
            Promise.resolve().then(action),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${name}: timed out after 10 seconds`)), 10000)
            })
        ])
        results.push({ client, name, status: 'PASS', detail })
    } catch (error) {
        results.push({ client, name, status: 'FAIL', error: error.message })
    } finally {
        clearTimeout(timer)
        console.log(JSON.stringify(results.at(-1)))
    }
}
try {
    if (!process.env.CDP_BROWSER_URL) {
        browser = await remote({
            cacheDir: path.resolve(process.env.BROWSER_CACHE || 'browser-cache'),
            logLevel: 'warn', connectionRetryCount: 0, connectionRetryTimeout: 30000,
            capabilities: {
                browserName: mode,
                browserVersion: process.env.BROWSER_VERSION,
                'wdio:enforceWebDriverClassic': true,
                ...(mode === 'firefox' ? { 'moz:debuggerAddress': true } : {}),
                [mode === 'chrome' ? 'goog:chromeOptions' : 'moz:firefoxOptions']: {
                    binary: process.env.BROWSER_BINARY,
                    args: mode === 'chrome' ? ['--headless=new', '--disable-gpu'] : ['-headless'],
                    ...(mode === 'firefox' ? { prefs: { 'remote.active-protocols': 3 } } : {})
                }
            }
        })
        await browser.url(url)
    }
    const endpoint = process.env.CDP_BROWSER_URL || (mode === 'chrome'
        ? browser.capabilities['goog:chromeOptions'].debuggerAddress
        : browser.capabilities['moz:debuggerAddress'])
    assert.ok(endpoint, 'Browser must expose a CDP HTTP debugger address')
    for (const [name, library] of [['20.9.0', oldPuppeteer], ['candidate', puppeteer]]) {
        let client
        try {
            await probe(name, 'CDP connect', async () => {
                client = await library.connect({
                    browserURL: endpoint.startsWith('http') ? endpoint : `http://${endpoint}`,
                    defaultViewport: null, protocol: 'cdp', protocolTimeout: 5000
                })
                return client.version()
            })
            if (!client) {
                continue
            }
            let page
            await probe(name, 'pages', async () => {
                page = (await client.pages())[0] || await client.newPage()
            })
            if (!page) {
                results.push({ client: name, name: 'Page-dependent checks', status: 'SKIP', detail: 'No page after the failed pages probe' })
                continue
            }
            await probe(name, 'navigation', () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 }).then(() => undefined))
            await probe(name, 'pages/evaluate/CDPSession', async () => {
                assert.equal(await page.evaluate(() => globalThis.document.title), 'Compatibility')
                const cdp = await page.target().createCDPSession()
                try {
                    await cdp.send('Runtime.evaluate', { expression: '1 + 1' })
                } finally {
                    await cdp.detach()
                }
            })
            await probe(name, 'Testplane legacy context isolation', async () => {
                const context = await client.createIncognitoBrowserContext()
                try {
                    assert.equal(context.isIncognito(), true)
                    await context.newPage()
                } finally {
                    await context.close()
                }
            })
            await probe(name, 'legacy isConnected', () => assert.equal(client.isConnected(), true))
            await probe(name, 'legacy Buffer screenshot', async () => {
                assert.ok(Buffer.isBuffer(await page.screenshot()), 'Expected Buffer, not plain Uint8Array')
            })
            results.push({ client: name, name: 'Page API shape', status: 'INFO', detail: {
                waitForTimeout: typeof page.waitForTimeout,
                $x: typeof page.$x,
                waitForXPath: typeof page.waitForXPath
            } })
        } finally {
            if (client) {
                await client.disconnect()
            }
        }
    }
} finally {
    try {
        if (browser) {
            await browser.deleteSession()
        }
    } finally {
        server.closeAllConnections()
        await new Promise(resolve => server.close(resolve))
        const report = { node: process.version, browser: browser?.capabilities.browserVersion, mode, results }
        writeFileSync('puppeteer-comparison.json', JSON.stringify(report, null, 2) + '\n')
        console.log(JSON.stringify(report, null, 2))
    }
}
// This intentionally tests raw upstream clients, not the compatibility adapter.
// Nonzero is meaningful evidence of removed APIs, not a reason to skip the probes.
if (results.some(result => result.status === 'FAIL')) {
    process.exitCode = 1
}
