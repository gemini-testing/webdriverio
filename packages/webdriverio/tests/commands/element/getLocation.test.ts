import path from 'node:path'
import { expect, describe, it, afterEach, vi } from 'vitest'

import { remote } from '../../../src/index.js'

vi.mock('fetch')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('getLocation test', () => {
    it('should allow to get the width and height of an element', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        const elem = await browser.$('#foo')
        const size = await elem.getLocation()
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0]!.pathname)
            .toBe('/session/foobar-123/element/some-elem-123/rect')
        expect(size.x).toBe(15)
        expect(size.y).toBe(20)
    })

    it('should allow to get the width and height of an element using jsonwp spec', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                // @ts-ignore mock feature
                jsonwpMode: true,
                browserName: 'foobar'
            }
        } as any)
        const elem = await browser.$('#foo')
        const size = await elem.getLocation()

        expect((vi.mocked(fetch) as any).mock.calls[2][0]!.pathname)
            .toBe('/session/foobar-123/element/some-elem-123/location')
        expect(size.x).toBe(15)
        expect(size.y).toBe(20)
    })

    it('should allow to get the x or y value of an element', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        const elem = await browser.$('#foo')
        const x = await elem.getLocation('x')
        const y = await elem.getLocation('y')
        expect(x).toBe(15)
        expect(y).toBe(20)
    })

    afterEach(() => {
        vi.mocked(fetch).mockClear()
    })
})
