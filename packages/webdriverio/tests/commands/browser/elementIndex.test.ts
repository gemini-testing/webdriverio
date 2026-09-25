import { afterEach, describe, expect, it, vi } from 'vitest'
import { remote } from '../../../src/index.js'

afterEach(() => (vi.mocked(fetch) as any).setMockResponse(null))

const element = (id: string) => ({ 'element-6066-11e4-a52e-4f735466cecf': id })

describe('chained element array index', () => {
    it('refetches the array until the requested index exists', async () => {
        const browser = await remote({ capabilities: { browserName: 'mock' }, waitforTimeout: 1000, waitforInterval: 5 })
        const fetchMock = vi.mocked(fetch) as any
        fetchMock.mockClear()
        fetchMock.setMockResponse([[], [element('first')], [element('first'), element('second')]])
        const result = await browser.$$('.foo')[1].getElement()
        expect(result.elementId).toBe('second')
        expect(fetchMock.mock.calls).toHaveLength(3)
        expect(fetchMock.mock.calls.every(([url]: [URL]) => url.pathname.endsWith('/elements'))).toBe(true)
    })

    it('does not refetch an index already present', async () => {
        const browser = await remote({ capabilities: { browserName: 'mock' } })
        const fetchMock = vi.mocked(fetch) as any
        fetchMock.mockClear()
        fetchMock.setMockResponse([[element('first')]])
        expect((await browser.$$('.foo')[0].getElement()).elementId).toBe('first')
        expect(fetchMock.mock.calls).toHaveLength(1)
    })
})
