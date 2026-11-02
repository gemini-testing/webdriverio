import http from 'node:http'
import nock from 'nock'
import { afterEach, describe, expect, it } from 'vitest'
import WebDriverMock from '../src/WebDriverMock.js'

function post (path: string, body: Record<string, unknown>) {
    return new Promise<number | undefined>((resolve, reject) => {
        const req = http.request(`http://webdriver-mock.test${path}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }
        }, res => {
            res.resume()
            res.on('end', () => resolve(res.statusCode))
        })
        req.on('error', reject)
        req.end(JSON.stringify(body))
    })
}

afterEach(() => nock.cleanAll())

describe('WebDriver protocol mock matching', () => {
    it('accepts a new session without optional requiredCapabilities', async () => {
        new WebDriverMock('webdriver-mock.test', 80).command.newSession().reply(200, { value: {} })
        await expect(post('/session', { capabilities: { alwaysMatch: { browserName: 'chrome' }, firstMatch: [{}] }, desiredCapabilities: { browserName: 'chrome' } })).resolves.toBe(200)
    })

    it('accepts required parameters whose value is zero', async () => {
        new WebDriverMock('webdriver-mock.test', 80).command.positionClick().reply(200, { value: null })
        await expect(post('/session/11111111-1111-1111-1111-111111111111/click', { button: 0 })).resolves.toBe(200)
    })

    it('uses W3C endpoints when the same command also exists in JSONWire', async () => {
        new WebDriverMock('webdriver-mock.test', 80).command.executeScript().reply(200, { value: true })
        await expect(post('/session/11111111-1111-1111-1111-111111111111/execute/sync', { script: 'return true', args: [] })).resolves.toBe(200)
    })

    it('still rejects missing required parameters', async () => {
        new WebDriverMock('webdriver-mock.test', 80).command.newSession().reply(200, { value: {} })
        await expect(post('/session', {})).rejects.toThrow('Nock: No match')
    })
})
