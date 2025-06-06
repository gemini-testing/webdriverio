import path from 'node:path'
import { expect, describe, it, afterEach, vi } from 'vitest'

import { remote } from '../../../src/index.js'

vi.mock('fetch')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('getSize test', () => {
    it('should allow to get the width and height of an element', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        const elem = await browser.$('#foo')
        const size = await elem.getSize()
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0]!.pathname)
            .toBe('/session/foobar-123/element/some-elem-123/rect')
        expect(size.width).toBe(50)
        expect(size.height).toBe(30)
    })

    it('should allow to get the width and height of an element using jsonwp spec', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                // @ts-ignore mock feature
                jsonwpMode: true,
                browserName: 'foobar'
            } as any
        })
        const elem = await browser.$('#foo')
        const size = await elem.getSize()

        expect((vi.mocked(fetch) as any).mock.calls[2][0]!.pathname)
            .toBe('/session/foobar-123/element/some-elem-123/size')
        expect(size.width).toBe(50)
        expect(size.height).toBe(30)
    })

    it('should allow to get the width of an element', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        const elem = await browser.$('#foo')

        const width = await elem.getSize('width')
        expect(width).toBe(50)
        const height = await elem.getSize('height')
        expect(height).toBe(30)
        // @ts-expect-error invalid param
        const invalid = await elem.getSize('foobar')
        expect(invalid).toEqual({ width: 50, height: 30 })
    })

    afterEach(() => {
        vi.mocked(fetch).mockClear()
    })
})
