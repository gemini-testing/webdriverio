import type { Capabilities } from '@testplane/wdio-types'
import type { BeforeCommandArgs, AfterCommandArgs } from '@wdio/reporter'

import {
    o11yClassErrorHandler,
    sleep
} from '../util.js'
import PercyCaptureMap from './PercyCaptureMap.js'

import * as PercySDK from './PercySDK.js'
import { PercyLogger } from './PercyLogger.js'

import { PERCY_DOM_CHANGING_COMMANDS_ENDPOINTS, CAPTURE_MODES } from '../constants.js'
import PerformanceTester from '../instrumentation/performance/performance-tester.js'
import * as PERFORMANCE_SDK_EVENTS from '../instrumentation/performance/constants.js'

class _PercyHandler {
    private _sessionName?: string
    private _isPercyCleanupProcessingUnderway?: boolean = false
    private _percyScreenshotCounter = 0
    private _percyDeferredScreenshots: ({ sessionName: string, eventName: string | null })[] = []
    private _percyScreenshotInterval: NodeJS.Timeout | null = null
    private _percyCaptureMap?: PercyCaptureMap

    constructor (
        private _percyAutoCaptureMode: string | undefined,
        private _browser: WebdriverIO.Browser | WebdriverIO.MultiRemoteBrowser,
        private _capabilities: Capabilities.ResolvedTestrunnerCapabilities,
        private _isAppAutomate?: boolean,
        private _framework?: string
    ) {
        if (!_percyAutoCaptureMode || !CAPTURE_MODES.includes(_percyAutoCaptureMode as string)) {
            this._percyAutoCaptureMode = 'auto'
        }
    }

    _setSessionName(name: string) {
        this._sessionName = name
    }

    async teardown () {
        await new Promise<void>((resolve) => {
            setInterval(() => {
                if (this._percyScreenshotCounter === 0) {
                    resolve()
                }
            }, 1000)
        })
    }

    async percyAutoCapture(eventName: string | null, sessionName: string | null) {
        PerformanceTester.start(PERFORMANCE_SDK_EVENTS.PERCY_EVENTS.AUTO_CAPTURE)
        try {
            if (eventName) {
                if (!sessionName) {
                    /* Service doesn't wait for handling of browser commands so the below counter is used in teardown method to delay service exit */
                    this._percyScreenshotCounter += 1
                }

                this._percyCaptureMap?.increment(sessionName ? sessionName : (this._sessionName as string), eventName)
                await (this._isAppAutomate ? PercySDK.screenshotApp(this._percyCaptureMap?.getName( sessionName ? sessionName : (this._sessionName as string), eventName)) : await PercySDK.screenshot(this._browser, this._percyCaptureMap?.getName( sessionName ? sessionName : (this._sessionName as string), eventName)))
                this._percyScreenshotCounter -= 1
            }
        } catch (err) {
            this._percyScreenshotCounter -= 1
            this._percyCaptureMap?.decrement(sessionName ? sessionName : (this._sessionName as string), eventName as string)
            PerformanceTester.end(PERFORMANCE_SDK_EVENTS.PERCY_EVENTS.AUTO_CAPTURE, false, err, { eventName, sessionName })
            PercyLogger.error(`Error while trying to auto capture Percy screenshot ${err}`)
        }

        PerformanceTester.end(PERFORMANCE_SDK_EVENTS.PERCY_EVENTS.AUTO_CAPTURE, true, null, { eventName, sessionName })
    }

    async before () {
        this._percyCaptureMap = new PercyCaptureMap()
    }

    deferCapture(sessionName: string, eventName: string | null) {
        /* Service doesn't wait for handling of browser commands so the below counter is used in teardown method to delay service exit */
        this._percyScreenshotCounter += 1
        this._percyDeferredScreenshots.push({ sessionName, eventName })
    }

    isDOMChangingCommand(args: BeforeCommandArgs): boolean {
        /*
          Percy screenshots which are to be taken on events such as send keys, element click & screenshot are deferred until
          another DOM changing command is seen such that any DOM processing post the previous command is completed
        */
        return (
            typeof args.method === 'string' && typeof args.endpoint === 'string' &&
            (
                (
                    args.method === 'POST' &&
                    (
                        PERCY_DOM_CHANGING_COMMANDS_ENDPOINTS.includes(args.endpoint) ||
                        (
                            /* click / clear element */
                            args.endpoint.includes('/session/:sessionId/element') &&
                            (
                                args.endpoint.includes('click') ||
                                args.endpoint.includes('clear')
                            )
                        ) ||
                        /* execute script sync / async */
                        Boolean(args.endpoint.includes('/session/:sessionId/execute') && (args.body as { script: string }).script) ||
                        /* Touch action for Appium */
                        (args.endpoint.includes('/session/:sessionId/touch'))
                    )
                ) ||
                ( args.method === 'DELETE' && args.endpoint === '/session/:sessionId' )
            )
        )
    }

    async cleanupDeferredScreenshots() {
        this._isPercyCleanupProcessingUnderway = true
        for (const entry of this._percyDeferredScreenshots) {
            await this.percyAutoCapture(entry.eventName, entry.sessionName)
        }
        this._percyDeferredScreenshots = []
        this._isPercyCleanupProcessingUnderway = false
    }

    async browserBeforeCommand (args: BeforeCommandArgs) {
        try {
            if (!this.isDOMChangingCommand(args)) {
                return
            }
            do {
                await sleep(1000)
            } while (this._percyScreenshotInterval)
            this._percyScreenshotInterval = setInterval(async () => {
                if (!this._isPercyCleanupProcessingUnderway) {
                    if (this._percyScreenshotInterval) {
                        clearInterval(this._percyScreenshotInterval)
                    }
                    await this.cleanupDeferredScreenshots()
                    this._percyScreenshotInterval = null
                }
            }, 1000)
        } catch (err) {
            PercyLogger.error(`Error while trying to cleanup deferred screenshots ${err}`)
        }
    }

    async browserAfterCommand (args: BeforeCommandArgs & AfterCommandArgs) {
        try {
            if (!args.endpoint || !this._percyAutoCaptureMode) {
                return
            }
            let eventName = null
            const endpoint = args.endpoint as string
            if (endpoint.includes('click') && ['click', 'auto'].includes(this._percyAutoCaptureMode as string)) {
                eventName = 'click'
            } else if (endpoint.includes('screenshot') && ['screenshot', 'auto'].includes(this._percyAutoCaptureMode as string)) {
                eventName = 'screenshot'
            } else if (endpoint.includes('actions') && ['auto'].includes(this._percyAutoCaptureMode as string)) {
                const actionsBody = (args.body as { actions: { type: string }[] }).actions
                if (actionsBody && Array.isArray(actionsBody) && actionsBody.length && actionsBody[0].type === 'key') {
                    eventName = 'keys'
                }
            } else if (endpoint.includes('/session/:sessionId/element') && endpoint.includes('value') && ['auto'].includes(this._percyAutoCaptureMode as string)) {
                eventName = 'keys'
            }
            if (eventName) {
                this.deferCapture(this._sessionName as string, eventName)
            }
        } catch (err) {
            PercyLogger.error(`Error while trying to calculate auto capture parameters ${err}`)
        }
    }

    async afterTest () {
        if (this._percyAutoCaptureMode && this._percyAutoCaptureMode === 'testcase') {
            await this.percyAutoCapture('testcase', null)
        }
    }

    async afterScenario () {
        if (this._percyAutoCaptureMode && this._percyAutoCaptureMode === 'testcase') {
            await this.percyAutoCapture('testcase', null)
        }
    }
}

// https://github.com/microsoft/TypeScript/issues/6543
const PercyHandler: typeof _PercyHandler = o11yClassErrorHandler(_PercyHandler)
type PercyHandler = _PercyHandler

export default PercyHandler
