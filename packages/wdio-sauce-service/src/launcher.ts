import { performance, PerformanceObserver } from 'node:perf_hooks'

import {
    default as SauceLabs,
    type SauceLabsOptions,
    type SauceConnectOptions,
    type SauceConnectInstance
} from 'saucelabs'
import logger from '@testplane/wdio-logger'
import type { Services, Capabilities, Options } from '@testplane/wdio-types'

import { makeCapabilityFactory } from './utils.js'
import type { SauceServiceConfig } from './types.js'
import { DEFAULT_RUNNER_NAME } from './constants.js'
import path from 'node:path'

const MAX_SC_START_TRIALS = 3

const log = logger('@wdio/sauce-service')
export default class SauceLauncher implements Services.ServiceInstance {
    private _api: SauceLabs.default
    private _sauceConnectProcess?: SauceConnectInstance

    constructor (
        private _options: SauceServiceConfig,
        _: never,
        private _config: Options.Testrunner
    ) {
        this._api = new SauceLabs.default(this._config as SauceLabsOptions)
    }

    /**
     * modify config and launch sauce connect
     */
    async onPrepare (
        _: Options.Testrunner,
        capabilities: Capabilities.TestrunnerCapabilities
    ) {
        if (!this._options.sauceConnect) {
            return
        }

        const sauceConnectTunnelName = (
            this._options.sauceConnectOpts?.tunnelName ||
            /**
             * generate random identifier if not provided
             */
            `SC-tunnel-${Math.random().toString().slice(2)}`)

        let metadata = this._options.sauceConnectOpts?.metadata || ''
        if (!metadata.includes('runner=')) {
            metadata += `runner=${DEFAULT_RUNNER_NAME}`
        }

        const sauceConnectOpts: SauceConnectOptions = {
            tunnelName: sauceConnectTunnelName,
            ...this._options.sauceConnectOpts,
            metadata: metadata,
            logger: this._options.sauceConnectOpts?.logger || ((output) => log.debug(`Sauce Connect Log: ${output}`)),
            ...(!this._options.sauceConnectOpts?.logFile && this._config.outputDir
                ? { logFile: path.join(this._config.outputDir, 'wdio-sauce-connect-tunnel.log') }
                : {}
            )
        }
        const prepareCapability = makeCapabilityFactory(sauceConnectTunnelName)
        if (Array.isArray(capabilities)) {
            for (const capability of capabilities) {
                /**
                 * Parallel Multiremote
                 */
                if (Object.values(capability).length > 0 && Object.values(capability).every(c => typeof c === 'object' && c.capabilities)) {
                    for (const browserName of Object.keys(capability)) {
                        const caps = (capability as Capabilities.RequestedMultiremoteCapabilities)[browserName].capabilities
                        prepareCapability((caps as Capabilities.W3CCapabilities).alwaysMatch || caps)
                    }
                } else {
                    prepareCapability(capability as WebdriverIO.Capabilities)
                }
            }
        } else {
            for (const browserName of Object.keys(capabilities)) {
                const caps = capabilities[browserName].capabilities
                prepareCapability((caps as Capabilities.W3CCapabilities).alwaysMatch || caps)
            }
        }

        /**
         * measure SC boot time
         */
        const obs = new PerformanceObserver((list) => {
            const entry = list.getEntries()[0]
            log.info(`Sauce Connect successfully started after ${entry.duration}ms`)
        })
        obs.observe({ entryTypes: ['measure'] })

        log.info('Starting Sauce Connect Tunnel')
        performance.mark('sauceConnectStart')
        this._sauceConnectProcess = await this.startTunnel(sauceConnectOpts)
        performance.mark('sauceConnectEnd')
        const bootimeMeasure = performance.measure('bootTime', 'sauceConnectStart', 'sauceConnectEnd')
        log.info(`Started Sauce Connect Tunnel within ${bootimeMeasure.duration}ms`)
    }

    async startTunnel (sauceConnectOpts: SauceConnectOptions, retryCount = 0): Promise<SauceConnectInstance> {
        try {
            const scProcess = await this._api.startSauceConnect(sauceConnectOpts)
            return scProcess
        } catch (err) {
            ++retryCount
            /**
             * fail starting Sauce Connect eventually
             */
            if (
                err instanceof Error &&
                /**
                 * only fail for ENOENT errors due to racing condition
                 * see: https://github.com/saucelabs/node-saucelabs/issues/86
                 */
                !err.message.includes('ENOENT') ||
                /**
                 * or if we reached the maximum rety count
                 */
                retryCount >= MAX_SC_START_TRIALS
            ) {
                throw err
            }
            log.debug(`Failed to start Sauce Connect Proxy due to ${(err as Error).stack}`)
            log.debug(`Retrying ${retryCount}/${MAX_SC_START_TRIALS}`)
            return this.startTunnel(sauceConnectOpts, retryCount)
        }
    }

    /**
     * shut down sauce connect
     */
    onComplete () {
        if (!this._sauceConnectProcess) {
            return
        }

        return this._sauceConnectProcess.close()
    }
}
