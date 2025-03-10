import path from 'node:path'
import { expect, describe, it, afterEach, vi } from 'vitest'

import { remote } from '../../../src/index.js'

vi.mock('fetch')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('getProperty test', () => {
    it('should allow to get the property of an element', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        const elem = await browser.$('#foo')
        const property = await elem.getProperty('tagName')
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0]!.pathname)
            .toBe('/session/foobar-123/element/some-elem-123/property/tagName')
        expect(property).toBe('BODY')
    })

    it('should allow to get the property of an element jsonwp style', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar-noW3C'
            }
        })
        const elem = await browser.$('#foo')
        // @ts-expect-error mock feature
        elem.elementId = { tagName: 'BODY' }
        const property = await elem.getProperty('tagName')

        expect((vi.mocked(fetch) as any).mock.calls[2][0]!.pathname)
            .toBe('/session/foobar-123/execute')
        expect(property).toBe('BODY')
    })

    afterEach(() => {
        vi.mocked(fetch).mockClear()
    })
})
