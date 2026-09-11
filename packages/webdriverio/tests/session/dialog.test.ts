import { EventEmitter } from 'node:events'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DialogManager } from '../../src/session/dialog.js'
import webdriverMonad from '../../../wdio-utils/src/monad.js'
import { logMock } from '../../../../__mocks__/@testplane/wdio-logger.js'

vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

function createBrowser (implementation: string) {
    const browser = implementation === 'WebDriver monad' ? webdriverMonad({})('dialog-session') : new EventEmitter()
    return Object.assign(browser, {
        isBidi: true,
        sessionId: 'dialog-session',
        sessionSubscribe: vi.fn().mockResolvedValue({}),
        browsingContextHandleUserPrompt: vi.fn().mockResolvedValue({})
    }) as unknown as WebdriverIO.Browser
}

const prompt = { context: 'tab', type: 'alert', message: 'hello' }

describe.each(['EventEmitter', 'WebDriver monad'])('DialogManager with %s', (implementation) => {
    beforeEach(() => {
        vi.stubEnv('WDIO_UNIT_TESTS', '')
        vi.clearAllMocks()
    })
    afterEach(() => vi.unstubAllEnvs())

    it('uses actual listeners, including once and multiple listeners', async () => {
        const browser = createBrowser(implementation)
        const manager = new DialogManager(browser)
        await manager.initialize()
        const first = vi.fn()
        const second = vi.fn()
        browser.on('dialog', first)
        browser.once('dialog', second)
        browser.emit('browsingContext.userPromptOpened', prompt)
        expect(first).toHaveBeenCalledOnce()
        expect(second).toHaveBeenCalledOnce()
        expect(browser.browsingContextHandleUserPrompt).not.toHaveBeenCalled()
        browser.emit('browsingContext.userPromptOpened', prompt)
        expect(first).toHaveBeenCalledTimes(2)
        expect(second).toHaveBeenCalledOnce()
        browser.off('dialog', first)
        browser.emit('browsingContext.userPromptOpened', prompt)
        expect(browser.browsingContextHandleUserPrompt).toHaveBeenCalledWith({ context: 'tab', accept: false })
        manager.removeListeners()
    })

    it('handles auto-dismiss rejection without an unhandled promise and reports unexpected errors', async () => {
        const browser = createBrowser(implementation)
        const manager = new DialogManager(browser)
        await manager.initialize()
        vi.mocked(browser.browsingContextHandleUserPrompt).mockRejectedValue(new Error('connection lost'))
        browser.emit('browsingContext.userPromptOpened', prompt)
        await vi.waitFor(() => expect(logMock.warn).toHaveBeenCalledWith(expect.stringContaining('connection lost')))
        manager.removeListeners()
    })
})
