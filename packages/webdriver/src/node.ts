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
         * Currently Nock doesn't support the mocking of undici requests, therefore for all
         * Smoke test we use the native fetch implementation.
         *
         * @see https://github.com/nock/nock/issues/2183#issuecomment-2252525890
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
