import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

// Resolve from the installed tarballs, not from the monorepo's devDependencies.
const consumer = createRequire(path.join(process.env.WDIO_CONSUMER_DIR, 'package.json'))
const utils = createRequire(consumer.resolve('@testplane/wdio-utils'))
const { canDownload, install } = await import(pathToFileURL(utils.resolve('@puppeteer/browsers')))
const wdio = createRequire(consumer.resolve('@testplane/webdriverio'))
const { default: JSZip } = await import(pathToFileURL(wdio.resolve('jszip')))

for (const key of Object.keys(process.env)) {
    if (/^(?:npm_config_)?(?:(?:https?|all|no)_)?proxy$/i.test(key)) {
        delete process.env[key]
    }
}

async function server(t, handler) {
    const instance = createServer(handler)
    t.after(() => {
        instance.closeAllConnections()
        return new Promise(resolve => instance.close(resolve))
    })
    instance.listen(0, '127.0.0.1')
    await once(instance, 'listening')
    return `http://127.0.0.1:${instance.address().port}`
}

test('browser downloads honor HTTP_PROXY in a clean installation', { timeout: 10000 }, async t => {
    const hits = []
    const baseUrl = await server(t, (req, res) => {
        hits.push('direct')
        res.writeHead(404).end()
    })
    process.env.HTTP_PROXY = await server(t, (req, res) => {
        hits.push('proxy')
        res.writeHead(200).end()
    })
    t.after(() => { delete process.env.HTTP_PROXY })

    assert.equal(await canDownload({ browser: 'chromedriver', platform: 'linux', buildId: '130.0.0.0', baseUrl }), true)
    assert.deepEqual(hits, ['proxy'])
})

test('browser ZIP installation works without a system unzip', { timeout: 10000 }, async t => {
    const zip = new JSZip().file('chromedriver-linux64/chromedriver', 'driver fixture')
    const archive = await zip.generateAsync({ type: 'nodebuffer' })
    const baseUrl = await server(t, (req, res) => res.writeHead(200).end(archive))
    const cacheDir = await mkdtemp(path.join(tmpdir(), 'wdio-browser-install-'))
    const oldPath = process.env.PATH
    process.env.PATH = path.join(cacheDir, 'no-system-tools')
    t.after(async () => {
        process.env.PATH = oldPath
        await rm(cacheDir, { recursive: true, force: true })
    })

    const browser = await install({ browser: 'chromedriver', platform: 'linux', buildId: '130.0.0.0', baseUrl, cacheDir })
    assert.equal(await readFile(browser.executablePath, 'utf8'), 'driver fixture')
})
