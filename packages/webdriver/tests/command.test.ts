import path from 'node:path'
import { EventEmitter, on } from 'node:events'

import { describe, it, expect, vi, beforeEach } from 'vitest'
import logger from '@testplane/wdio-logger'
import type { CommandEndpoint } from '@testplane/wdio-protocols'
import type { Options } from '@testplane/wdio-types'

import '../src/browser.js'
// @ts-expect-error mock feature
import { WebDriverRequest as RequestMock, thenMock, catchMock } from '../src/request/request.js'
import commandWrapper from '../src/command.js'
import type { BaseClient } from '../src/types.js'

vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))
vi.mock('fetch')

const log = logger('webdriver')
const commandPath = '/session/:sessionId/element/:elementId/element'
const commandMethod = 'POST'
const commandEndpoint: CommandEndpoint = {
    command: 'findElementFromElement',
    ref: 'https://w3c.github.io/webdriver/webdriver-spec.html#dfn-find-element-from-element',
    description: '',
    variables: [{
        name: 'elementId',
        description: 'the id of an element returned in a previous call to Find Element(s)'
    }],
    parameters: [{
        name: 'using',
        type: 'string',
        description: 'a valid element location strategy',
        required: true
    }, {
        name: 'value',
        type: 'string',
        description: 'the actual selector that will be used to find an element',
        required: true
    }, {
        name: 'customParam',
        type: 'number',
        description: 'a random not required param',
        required: false
    }, {
        name: 'customArrayParam',
        type: '(string|object|number|boolean|undefined)[]',
        description: 'a random not required param',
        required: false
    }]
}

const requestHandler = {
    onPerformance: expect.any(Function),
    onRequest: expect.any(Function),
    onResponse: expect.any(Function),
    onRetry: expect.any(Function)
}

vi.mock('../src/request/request', () => {
    const thenMock = vi.fn()
    const finallyMock = vi.fn()
    const catchMock = vi.fn().mockReturnValue({ finally: finallyMock })

    const promise = { then: thenMock, catch: catchMock, finally: finallyMock }
    const WebDriverRequest = vi.fn().mockReturnValue({
        makeRequest: () => (promise),
        on: vi.fn()
    })

    thenMock.mockReturnValue(promise)
    return {
        thenMock,
        catchMock,
        finallyMock,
        WebDriverRequest,
    }
})

class FakeClient extends EventEmitter {
    isW3C = false
    isChromium = false
    isAndroid = false
    isMobile = false
    isIOS = false
    isSauce = false
    isFirefox = false
    isDevTools = false
    isBidi = false
    isSeleniumStandalone = false
    isNativeContext = false
    mobileContext = ''
    sessionId = '123'
    capabilities = {}
    requestedCapabilities = {}
    options = {
        logLevel: 'warn' as Options.WebDriverLogTypes
    } as any
    emit = vi.fn()
    on = vi.fn()
}

const scope: BaseClient = new FakeClient()
type mockResponse = (...args: any[]) => any

describe('command wrapper', () => {
    beforeEach(() => {
        vi.mocked(log.warn).mockClear()
        vi.mocked(scope.emit).mockClear()
        vi.mocked(scope.on).mockClear()
        vi.mocked(thenMock).mockClear()
        vi.mocked(catchMock).mockClear()
    })

    it('should fail if wrong arguments are passed in', async () => {
        const commandFn = commandWrapper(commandMethod, commandPath, commandEndpoint).bind({} as unknown)
        await expect(commandFn)
            .rejects
            .toThrow(/Wrong parameters applied for findElementFromElement/)
    })

    it('should fail if arguments are malformed', async () => {
        const commandFn = commandWrapper(commandMethod, commandPath, commandEndpoint)
        await expect(() => commandFn.call(scope, '123', 123, '123'))
            .rejects
            .toThrow(/Malformed type for "using" parameter of command/)
    })

    it('should fail if not required param has wrong type', async () => {
        const commandFn = commandWrapper(commandMethod, commandPath, commandEndpoint)
        await expect(() => commandFn.call(scope, '123', '123', '123', 'foobar'))
            .rejects
            .toThrow(/Malformed type for "customParam" parameter of command/)
    })

    it('should throw if param type within array is not met', async () => {
        expect.assertions(1)
        const commandFn = commandWrapper(commandMethod, commandPath, commandEndpoint)

        await expect(commandFn.call(scope, '123', '123', '123', 234, () => {}))
            .rejects
            .toThrow(/Actual: \(function\)\[\]/)
    })

    it('should do a proper request', async () => {
        const commandFn = commandWrapper(commandMethod, commandPath, commandEndpoint)
        await commandFn.call(scope, '123', 'css selector', '#body', undefined) as unknown as mockResponse
        const thenCallback = thenMock.mock.calls[0][0]
        expect(thenCallback({ value: 14 })).toBe(14)
        vi.mocked(thenMock).mockClear()

        expect(RequestMock).toHaveBeenCalledWith(
            'POST',
            '/session/:sessionId/element/123/element',
            {
                using: 'css selector',
                value: '#body'
            },
            expect.any(AbortSignal),
            false,
            requestHandler
        )
    })

    it('should do a proper request with non required params', async () => {
        const commandFn = commandWrapper(commandMethod, commandPath, commandEndpoint)
        await commandFn.call(scope, '123', 'css selector', '#body', 123) as unknown as mockResponse
        expect(RequestMock).toHaveBeenCalledWith(
            'POST',
            '/session/:sessionId/element/123/element',
            {
                using: 'css selector',
                value: '#body',
                customParam: 123
            },
            expect.any(AbortSignal),
            false,
            requestHandler
        )
    })

    it('should encode uri parameters', async () => {
        const commandFn = commandWrapper(commandMethod, commandPath, commandEndpoint)
        await commandFn.call(scope, '/path', 'css selector', '#body', 123)

        expect(RequestMock).toHaveBeenCalledWith(
            'POST',
            '/session/:sessionId/element/%2Fpath/element',
            expect.anything(),
            expect.any(AbortSignal),
            false,
            requestHandler
        )
    })

    it('should double encode uri parameters if using selenium', async () => {
        const commandFn = commandWrapper(commandMethod, commandPath, commandEndpoint, true)
        await commandFn.call(scope, '/path', 'css selector', '#body', 123)

        expect(RequestMock).toHaveBeenCalledWith(
            'POST',
            '/session/:sessionId/element/%252Fpath/element',
            expect.anything(),
            expect.any(AbortSignal),
            false,
            requestHandler
        )
        expect(log.warn).toHaveBeenCalledTimes(0)
    })

    it('should register abort listener', async () => {
        scope.sessionId = '456' // Emulate new session
        const commandFn = commandWrapper(commandMethod, commandPath, commandEndpoint, true)
        await commandFn.call(scope, '/path', 'css selector', '#body', 123)

        expect(scope.on).toHaveBeenCalledTimes(1)
        expect(scope.on).toHaveBeenLastCalledWith('result', expect.any(Function))
    })

    it('should register abort listener once when request was called multiple times', async () => {
        scope.sessionId = '789' // Emulate new session
        const commandFn = commandWrapper(commandMethod, commandPath, commandEndpoint, true)
        await commandFn.call(scope, '/path', 'css selector', '#body', 123)
        await commandFn.call(scope, '/path', 'css selector', '#body', 123)

        expect(scope.on).toHaveBeenCalledTimes(1)
    })

    it('should log deprecation notice', async () => {
        const deprecatedCommandEndpoint = {
            deprecated: 'This command will soon be deprecated.',
            ...commandEndpoint
        }
        const commandFn = commandWrapper(commandMethod, commandPath, deprecatedCommandEndpoint)
        await commandFn.call(scope, '123', 'css selector', '#body', undefined) as unknown as mockResponse
        expect(log.warn).toBeCalledWith('The "findElementFromElement" command will soon be deprecated.')
    })

    it('should emit result when request throws', async () => {
        const commandFn = commandWrapper(commandMethod, commandPath, commandEndpoint)
        await commandFn.call(scope, '/path', 'css selector', '#body')

        const errorCallback = catchMock.mock.calls[0][0]

        const error = new Error('Request failed')
        expect(() => errorCallback(error)).toThrow(error)
        expect(scope.emit).toBeCalledWith('result', {
            command: 'findElementFromElement',
            method: 'POST',
            endpoint: '/session/:sessionId/element/%2Fpath/element',
            body: { using: 'css selector', value: '#body' },
            result: { error }
        })
    })
})

describe('command wrapper result log', () => {
    async function getRequestCallback (method: string, path: string, endpoint: CommandEndpoint) {
        const commandFn = commandWrapper(method, path, endpoint)
        await commandFn.call(scope)
        expect(RequestMock).toHaveBeenCalledTimes(1)
        expect(RequestMock).toHaveBeenCalledWith(method, path, expect.any(Object), expect.any(AbortSignal), false, requestHandler)

        const callback = thenMock.mock.calls[0][0]

        vi.mocked(thenMock).mockClear()
        vi.mocked(log.info).mockClear()

        return callback
    }

    const takeScreenshotCmd = {
        path: '/foobar',
        method: 'GET',
        endpoint: {
            command: 'takeScreenshot',
            ref: 'https://foobar.com',
            parameters: [],
            description: ''
        }
    }

    const deleteSessionCmd = {
        path: '/foobar',
        method: 'POST',
        endpoint: {
            command: 'deleteSession',
            ref: 'https://foobar.com',
            parameters: [],
            description: ''
        }
    }

    const scenarios = [{
        title: 'truncate long string value',
        command: { ...takeScreenshotCmd },
        value: 'f'.repeat(65),
        log: 'f'.repeat(61) + '...'
    }, {
        title: 'truncate long string value',
        command: {
            ...takeScreenshotCmd,
            endpoint: {
                ...takeScreenshotCmd.endpoint,
                command: 'takeElementScreenshot'
            }
        },
        value: 'f'.repeat(123),
        log: 'f'.repeat(61) + '...'
    }, {
        title: 'truncate long string value',
        command: {
            ...takeScreenshotCmd,
            endpoint: {
                ...takeScreenshotCmd.endpoint,
                command: 'startRecordingScreen'
            }
        },
        value: 'f'.repeat(123),
        log: 'f'.repeat(61) + '...'
    }, {
        title: 'truncate long string value',
        command: {
            ...takeScreenshotCmd,
            endpoint: {
                ...takeScreenshotCmd.endpoint,
                command: 'stopRecordingScreen'
            }
        },
        value: 'f'.repeat(123),
        log: 'f'.repeat(61) + '...'
    }, {
        title: 'do nothing to values with length less then 65',
        command: { ...takeScreenshotCmd },
        value: 'f'.repeat(64),
        get log () { return this.value }
    }, {
        title: 'not truncate long string value',
        command: {
            ...takeScreenshotCmd,
            endpoint: {
                ...takeScreenshotCmd.endpoint,
                command: 'any-other-command'
            }
        },
        value: 'f'.repeat(66),
        get log () { return this.value }
    }, {
        title: 'do nothing to non string value: array',
        command: { ...takeScreenshotCmd },
        value: [],
        get log () { return this.value }
    }, {
        title: 'do nothing to non string value: object',
        command: { ...takeScreenshotCmd },
        value: {},
        get log () { return this.value }
    }, {
        title: 'do nothing to non string value: number',
        command: { ...takeScreenshotCmd },
        value: 3,
        get log () { return this.value }
    }, {
        title: 'do nothing to non string value: boolean',
        command: { ...takeScreenshotCmd },
        value: false,
        get log () { return this.value }
    }]

    logger.clearLogger = vi.fn()
    const clearLoggerSpy = vi.spyOn(logger, 'clearLogger')

    beforeEach(() => {
        delete process.env.WDIO_WORKER_ID
        vi.clearAllMocks()
    })

    for (const scenario of scenarios) {
        it(`should ${scenario.title} for ${scenario.command.endpoint.command}`, async () => {
            const resultFunction = await getRequestCallback(
                scenario.command.method,
                scenario.command.path,
                scenario.command.endpoint
            ) as unknown as mockResponse

            resultFunction({ value: scenario.value })
            expect(vi.mocked(log.info).mock.calls[0][1]).toBe(scenario.log)
            expect(clearLoggerSpy).not.toHaveBeenCalled()
        })
    }

    it('should be no result in log if there is value in response', async () => {
        process.env.WDIO_WORKER_ID = '0-0'
        const resultFunction = await getRequestCallback(
            deleteSessionCmd.method,
            takeScreenshotCmd.path,
            takeScreenshotCmd.endpoint
        ) as unknown as mockResponse
        resultFunction({})
        expect(vi.mocked(log.info).mock.calls).toHaveLength(0)
        expect(clearLoggerSpy).not.toHaveBeenCalled()
    })

    it('should call clearLogger on deleteSession cmd', async () => {
        const resultFunction = await getRequestCallback(
            deleteSessionCmd.method,
            deleteSessionCmd.path,
            deleteSessionCmd.endpoint
        ) as unknown as mockResponse
        resultFunction({})
        expect(vi.mocked(log.info).mock.calls).toHaveLength(0)
        expect(clearLoggerSpy).toHaveBeenCalledTimes(1)
    })
})
