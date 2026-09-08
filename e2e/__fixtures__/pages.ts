import http from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'

// Connection/lifecycle tests need deterministic pages, not an external site's
// availability, redirects or third-party subresources.
export async function startTestPages () {
    let finishDeferredPage: () => void
    const deferredPage = new Promise<void>(resolve => { finishDeferredPage = resolve })
    const server = http.createServer((req, res) => {
        const pathname = new URL(req.url!, 'http://localhost').pathname
        res.setHeader('Cache-Control', 'no-store')
        if (pathname === '/deferred.html') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.write('<!doctype html><title>Deferred response</title><div id="useragent"></div>')
            void deferredPage.then(() => res.end('<script src="/resource.js"></script>'))
            return
        }
        if (pathname === '/resource.js') {
            res.setHeader('Content-Type', 'application/javascript')
            res.end("document.getElementById('useragent').textContent = navigator.userAgent")
            return
        }
        if (pathname === '/basic_auth' && req.headers.authorization !== `Basic ${Buffer.from('admin:admin').toString('base64')}`) {
            res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="test"' })
            res.end('Authentication required')
            return
        }
        if (pathname === '/pointer.html' || pathname === '/pointer-inner.html') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(`<!doctype html><title>Pointer fixture</title>
                <style>
                    #parent { width:160px; height:120px; position:relative; background:#99c0c3 }
                    #child { width:50%; height:50%; position:absolute; left:25%; top:25%; background:#ffde99 }
                    iframe { display:block; margin-top:600px; width:600px; height:300px; border:0 }
                </style>
                <div id="parent"><div id="child"></div></div><input id="text">
                <script>
                    document.getElementById('parent').addEventListener('mousemove', event => {
                        document.getElementById('text').value = event.target.id === 'child' ? 'center' : 'out'
                    })
                </script>
                ${pathname === '/pointer.html' ? '<iframe class="code-tabs__result" src="/pointer-inner.html"></iframe>' : ''}`)
            return
        }
        if (pathname === '/contribute.html') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end('<!doctype html><title>Contribute | WebdriverIO</title><h1>Contribute</h1>')
            return
        }
        const framePages: Record<string, string> = {
            '/iframe.html': '<title>Frame Demo</title><h1>Frame Demo</h1><iframe id="A" src="/iframeA.html" style="width:100%;height:192px"></iframe>',
            '/iframeA.html': '<title>IFrame A</title><style>h2{margin:0}body{margin:0;white-space:nowrap}</style><h2>IFrame A</h2><iframe id="A1" src="/iframeA1.html" width="180" height="85"></iframe><iframe id="A2" src="/iframeA2.html" width="180" height="85"></iframe>',
            '/iframeA1.html': '<title>IFrame A1</title><h3>IFrame A1</h3>',
            '/iframeA2.html': '<title>IFrame A2</title><style>html{height:100%}body,h3{margin:0}</style><h3>IFrame A2</h3>',
            '/nested_frames': '<frameset><frame src="/frame_top"></frameset>',
            '/frame_top': '<frameset cols="50%,50%"><frame src="/frame_left"><frame src="/frame_right"></frameset>',
            '/frame_left': '<h1>Left frame</h1>',
            '/frame_right': '<h1>Right frame</h1>',
            '/iframe': '<iframe src="/editor.html"></iframe>',
            '/editor.html': '<div id="tinymce" contenteditable="true">Editable frame</div>',
            '/iframeNavigation.html': '<iframe src="/iframeNavigationInner.html"></iframe>',
            '/iframeNavigationInner.html': '<a href="/iframeTarget.html" target="_top">Navigate top</a><button onclick="top.location.href=\'/iframeTarget.html\'">Navigate with location</button>',
            '/iframeTarget.html': '<h1>Iframe Target</h1>',
        }
        if (pathname in framePages) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(`<!doctype html>${framePages[pathname]}`)
            return
        }
        if (pathname === '/shadow.html') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(`<!doctype html><h1>Shadow DOM</h1><div id="host"><ul slot="my-text"><li>In a list!</li></ul></div>
                <script>
                    document.getElementById('host').attachShadow({ mode: 'open' }).innerHTML =
                        '<slot name="my-text"></slot><input class="new-todo" placeholder="What needs to be done?">'
                </script>`)
            return
        }
        if (pathname === '/reloadCounter.html') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(`<!doctype html><section id="reloadCounter"><input id="counter" type="number" disabled><button id="reset">Reset</button></section>
                <script>
                    const counter = document.getElementById('counter')
                    const reloads = Number(localStorage.getItem('reloadCounter') || 0)
                    counter.value = reloads
                    localStorage.setItem('reloadCounter', String(reloads + 1))
                    document.getElementById('reset').onclick = () => {
                        counter.value = 0
                        localStorage.removeItem('reloadCounter')
                    }
                </script>`)
            return
        }
        if (pathname === '/other.html') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end('<!doctype html><title>Another test page</title><h1 class="hero__subtitle">Another page</h1>')
            return
        }
        const title = pathname === '/two.html' ? 'two' : 'WebdriverJS Testpage'
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(`<!doctype html><title>${title}</title><h1>${title}</h1>
            <h1 class="findme">Test CSS Attributes</h1>
            <div class="red">Red box</div>
            <button aria-label="Toggle navigation bar" onclick="document.querySelector('.navbar-sidebar').hidden = false">Menu</button>
            <nav class="navbar-sidebar" hidden>
                <a class="menu__link" href="/">Home</a>
                <a class="menu__link" href="/two.html">Second page</a>
                <a class="menu__link" href="/contribute.html">Contribute</a>
            </nav>
            <input class="searchinput" style="display:block; margin-top:1500px; margin-left:1200px">
            <footer>Footer</footer>
            <div id="useragent"></div>
            <script src="/resource.js"></script>
            ${pathname === '/basic_auth' ? '<p>Congratulations! You must have the proper credentials.</p>' : ''}
            ${pathname === '/two.html'
        ? '<div id="second-window">Second window</div><div class="page">Second page!</div>'
        : '<a id="newWindow" href="/two.html" target="_blank">Open new tab</a><a id="open-window" href="/two.html" target="_blank">Open second window</a>'}`)
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    return {
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        finishDeferredPage: () => finishDeferredPage(),
        close: async () => {
            server.closeAllConnections()
            await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
        }
    }
}
