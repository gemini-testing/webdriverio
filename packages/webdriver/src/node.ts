import os from 'node:os'
import ws from 'ws'

import WebDriver from './index.js'
import { NodeJSRequest } from './request/node.js'
import { WebRequest } from './request/web.js'
import { createBidiConnection } from './node/bidi.js'
import type { BrowserSocket } from './bidi/socket.js'

export default WebDriver
export * from './index.js'

import { environment } from './environment.js'

environment.value = {
    Request: (
        /**
         * Smoke tests can explicitly select the native fetch transport.
         */
        process.env.WDIO_USE_NATIVE_FETCH ||
        /**
         * For unit tests we use the WebRequest implementation as we can better mock the
         * requests in the unit tests.
         */
        process.env.WDIO_UNIT_TESTS
    ) ? WebRequest : NodeJSRequest,
    Socket: ws as unknown as typeof BrowserSocket,
    createBidiConnection,
    variables: {
        WEBDRIVER_CACHE_DIR: process.env.WEBDRIVER_CACHE_DIR || os.tmpdir(),
        PROXY_URL: process.env.HTTP_PROXY || process.env.HTTPS_PROXY
    }
}
