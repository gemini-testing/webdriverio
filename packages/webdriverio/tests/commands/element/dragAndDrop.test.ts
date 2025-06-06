import path from 'node:path'
import { expect, describe, it, beforeEach, vi } from 'vitest'

import { remote } from '../../../src/index.js'

vi.mock('fetch')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('dragAndDrop', () => {
    beforeEach(() => {
        vi.mocked(fetch).mockClear()
    })

    it('should throw when parameter are invalid', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })

        const elem = await browser.$('#foo')
        expect.assertions(3)
        try {
            // @ts-expect-error invalid param
            await elem.dragAndDrop()
        } catch (err: any) {
            expect(err.message).toContain('requires an WebdriverIO Element')
        }

        try {
            // @ts-expect-error invalid param
            await elem.dragAndDrop('#myId')
        } catch (err: any) {
            expect(err.message).toContain('requires an WebdriverIO Element')
        }

        try {
            await elem.dragAndDrop({ x: 1 })
        } catch (err: any) {
            expect(err.message).toContain('requires an WebdriverIO Element')
        }
    })

    it('should do a dragAndDrop', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })

        const elem = await browser.$('#foo')
        const subElem = await elem.$('#subfoo')
        // @ts-ignore mock feature
        vi.mocked(fetch).setMockResponse([{ scrollX: 0, scrollY: 20 }])
        await elem.dragAndDrop(subElem)

        // move to
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[3][0].pathname).toContain('/foobar-123/actions')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[3][1]?.body as any).actions).toMatchSnapshot()
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[4][0].pathname).toContain('/foobar-123/actions')
        expect(vi.mocked(fetch).mock.calls[4][1]?.method).toContain('DELETE')
    })

    it('should resolve target element', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })

        const elem = browser.$('#foo')
        const subElem = elem.$('#subfoo')
        // @ts-ignore mock feature
        vi.mocked(fetch).setMockResponse([{ scrollX: 0, scrollY: 20 }])
        await elem.dragAndDrop(subElem)

        // move to
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[9][0].pathname).toContain('/foobar-123/actions')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[3][1]?.body as any).actions).toMatchSnapshot()
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[10][0].pathname).toContain('/foobar-123/actions')
        expect(vi.mocked(fetch).mock.calls[10][1]?.method).toContain('DELETE')
    })

    it('should do a dragAndDrop for mobile', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar',
                mobileMode: true,
                platformName: 'iOS'
            } as any
        })

        const elem = await browser.$('#foo')
        const subElem = await elem.$('#subfoo')
        // @ts-ignore mock feature
        vi.mocked(fetch).setMockResponse([{ scrollX: 0, scrollY: 20 }])
        await elem.dragAndDrop(subElem)

        // move to
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[3][0].pathname).toContain('/foobar-123/actions')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[3][1]?.body as any).actions).toMatchSnapshot()
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[4][0].pathname).toContain('/foobar-123/actions')
        expect(vi.mocked(fetch).mock.calls[4][1]?.method).toContain('DELETE')
    })

    it('should do a dragAndDrop with coordinates', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })

        const elem = await browser.$('#foo')
        // @ts-ignore mock feature
        vi.mocked(fetch).setMockResponse([{ scrollX: 0, scrollY: 20 }])
        await elem.dragAndDrop({ x: 123, y: 321 })

        // move to
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0].pathname).toContain('/foobar-123/actions')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]?.body as any).actions).toHaveLength(1)
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]?.body as any).actions).toMatchSnapshot()
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[3][0].pathname).toContain('/foobar-123/actions')
        expect(vi.mocked(fetch).mock.calls[3][1]?.method).toContain('DELETE')
    })

    it('should allow drag and drop to 0 coordinates', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })

        const elem = await browser.$('#foo')
        await elem.dragAndDrop({ x: 0, y: 0 })

        // move to
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0].pathname).toContain('/foobar-123/actions')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]?.body as any).actions).toMatchSnapshot()
    })

    it('should do a dragAndDrop (no w3c)', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar-noW3C'
            }
        })

        const elem = await browser.$('#foo')
        const subElem = await elem.$('#subfoo')
        await elem.dragAndDrop(subElem)

        expect((vi.mocked(fetch) as any).mock.calls[3][0].pathname).toContain('/foobar-123/moveto')
        expect((vi.mocked(fetch) as any).mock.calls[3][1].json).toEqual({ element: 'some-elem-123' })
        expect((vi.mocked(fetch) as any).mock.calls[4][0].pathname).toContain('/foobar-123/buttondown')
        expect((vi.mocked(fetch) as any).mock.calls[5][0].pathname).toContain('/foobar-123/moveto')
        expect((vi.mocked(fetch) as any).mock.calls[5][1].json).toEqual({ element: 'some-sub-elem-321' })
        expect((vi.mocked(fetch) as any).mock.calls[6][0].pathname).toContain('/foobar-123/buttonup')
    })

    it('should do a dragAndDrop with the given duration (no w3c)', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar-noW3C'
            }
        })

        const elem = await browser.$('#foo')
        const subElem = await elem.$('#subfoo')

        const startTime = process.hrtime()
        await elem.dragAndDrop(subElem, { duration: 100 })
        const endTime = process.hrtime(startTime)
        const totalExecutionTime = (endTime[0] * 1e9 + endTime[1]) * 1e-6

        expect(totalExecutionTime >= 100 && totalExecutionTime < 400).toBeTruthy()

    })

    it('should do a dragAndDrop with the given coordinates (no w3c)', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar-noW3C'
            }
        })

        const elem = await browser.$('#foo')
        await elem.dragAndDrop({ x: 123, y: 321 })

        expect((vi.mocked(fetch) as any).mock.calls[2][0].pathname).toContain('/foobar-123/moveto')
        expect((vi.mocked(fetch) as any).mock.calls[2][1].json).toEqual({ element: 'some-elem-123' })
        expect((vi.mocked(fetch) as any).mock.calls[3][0].pathname).toContain('/foobar-123/buttondown')
        expect((vi.mocked(fetch) as any).mock.calls[4][0].pathname).toContain('/foobar-123/moveto')
        expect((vi.mocked(fetch) as any).mock.calls[4][1].json).toEqual({ element: null, xoffset: 123, yoffset: 321 })
        expect((vi.mocked(fetch) as any).mock.calls[5][0].pathname).toContain('/foobar-123/buttonup')
    })

    it('should do a dragAndDrop with the given co-ordinates and duration(no w3c)', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar-noW3C'
            }
        })

        const elem = await browser.$('#foo')
        const startTime = process.hrtime()
        await elem.dragAndDrop({ x: 123, y: 321 }, { duration: 200 })
        const endTime = process.hrtime(startTime)
        const totalExecutionTime = (endTime[0] * 1e9 + endTime[1]) * 1e-6

        expect(totalExecutionTime >= 200 && totalExecutionTime < 500).toBeTruthy()
    })
})
