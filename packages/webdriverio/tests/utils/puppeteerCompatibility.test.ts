import { EventEmitter, type Browser, type PageEvents } from 'puppeteer-core'
import { describe, expect, it, vi } from 'vitest'
import { addPuppeteerCompatibility } from '../../src/utils/puppeteerCompatibility.js'

function pageFixture() {
    const events = new EventEmitter<PageEvents>()
    const target = { page: async () => events, asPage: async () => events }
    const browser = Object.assign(new EventEmitter(), { targets: () => [target], browserContexts: () => [] })
    const compatible = addPuppeteerCompatibility(browser as unknown as Browser)
    return { events, target: compatible.targets()[0] }
}

describe('Puppeteer 20 page compatibility', () => {
    it('delivers Errors, preserves native Errors and removes the original pageerror listener', async () => {
        const { events, target } = pageFixture()
        const page = await target.asPage()
        const observed: Error[] = []
        const listener = (error: Error) => observed.push(error)
        page.on('pageerror', listener)
        events.emit('pageerror', 'uncaught string')
        const error = new RangeError('native')
        events.emit('pageerror', error)
        page.off('pageerror', listener)
        events.emit('pageerror', null)
        expect(observed).toHaveLength(2)
        expect(observed[0]).toBeInstanceOf(Error)
        expect(observed[0].message).toBe('uncaught string')
        expect(observed[1]).toBe(error)
    })

    it('normalizes once events without replacing Puppeteer’s listener bookkeeping', async () => {
        const { events, target } = pageFixture()
        const page = (await target.page())!
        const listener = vi.fn()
        page.on('pageerror', listener).on('pageerror', listener)
        page.off('pageerror', listener)
        expect(page.listenerCount('pageerror')).toBe(1)
        page.off('pageerror', listener)
        events.emit('pageerror', 'removed')
        page.once('pageerror', listener)
        events.emit('pageerror', null)
        events.emit('pageerror', 'duplicate')
        expect(listener).toHaveBeenCalledTimes(1)
        expect(listener).toHaveBeenCalledWith(new Error('null'))
    })

    it('supplies fragment-free network URLs and the legacy console warning type', async () => {
        const { events, target } = pageFixture()
        const page = await target.asPage()
        const seen: string[] = []
        page.on('request', req => seen.push(req.url()))
        page.once('response', res => seen.push(res.url()))
        page.once('console', msg => seen.push(msg.type(), msg.text()))
        const url = () => 'https://fixture.test/item?q=%23tag#part'
        const message = { type: () => 'warn', text: () => 'warning text' }
        events.emit('request', { url } as PageEvents['request'])
        events.emit('response', { url } as PageEvents['response'])
        events.emit('console', message as PageEvents['console'])
        expect(seen).toEqual(['https://fixture.test/item?q=%23tag', 'https://fixture.test/item?q=%23tag', 'warning', 'warning text'])
    })
})
