import path from 'node:path'
import { expect, describe, it, afterEach, vi } from 'vitest'

import { remote } from '../../../src/index.js'

vi.mock('fetch')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('click test', () => {
    it('should allow to left click on an element without passing a button type', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        const elem = await browser.$('#foo')

        await elem.click()
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0].pathname)
            .toBe('/session/foobar-123/element/some-elem-123/click')
    })

    it('should allow to left click on an element by passing a button type', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        const elem = await browser.$('#foo')

        await elem.click({ button: 'left' })
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0].pathname)
            .toBe('/session/foobar-123/actions')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]?.body as any).actions[0]).toMatchSnapshot()

        vi.mocked(fetch).mockClear()
        await elem.click({ button: 0 })
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[0][0].pathname)
            .toBe('/session/foobar-123/actions')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as any).actions[0]).toMatchSnapshot()
    })

    it('should allow to right click on an element', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        const elem = await browser.$('#foo')
        await elem.click({ button: 'right' })
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0].pathname)
            .toBe('/session/foobar-123/actions')
        expect(
            JSON.parse(vi.mocked(fetch).mock.calls[2][1]?.body as any).actions[0]
        ).toMatchSnapshot()

        vi.mocked(fetch).mockClear()
        await elem.click({ button: 2 })
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[0][0].pathname)
            .toBe('/session/foobar-123/actions')
        expect(
            JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as any).actions[0]
        ).toMatchSnapshot()
    })

    it('should allow to middle click on an element', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        const elem = await browser.$('#foo')
        await elem.click({ button: 'middle' })
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0].pathname)
            .toBe('/session/foobar-123/actions')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]?.body as any).actions[0])
            .toMatchSnapshot()

        vi.mocked(fetch).mockClear()
        await elem.click({ button: 1 })
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[0][0].pathname)
            .toBe('/session/foobar-123/actions')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as any).actions[0])
            .toMatchSnapshot()
    })

    it('should allow to left click on an element with an offset without passing a button type', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        const elem = await browser.$('#foo')
        await elem.click({ y: 15 })
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[3][0].pathname)
            .toBe('/session/foobar-123/actions')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[3][1]?.body as any).actions).toMatchSnapshot()
    })

    it('should allow to right click on an element with an offset and passing a button type', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        const elem = await browser.$('#foo')
        await elem.click({ button: 2, x: 20, y: 15 })
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[3][0].pathname)
            .toBe('/session/foobar-123/actions')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[3][1]?.body as any).actions[0].actions[0].type)
            .toBe('pointerMove')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[3][1]?.body as any).actions[0].actions[0].x)
            .toBe(20)
        expect(JSON.parse(vi.mocked(fetch).mock.calls[3][1]?.body as any).actions[0].actions[0].y)
            .toBe(15)
        expect(JSON.parse(vi.mocked(fetch).mock.calls[3][1]?.body as any).actions[0].actions[2])
            .toStrictEqual({ type: 'pause', duration: 0 })
        expect(JSON.parse(vi.mocked(fetch).mock.calls[3][1]?.body as any).actions[0].actions[1])
            .toMatchSnapshot()
        expect(JSON.parse(vi.mocked(fetch).mock.calls[3][1]?.body as any).actions[0].actions[3])
            .toStrictEqual({ type: 'pointerUp', button: 2 })
    })

    it('should to send a duration to execute a longPress on a mobile device', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar',
                mobileMode: true,
            } as any
        })
        const elem = await browser.$('#foo')
        await elem.click({ duration: 1000 })
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0].pathname)
            .toBe('/session/foobar-123/actions')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]?.body as any).actions[0])
            .toMatchSnapshot()
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]?.body as any).actions[0].actions[2])
            .toStrictEqual({ type: 'pause', duration: 1000 })
    })

    it('should allow to left click on an element (no w3c)', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar-noW3C'
            }
        })
        const elem = await browser.$('#foo')

        await elem.click({ button: 'left' })

        expect((vi.mocked(fetch) as any).mock.calls[3][0].pathname)
            .toBe('/session/foobar-123/moveto')
        expect((vi.mocked(fetch) as any).mock.calls[3][1].json)
            .toStrictEqual({ element: 'some-elem-123', xoffset: 25, yoffset: 15 })
        expect((vi.mocked(fetch) as any).mock.calls[4][0].pathname)
            .toBe('/session/foobar-123/click')
        expect((vi.mocked(fetch) as any).mock.calls[4][1].json).toStrictEqual({ button: 0 })

        await elem.click({ button: 0 })

        expect((vi.mocked(fetch) as any).mock.calls[6][0].pathname)
            .toBe('/session/foobar-123/moveto')
        expect((vi.mocked(fetch) as any).mock.calls[6][1].json)
            .toStrictEqual({ element: 'some-elem-123', xoffset: 25, yoffset: 15 })
        expect((vi.mocked(fetch) as any).mock.calls[7][0].pathname)
            .toBe('/session/foobar-123/click')
        expect((vi.mocked(fetch) as any).mock.calls[7][1].json).toStrictEqual({ button: 0 })
    })

    it('should allow to right click on an element (no w3c)', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar-noW3C'
            }
        })
        const elem = await browser.$('#foo')

        await elem.click({ button: 'right' })

        expect((vi.mocked(fetch).mock.calls[3][0] as any).pathname)
            .toBe('/session/foobar-123/moveto')
        expect((vi.mocked(fetch).mock.calls[3][1] as any).json)
            .toStrictEqual({ element: 'some-elem-123', xoffset: 25, yoffset: 15 })
        expect((vi.mocked(fetch).mock.calls[4][0] as any).pathname)
            .toBe('/session/foobar-123/click')
        expect((vi.mocked(fetch).mock.calls[4][1] as any).json)
            .toStrictEqual({ button: 2 })

        await elem.click({ button: 2 })

        expect((vi.mocked(fetch).mock.calls[6][0] as any).pathname)
            .toBe('/session/foobar-123/moveto')
        expect((vi.mocked(fetch).mock.calls[6][1] as any).json)
            .toStrictEqual({ element: 'some-elem-123', xoffset: 25, yoffset: 15 })
        expect((vi.mocked(fetch).mock.calls[7][0] as any).pathname)
            .toBe('/session/foobar-123/click')
        expect((vi.mocked(fetch).mock.calls[7][1] as any).json)
            .toStrictEqual({ button: 2 })
    })

    it('should allow to middle click on an element (no w3c)', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar-noW3C'
            }
        })
        const elem = await browser.$('#foo')

        await elem.click({ button: 'middle' })

        expect((vi.mocked(fetch) as any).mock.calls[3][0].pathname)
            .toBe('/session/foobar-123/moveto')
        expect((vi.mocked(fetch) as any).mock.calls[3][1].json)
            .toStrictEqual({ element: 'some-elem-123', xoffset: 25, yoffset: 15 })
        expect((vi.mocked(fetch) as any).mock.calls[4][0].pathname)
            .toBe('/session/foobar-123/click')
        expect((vi.mocked(fetch) as any).mock.calls[4][1].json)
            .toStrictEqual({ button: 1 })

        await elem.click({ button: 1 })

        expect((vi.mocked(fetch) as any).mock.calls[6][0].pathname)
            .toBe('/session/foobar-123/moveto')
        expect((vi.mocked(fetch) as any).mock.calls[6][1].json)
            .toStrictEqual({ element: 'some-elem-123', xoffset: 25, yoffset: 15 })
        expect((vi.mocked(fetch) as any).mock.calls[7][0].pathname)
            .toBe('/session/foobar-123/click')
        expect((vi.mocked(fetch) as any).mock.calls[7][1].json)
            .toStrictEqual({ button: 1 })
    })

    it('should allow to left click on an element with an offset without passing a button type (no w3c)', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar-noW3C'
            }
        })
        const elem = await browser.$('#foo')

        await elem.click({ y: 30 })

        expect((vi.mocked(fetch) as any).mock.calls[3][0].pathname)
            .toBe('/session/foobar-123/moveto')
        expect((vi.mocked(fetch) as any).mock.calls[3][1].json)
            .toStrictEqual({ element: 'some-elem-123', xoffset: 25, yoffset: 45 })
        expect((vi.mocked(fetch) as any).mock.calls[4][0].pathname)
            .toBe('/session/foobar-123/click')
        expect((vi.mocked(fetch) as any).mock.calls[4][1].json)
            .toStrictEqual({ button: 0 })
    })

    it('should allow to right click on an element with an offset and passing a button type (no w3c)', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar-noW3C'
            }
        })
        const elem = await browser.$('#foo')

        await elem.click({ button: 2, x: 40, y: 30 })

        expect((vi.mocked(fetch) as any).mock.calls[3][0].pathname)
            .toBe('/session/foobar-123/moveto')
        expect((vi.mocked(fetch) as any).mock.calls[3][1].json)
            .toStrictEqual({ element: 'some-elem-123', xoffset: 65, yoffset: 45 })
        expect((vi.mocked(fetch) as any).mock.calls[4][0].pathname)
            .toBe('/session/foobar-123/click')
        expect((vi.mocked(fetch) as any).mock.calls[4][1].json).toStrictEqual({ button: 2 })
    })

    it('should throw an error if the passed argument is not an options object', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        const elem = await browser.$('#foo')

        // @ts-expect-error invalid param
        expect(elem.click([])).rejects.toThrow('Options must be an object')
    })

    it('should throw an error if no valid coordinates are passed', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        const elem = await browser.$('#foo')

        // @ts-expect-error invalid param
        expect(elem.click({ x: 'not-suppported' })).rejects.toThrow('Coordinates must be integers')
    })

    it('should throw an error if no valid button type is passed', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        const elem = await browser.$('#foo')

        // @ts-expect-error invalid param
        expect(elem.click({ button: 'not-suppported' })).rejects.toThrow('Button type not suppported.')
    })

    it('should not call releaseAction when skipRelease is true', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar',
            }
        })
        const elem = await browser.$('#foo')
        await elem.click({ button: 'right' })

        expect(vi.mocked(fetch).mock.calls.length)
            .toBe(4)
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[3][0].pathname)
            .toBe('/session/foobar-123/actions')
        expect(vi.mocked(fetch).mock.calls[3][1]?.method)
            .toBe('DELETE')

        vi.mocked(fetch).mockClear()
        await elem.click({ button: 'right', skipRelease: true })
        expect(vi.mocked(fetch).mock.calls.length).toBe(1) // only action call
    })

    afterEach(() => {
        vi.mocked(fetch).mockClear()
    })
})
