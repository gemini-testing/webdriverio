import { describe, expect, it, vi } from 'vitest'
import got from 'got'

import { NodeJSRequest } from '../../src/request/node.js'

vi.mock('got', () => ({ default: vi.fn() }))

describe('NodeJSRequest', () => {
    it('should disable got retries when deleting a WebDriver session', async () => {
        const request = new NodeJSRequest('DELETE', '/session/:sessionId')
        const error = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
        vi.mocked(got).mockRejectedValueOnce(error)

        await expect(request.makeRequest({
            protocol: 'http',
            hostname: 'localhost',
            port: 4444,
            connectionRetryCount: 3,
            logLevel: 'warn'
        }, 'session-id')).rejects.toBe(error)

        expect(got).toHaveBeenCalledTimes(1)
        expect(got).toHaveBeenCalledWith(
            new URL('http://localhost:4444/session/session-id'),
            expect.objectContaining({ method: 'DELETE', retry: { limit: 0 } })
        )
    })
})
