/// <reference path="../../../src/@types/async.d.ts" />
import path from 'node:path'
import { expect, describe, it, beforeAll, afterEach, vi } from 'vitest'

import { remote } from '../../../src/index.js'

vi.mock('fetch')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('clearValue test', () => {
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
    })

    it('should allow to clear an input element', async () => {
        await elem.clearValue()
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0]!.pathname)
            .toBe('/session/foobar-123/element/some-elem-123/clear')
    })

    afterEach(() => {
        vi.mocked(fetch).mockClear()
    })
})
