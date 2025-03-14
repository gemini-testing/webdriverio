import path from 'node:path'
import { expect, describe, it, beforeEach, vi } from 'vitest'

import { remote } from '../../../src/index.js'

vi.mock('fetch')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('doubleClick', () => {
    beforeEach(() => {
        vi.mocked(fetch).mockClear()
    })

    it('should do a doubleClick', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })

        const elem = await browser.$('#elem')
        await elem.doubleClick()

        // double click
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0]!.pathname).toContain('/foobar-123/actions')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as any).actions).toHaveLength(1)
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as any).actions[0].type).toBe('pointer')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as any).actions[0].actions).toHaveLength(6)
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as any).actions[0].actions[0].type).toBe('pointerMove')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as any).actions[0].actions[0].origin['element-6066-11e4-a52e-4f735466cecf']).toBe('some-elem-123')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as any).actions[0].actions[0].x).toBe(0)
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as any).actions[0].actions[0].y).toBe(0)
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as any).actions[0].actions).toMatchSnapshot()
    })
    it('should do a doubleClick (no w3c)', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar-noW3C'
            }
        })

        const elem = await browser.$('#elem')
        await elem.doubleClick()

        // move to
        expect((vi.mocked(fetch) as any).mock.calls[2][0]!.pathname).toContain('/foobar-123/moveto')
        expect((vi.mocked(fetch) as any).mock.calls[2][1]!.json).toEqual({ element: 'some-elem-123' })

        // double click
        expect((vi.mocked(fetch) as any).mock.calls[3][0]!.pathname).toContain('/foobar-123/doubleclick')
    })
})
