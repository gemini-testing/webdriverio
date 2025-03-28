import path from 'node:path'
import { expect, describe, afterEach, it, vi } from 'vitest'
import { remote } from '../../../src/index.js'

vi.mock('fetch')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('react$', () => {
    it('should fetch an React component', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })

        const options = {
            props: { some: 'props' },
            state: { some: 'state' }
        }
        const elem = await browser.react$('myComp', options)

        expect(elem.elementId).toBe('some-elem-123')
        expect(fetch).toBeCalledTimes(4)
        expect(JSON.parse(vi.mocked(fetch).mock.calls.pop()![1]?.body as any).args)
            .toEqual(['myComp', { some: 'props' }, { some: 'state' }])
    })

    it('should default state and props to empty object', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })

        await browser.react$('myComp')
        expect(JSON.parse(vi.mocked(fetch).mock.calls.pop()![1]?.body as any).args).toEqual(['myComp', {}, {}])
    })

    it('should call getElement with React flag true', async () => {
        const browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })

        const elem = await browser.react$('SomeCmp')
        expect(elem.isReactElement).toBe(true)
    })

    afterEach(() => {
        vi.mocked(fetch).mockClear()
    })
})
