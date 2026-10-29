import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SessionManager } from '../../src/session/session.js'
import { ContextManager } from '../../src/session/context.js'
import { DialogManager } from '../../src/session/dialog.js'
import { NetworkManager } from '../../src/session/networkManager.js'
import { PolyfillManager } from '../../src/session/polyfill.js'
import { ShadowRootManager } from '../../src/session/shadowRoot.js'

function createBrowser() {
    return Object.assign(new EventEmitter(), {
        sessionId: 'lifecycle-session',
        isBidi: true,
        capabilities: {},
        sessionSubscribe: vi.fn().mockResolvedValue({}),
        browsingContextGetTree: vi.fn().mockResolvedValue({ contexts: [] }),
        scriptAddPreloadScript: vi.fn().mockResolvedValue({ script: 'script-id' }),
        scriptCallFunction: vi.fn().mockResolvedValue({ result: { type: 'undefined' } })
    }) as unknown as WebdriverIO.Browser
}

describe('session manager listener lifecycle', () => {
    afterEach(() => vi.unstubAllEnvs())

    it.each([ContextManager, DialogManager, NetworkManager, PolyfillManager, ShadowRootManager].map((Manager) => ({ name: Manager.name, Manager })))(
        '$name removes only its own listeners across repeated sessions', async ({ Manager }) => {
            vi.stubEnv('WDIO_UNIT_TESTS', '')
            const browser = createBrowser()
            const userListener = vi.fn()
            browser.on('command', userListener)
            // @ts-expect-error private event may also have listeners owned by other integrations
            browser.on('_dialogListenerRegistered', userListener)
            for (let i = 0; i < 3; i++) {
                const manager = SessionManager.getSessionManager(browser, Manager)
                await Promise.resolve()
                browser.emit('command', { command: 'deleteSession' })
                expect(browser.listeners('command')).toEqual([userListener])
                expect(browser.listeners('_dialogListenerRegistered')).toEqual([userListener])
                expect(browser.eventNames().sort()).toEqual(['_dialogListenerRegistered', 'command'])
                expect(SessionManager.getSessionManager(browser, Manager)).not.toBe(manager)
                browser.emit('command', { command: 'deleteSession' })
                browser.sessionId = `reloaded-session-${i}`
            }
        }
    )

    it('cleans up managers for separate browser objects sharing a session id', () => {
        class Manager extends SessionManager {
            constructor(browser: WebdriverIO.Browser) {
                super(browser, Manager.name)
            }
        }
        const firstBrowser = createBrowser()
        const secondBrowser = createBrowser()
        const first = SessionManager.getSessionManager(firstBrowser, Manager)
        const second = SessionManager.getSessionManager(secondBrowser, Manager)
        firstBrowser.emit('command', { command: 'deleteSession' })
        secondBrowser.emit('command', { command: 'deleteSession' })
        expect(SessionManager.getSessionManager(firstBrowser, Manager)).not.toBe(first)
        expect(SessionManager.getSessionManager(secondBrowser, Manager)).not.toBe(second)
        firstBrowser.emit('command', { command: 'deleteSession' })
        secondBrowser.emit('command', { command: 'deleteSession' })
    })
})
