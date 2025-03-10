import path from 'node:path'
import { expect, describe, it, beforeAll, afterEach, vi } from 'vitest'

import { remote } from '../../../src/index.js'

vi.mock('fetch')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('isDisplayedInViewport test', () => {
    let browser: WebdriverIO.Browser
    let elem: any

    beforeAll(async () => {
        browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        elem = await browser.$('#foo')
        vi.mocked(fetch).mockClear()
    })

    it('should allow to check if element is displayed', async () => {
        await elem.isDisplayedInViewport()
        expect(vi.mocked(fetch).mock.calls[0][0]!.pathname)
            .toBe('/session/foobar-123/execute/sync')
        expect(vi.mocked(fetch).mock.calls[0][1]!.json.args[0]).toEqual({
            'element-6066-11e4-a52e-4f735466cecf': 'some-elem-123',
            ELEMENT: 'some-elem-123'
        })
    })

    it('should return false if element can\'t be found after refetching it', async () => {
        const elem = await browser.$('#nonexisting')
        expect(await elem.isDisplayedInViewport()).toBe(false)
        expect(fetch).toBeCalledTimes(2)
    })

    afterEach(() => {
        vi.mocked(fetch).mockClear()
    })
})
