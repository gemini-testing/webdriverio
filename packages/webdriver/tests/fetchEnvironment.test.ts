/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'

describe('fetch test environment', () => {
    it('uses compatible Request and AbortSignal constructors and propagates cancellation', () => {
        const controller = new AbortController()
        const request = new Request('http://localhost/session', { signal: controller.signal })
        const cloned = request.clone()

        expect(request.signal).toBeInstanceOf(AbortSignal)
        expect(cloned.signal.aborted).toBe(false)
        controller.abort()
        expect(request.signal.aborted).toBe(true)
        expect(cloned.signal.aborted).toBe(true)
    })
})
