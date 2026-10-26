import os from 'node:os'
import url from 'node:url'
import path from 'node:path'
import { loadEnv } from 'vite'
import { expect } from '@wdio/globals'

/**
 * skip tests if:
 */
if (
    /**
     * WebdriverIO is using this example to test its component testing features
     * and we have experienced issues with Vue when running in Windows,
     * see https://github.com/testing-library/vue-testing-library/issues/292
     * Please ignore and remove this in your project!
     */
    process.env.CI && os.platform() === 'win32' && process.env.WDIO_PRESET === 'vue'
) {
    process.exit(0)
}

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
export const config = {
    /**
     * specify test files
     */
    specs: [
        path.resolve(__dirname, '*.test.tsx'),
        path.resolve(__dirname, '*.test.js')
    ],

    /**
     * capabilities
     */
    capabilities: [{
        browserName: 'chrome',
        browserVersion: 'canary',
        'goog:chromeOptions': {
            args: ['--headless=new']
        }
    }],

    /**
     * test configurations
     */
    logLevel: 'trace',
    framework: 'mocha',
    outputDir: path.join(__dirname, 'logs', process.env.WDIO_PRESET || 'misc'),
    reporters: ['spec', 'dot', 'junit'],
    runner: ['browser', {
        preset: process.env.WDIO_PRESET,
        rootDir: path.resolve(__dirname, '..'),
        viteConfig: ({ command, mode }) => {
            const env = loadEnv(mode, __dirname, '')
            return {
                // vite config
                define: {
                    WDIO_ENV_TEST: `${JSON.stringify(env.WDIO_ENV_TEST)}`,
                    TEST_COMMAND: `${JSON.stringify(command)}`
                },
            }
        },
        coverage: {
            enabled: true,
            /**
             * Todo(@christian-bromann): set treshold back to 100
             */
            functions: 80
        }
    }],

    mochaOpts: {
        ui: 'bdd',
        timeout: 150000,
        require: ['./__fixtures__/setup.js']
    },

    /**
     * in order to test custom matchers added by services, we push a service instance
     * to the service list
     */
    services: [[{
        before() {
            expect.extend({
                toBeFoo(received) {
                    return received === 'foo'
                        ? {
                            message: () => `expected ${received} not to be foo`,
                            pass: true
                        }
                        : {
                            message: () => `expected ${received} to be foo`,
                            pass: false
                        }
                }
            })
        }
    }, {}]],

    before: () => {
        /**
         * only run this test in lit
         */
        if (process.env.WDIO_PRESET !== 'lit') {
            return
        }

        browser.addCommand('someCustomCommand', () => 'Hello World')
    }
}
