import { describe, expect, it } from 'vitest'
import { getErrorFromResponseBody, getTimeoutError } from '../../src/utils.js'

// The got-based request layer replaced WebDriverResponseError and
// WebDriverRequestError. Exercise its public error helpers, not deleted classes.
describe('WebDriver response errors', () => {
    it.each([
        [undefined, 'Response has empty body', 'Error'],
        [{}, 'unknown error', 'WebDriver Error'],
        [{ value: { error: 'foo', message: 'bar' } }, 'bar', 'foo'],
        [{ value: { message: 'stale element reference' } }, 'stale element reference', 'stale element reference'],
        [{ value: { message: 'message error' } }, 'message error', 'WebDriver Error'],
        [{ value: { class: 'class error' } }, 'class error', 'WebDriver Error'],
        [{ value: { name: 'Protocol Error' } }, 'unknown error', 'Protocol Error'],
        [{ value: {} }, 'unknown error', 'WebDriver Error'],
        [{ message: 'Command not found: POST /some/command', error: 'unknown method' }, 'Command not found: POST /some/command', 'unknown method'],
        ['plain text error', 'plain text error', 'Error'],
        [42, 'Unknown error', 'Error']
    ])('preserves the server message and error name for %j', (body, message, name) => {
        const error = getErrorFromResponseBody(body, {})
        expect(error).toBeInstanceOf(Error)
        expect(error.message).toBe(message)
        expect(error.name).toBe(name)
        expect(error.stack).toContain(message)
    })

    it('explains an invalid selector with its value and strategy', () => {
        const error = getErrorFromResponseBody({ value: { message: 'invalid locator' } }, { using: 'css selector', value: '!!' })
        expect(error.message).toBe('The selector "!!" used with strategy "css selector" is invalid!')
    })

    it.each([
        { script: Buffer.from('script').toString('base64') },
        { script: 'return (function() {\nconsole.log("hi")\n}).apply(null, arguments)' },
        { file: Buffer.from('screen').toString('base64') },
        { foo: 'bar' }
    ])('does not append potentially large command arguments to the server error', args => {
        const error = getErrorFromResponseBody({ value: { message: 'Timeout' } }, args)
        expect(error.message).toBe('Timeout')
        expect(error.message).not.toContain(JSON.stringify(args))
    })
})

describe('WebDriver timeout errors', () => {
    it('preserves the transport error code', () => {
        const error = getTimeoutError(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), {
            method: 'POST', url: new URL('http://localhost:4444/session'), timeout: { response: 1000 }
        })
        expect(error).toMatchObject({ code: 'ETIMEDOUT' })
        expect(error.message).toContain('http://localhost:4444/session')
    })
})
