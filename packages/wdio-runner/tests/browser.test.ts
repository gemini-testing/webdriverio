import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from '@wdio/globals'
import { MESSAGE_TYPES } from '@testplane/wdio-types'

import BrowserFramework from '../src/browser.js'

vi.mock('@wdio/globals', () => ({
    browser: { url: vi.fn(), setCookies: vi.fn(), execute: vi.fn() }
}))
vi.mock('../src/utils.js', () => ({ transformExpectArgs: vi.fn() }))
vi.mock('expect-webdriverio', () => ({ matchers: new Map() }))

describe('BrowserFramework error polling', () => {
    let listeners: ReturnType<typeof process.listeners>
    const originalSend = process.send

    beforeEach(() => {
        vi.useFakeTimers()
        vi.mocked(browser.execute).mockReset()
        listeners = process.listeners('message')
        process.send = vi.fn()
    })

    afterEach(() => {
        for (const listener of process.listeners('message')) {
            if (!listeners.includes(listener)) {
                process.removeListener('message', listener)
            }
        }
        process.send = originalSend
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('continues polling after navigation clears an execution context', async () => {
        vi.mocked(browser.execute)
            .mockRejectedValueOnce(new Error('execution contexts cleared'))
            .mockResolvedValue({ errors: [] })
        const framework = new BrowserFramework('0-0', {}, ['file:///spec.ts'], { emit: vi.fn() } as any)
        const result = framework.run()
        await vi.advanceTimersByTimeAsync(1000)
        const onMessage = process.listeners('message').find((listener) => !listeners.includes(listener))!
        onMessage({
            command: 'workerRequest',
            args: { message: { type: MESSAGE_TYPES.browserTestResult, value: { failures: 0, events: [] } } }
        }, undefined)
        expect(await result).toBe(0)
        expect(browser.execute).toHaveBeenCalledTimes(2)
    })

    it('does not apply an unfinished poll failure to the next spec', async () => {
        let rejectPoll: (error: Error) => void
        vi.mocked(browser.execute).mockReturnValue(new Promise((_, reject) => { rejectPoll = reject }))
        const framework = new BrowserFramework('0-0', {}, ['file:///first.ts', 'file:///second.ts'], { emit: vi.fn() } as any)
        const result = framework.run()
        await vi.advanceTimersByTimeAsync(500)
        const onMessage = process.listeners('message').find((listener) => !listeners.includes(listener))!
        const finishMessage = {
            command: 'workerRequest',
            args: { message: { type: MESSAGE_TYPES.browserTestResult, value: { failures: 0, events: [] } } }
        }
        onMessage(finishMessage, undefined)
        await vi.advanceTimersByTimeAsync(0)
        rejectPoll!(new Error('session disconnected'))
        await vi.advanceTimersByTimeAsync(0)
        onMessage(finishMessage, undefined)
        expect(await result).toBe(0)
        expect(process.send).not.toHaveBeenCalled()
    })

    it('reports a polling command failure without an unhandled rejection', async () => {
        vi.mocked(browser.execute).mockRejectedValue(new Error('session disconnected'))
        const framework = new BrowserFramework('0-0', { mochaOpts: { timeout: 1000 } }, ['file:///spec.ts'], { emit: vi.fn() } as any)
        const result = framework.run()
        await vi.advanceTimersByTimeAsync(1000)
        expect(await result).toBe(1)
        expect(process.send).toHaveBeenCalledWith(expect.objectContaining({
            name: 'error',
            content: expect.objectContaining({ message: expect.stringContaining('session disconnected') })
        }))
    })
})
