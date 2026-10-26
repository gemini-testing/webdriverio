import http from 'node:http'
import { readFileSync } from 'node:fs'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'

/** A real installable app, independent of public websites and their redirects. */
export async function startPWAPages () {
    const icons = new Map(['icon-192x192.png', 'icon-512x512.png', 'maskable_icon.png'].map(name => [
        `/${name}`, readFileSync(new URL(`../../website/static/img/icons/${name}`, import.meta.url))
    ]))
    const server = http.createServer((req, res) => {
        res.setHeader('Cache-Control', 'no-store')
        const icon = icons.get(req.url || '')
        if (icon) {
            res.setHeader('Content-Type', 'image/png')
            return res.end(icon)
        }
        if (req.url === '/manifest.json') {
            res.setHeader('Content-Type', 'application/manifest+json')
            return res.end(JSON.stringify({
                name: 'Local WebdriverIO PWA', short_name: 'WDIO', start_url: '/', scope: '/',
                display: 'standalone', background_color: '#ffffff', theme_color: '#ea5906',
                icons: [
                    { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
                    { src: '/maskable_icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
                ]
            }))
        }
        if (req.url === '/sw.js') {
            res.setHeader('Content-Type', 'text/javascript')
            return res.end(`
                self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
                self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
                self.addEventListener('fetch', event => event.respondWith(fetch(event.request)));
            `)
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        if (req.url === '/plain') {
            return res.end('<!doctype html><title>Not a PWA</title><h1>Plain rendered page</h1><p>No manifest</p>')
        }
        res.end(`<!doctype html><html lang="en"><head>
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <meta name="theme-color" content="#ea5906">
            <link rel="manifest" href="/manifest.json">
            <link rel="apple-touch-icon" href="/icon-192x192.png">
            <title>Local WebdriverIO PWA</title>
            </head><body><h1>Local installable app</h1><p>Real Lighthouse audit fixture.</p>
            <script>
                navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready)
                    .then(() => { document.body.dataset.ready = 'true'; });
            </script></body></html>`)
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    return {
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        close: async () => {
            server.closeAllConnections()
            await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
        }
    }
}
