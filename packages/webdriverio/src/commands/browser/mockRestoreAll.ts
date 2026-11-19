import logger from '@testplane/wdio-logger'

import { getBrowserObject } from '@testplane/wdio-utils'
import BidiInterception from '../../utils/interception/bidi.js'
import { SESSION_MOCKS } from './mock.js'

const log = logger('webdriverio:mockRestoreAll')

/**
 * Restores all mock information and behavior stored in all registered
 * mocks of the session.
 *
 * <example>
    :mockRestoreAll.js
    it('should restore all mocks', async () => {
        const googleMock = await browser.mock('https://google.com/')
        googleMock.respond('https://webdriver.io')
        const wdioMock = await browser.mock('https://webdriver.io')
        wdioMock.respond('http://json.org')

        await browser.url('https://google.com/')
        console.log(await browser.getTitle()) // JSON

        await browser.mockRestoreAll()

        await browser.url('https://google.com/')
        console.log(await browser.getTitle()) // Google
    })
 * </example>
 *
 * @alias browser.mockRestoreAll
 */
export async function mockRestoreAll (this: WebdriverIO.Browser) {
    const sessionMocks = this.isBidi
        ? { [this.sessionId]: BidiInterception.getSessionMocks(getBrowserObject(this)) }
        : SESSION_MOCKS
    const errors: unknown[] = []

    for (const [handle, mocks] of Object.entries(sessionMocks)) {
        log.trace(`Clearing mocks for ${handle}`)
        for (const mock of mocks) {
            try {
                await mock.restore()
            } catch (error) {
                errors.push(error)
            }
        }
    }
    if (errors.length === 1) {
        throw errors[0]
    }
    if (errors.length > 1) {
        throw new AggregateError(errors, 'Failed to restore mocks')
    }
}
