import { describe, expect, it, vi } from 'vitest'
import { getPrototype } from '../src/utils.js'
import command from '../src/command.js'

vi.mock('../src/command.js', () => ({ default: vi.fn(() => () => {}) }))
vi.mock('@testplane/wdio-protocols', async (original) => ({
    ...await original<object>(),
    JsonWProtocol: {
        '/session/:sessionId/example': {
            POST: { command: 'example', parameters: [{ name: 'old' }], nested: { old: true } }
        }
    },
    WebDriverProtocol: {
        '/session/:sessionId/example': {
            POST: { command: 'example', parameters: [{ name: 'new' }], nested: { current: true } }
        }
    }
}))

describe('protocol merge compatibility', () => {
    it('replaces parameter arrays and retains nested metadata in mobile protocol overrides', () => {
        const prototype = getPrototype({ isMobile: true, isW3C: true })

        expect(prototype.example.value).toBeTypeOf('function')
        expect(command).toHaveBeenCalledWith('POST', '/session/:sessionId/example', {
            command: 'example',
            parameters: [{ name: 'new' }],
            nested: { old: true, current: true }
        }, undefined)
    })
})
