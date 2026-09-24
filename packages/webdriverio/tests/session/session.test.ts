import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { logMock } from '@testplane/wdio-logger'

import { SessionManager } from '../../src/session/session.js'
import { ContextManager } from '../../src/session/context.js'
import { wrapCommandWithSessionManagerErrors } from '../../src/session/errorHandler.js'

vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('SessionManager', () => {
    const browser ={
        sessionId: '123',
        on: vi.fn(),
    } as unknown as WebdriverIO.Browser

    beforeEach(()=>{
        vi.mocked(browser.on).mockClear()
        logMock.warn.mockClear()
    })

    it('should listener registered', ()=>{
        new SessionManager(browser, 'dummy')
        expect(browser.on).toHaveBeenCalledTimes(1)
    })

    it('should listener registered only once when initialized multiple times', ()=>{
        browser.sessionId = '456'
        new SessionManager(browser, 'dummy')
        new SessionManager(browser, 'dummy')
        expect(browser.on).toHaveBeenCalledTimes(1)
    })

    it('should allow to remove event listeners', () => {
        const browser = {
            on: vi.fn(),
            off: vi.fn(),
            sessionId: '1234'
        } as any as WebdriverIO.Browser
        const sm = new SessionManager(browser, 'scope')
        const listener = vi.mocked(browser.on).mock.calls[0][1]
        sm.removeListeners()
        expect(browser.off).toBeCalledWith('command', listener)
    })

    it('should remove ContextManager listeners using the same references as they were registered', () => {
        const browser = {
            sessionId: '1234',
            capabilities: {},
            isBidi: false,
            isMobile: true,
            isAndroid: false,
            on: vi.fn(),
            off: vi.fn(),
            sessionSubscribe: vi.fn(),
            browsingContextGetTree: vi.fn(),
            switchToWindow: vi.fn(),
        } as any as WebdriverIO.Browser

        const cm = createEnabledContextManager(browser)

        const onCalls = vi.mocked(browser.on).mock.calls
        const commandListeners = onCalls.filter(([event]) => event === 'command').map(([, listener]) => listener)
        const resultListeners = onCalls.filter(([event]) => event === 'result').map(([, listener]) => listener)
        const baseCommandListener = commandListeners[0]
        const contextCommandListener = commandListeners[1]

        expect(baseCommandListener).toBeTypeOf('function')
        expect(contextCommandListener).toBeTypeOf('function')
        expect(resultListeners).toHaveLength(1)
        expect(resultListeners[0]).toBeTypeOf('function')

        cm.removeListeners()

        expect(browser.off).toHaveBeenCalledWith('command', baseCommandListener)
        expect(browser.off).toHaveBeenCalledWith('command', contextCommandListener)
        expect(browser.off).toHaveBeenCalledWith('result', resultListeners[0])
    })

    it('should update the current context after navigation without returning a promise to EventEmitter', async () => {
        const browser = createBidiBrowser({
            contexts: [{ context: 'new-context' }]
        })
        const cm = createEnabledContextManager(browser)
        cm.setCurrentContext('old-context')

        const listener = getNavigationStartedListener(browser)
        expect(listener({ context: 'new-context' })).toBeUndefined()

        await vi.waitFor(() => expect(browser.switchToWindow).toHaveBeenCalledWith('new-context'))
        expect(logMock.warn).not.toHaveBeenCalled()
    })

    it('should propagate an empty context tree result to the active command', async () => {
        const browser = createBidiBrowser(undefined)
        const cm = createEnabledContextManager(browser)
        cm.setCurrentContext('old-context')

        const listener = getNavigationStartedListener(browser)
        expect(listener({ context: 'new-context' })).toBeUndefined()

        await expect(runCommand(browser)).rejects.toThrow('browsingContextGetTree returned no result')
        expect(browser.switchToWindow).not.toHaveBeenCalled()
    })

    it('should propagate navigation errors to the active command', async () => {
        const browser = createBidiBrowser(new Error('get tree failed'))
        const cm = createEnabledContextManager(browser)
        cm.setCurrentContext('old-context')

        const listener = getNavigationStartedListener(browser)
        expect(listener({ context: 'new-context' })).toBeUndefined()

        await expect(runCommand(browser)).rejects.toThrow('get tree failed')
        expect(browser.switchToWindow).not.toHaveBeenCalled()
    })
})

let bidiSessionCounter = 0

function createBidiBrowser(contextTree: unknown): WebdriverIO.Browser {
    return {
        sessionId: `bidi-${++bidiSessionCounter}`,
        capabilities: {},
        isBidi: true,
        isMobile: false,
        isAndroid: false,
        on: vi.fn(),
        off: vi.fn(),
        sessionSubscribe: vi.fn(),
        browsingContextGetTree: vi.fn().mockImplementation(() => contextTree instanceof Error
            ? Promise.reject(contextTree)
            : Promise.resolve(contextTree)),
        switchToWindow: vi.fn(),
    } as any as WebdriverIO.Browser
}

function getNavigationStartedListener(browser: WebdriverIO.Browser) {
    const listener = vi.mocked(browser.on).mock.calls.find(
        ([event]) => event === 'browsingContext.navigationStarted'
    )?.[1]

    expect(
        vi.mocked(browser.on).mock.calls.map(([event]) => event)
    ).toContain('browsingContext.navigationStarted')
    expect(listener).toBeTypeOf('function')
    return listener as (event: { context: string }) => unknown
}

function createEnabledContextManager(browser: WebdriverIO.Browser) {
    const unitTestFlag = process.env.WDIO_UNIT_TESTS
    delete process.env.WDIO_UNIT_TESTS

    try {
        return new ContextManager(browser)
    } finally {
        if (unitTestFlag === undefined) {
            delete process.env.WDIO_UNIT_TESTS
        } else {
            process.env.WDIO_UNIT_TESTS = unitTestFlag
        }
    }
}

function runCommand(browser: WebdriverIO.Browser) {
    const command = wrapCommandWithSessionManagerErrors(
        (_commandName: string, command: Function) => command
    )('test', () => new Promise((resolve) => setTimeout(resolve, 0)))

    return command.call(browser)
}
