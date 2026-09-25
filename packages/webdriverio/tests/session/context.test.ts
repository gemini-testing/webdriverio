import path from 'node:path'
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

import logger from '@testplane/wdio-logger'

import { ContextManager } from '../../src/session/context.js'

vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

const log = logger('webdriverio:context')

describe('ContextManager command results', () => {
    afterEach(() => vi.unstubAllEnvs())

    function setup() {
        vi.stubEnv('WDIO_UNIT_TESTS', '')
        const browser = Object.assign(new EventEmitter(), {
            sessionId: 'context-session',
            isBidi: true,
            capabilities: {},
            sessionSubscribe: vi.fn().mockResolvedValue({}),
            switchToWindow: vi.fn().mockResolvedValue(null),
            browsingContextGetTree: vi.fn().mockResolvedValue({ contexts: [{ context: 'other-window', children: [] }] })
        }) as unknown as WebdriverIO.Browser
        const manager = new ContextManager(browser)
        manager.setCurrentContext('original-window')
        return { browser, manager }
    }

    it('does not switch context before switchToWindow succeeds', async () => {
        const { browser, manager } = setup()
        browser.emit('command', { command: 'switchToWindow', body: { handle: 'missing-window' } })
        expect(await manager.getCurrentContext()).toBe('original-window')
        browser.emit('result', {
            command: 'switchToWindow', body: { handle: 'missing-window' },
            result: { error: new Error('no such window') }
        })
        expect(await manager.getCurrentContext()).toBe('original-window')
        manager.removeListeners()
    })

    it('updates context from the successful switchToWindow result', async () => {
        const { browser, manager } = setup()
        browser.emit('result', {
            command: 'switchToWindow', body: { handle: 'other-window' }, result: { value: null }
        })
        expect(await manager.getCurrentContext()).toBe('other-window')
        manager.removeListeners()
    })

    it('does not automatically switch windows after closeWindow', async () => {
        const { browser, manager } = setup()
        browser.emit('result', { command: 'closeWindow', result: { value: ['other-window'] } })
        expect(await manager.getCurrentContext()).toBe('original-window')
        expect(browser.switchToWindow).not.toHaveBeenCalled()
        manager.removeListeners()
    })

    it('reports navigation failures without poisoning the current context', async () => {
        const { browser, manager } = setup()
        const error = new Error('no such window')
        vi.mocked(browser.switchToWindow).mockRejectedValueOnce(error)
        browser.emit('browsingContext.navigationStarted', { context: 'other-window' })
        await vi.waitFor(() => expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('navigation'), error))
        expect(await manager.getCurrentContext()).toBe('original-window')
        manager.removeListeners()
    })

    it('reports context tree failures from navigation events', async () => {
        const { browser, manager } = setup()
        const error = new Error('session deleted')
        vi.mocked(browser.browsingContextGetTree).mockRejectedValueOnce(error)
        browser.emit('browsingContext.navigationStarted', { context: 'other-window' })
        await vi.waitFor(() => expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('navigation'), error))
        expect(await manager.getCurrentContext()).toBe('original-window')
        manager.removeListeners()
    })

})
