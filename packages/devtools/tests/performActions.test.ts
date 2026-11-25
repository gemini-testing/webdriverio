import { expect, test, vi } from 'vitest'
import performActions from '../src/commands/performActions.js'
import type DevToolsDriver from '../src/devtoolsdriver.js'

test('performs two clicks using the supported Puppeteer click count option', async () => {
    const click = vi.fn()
    const driver = { getPageHandle: () => ({ mouse: { click } }) } as unknown as DevToolsDriver

    await performActions.call(driver, {
        actions: [{
            type: 'pointer',
            actions: [
                { type: 'pointerMove', x: 20, y: 30 },
                { type: 'pointerDown', button: 0 },
                { type: 'pointerUp', button: 0 },
                { type: 'pause', duration: 10 },
                { type: 'pointerDown', button: 0 },
                { type: 'pointerUp', button: 0 }
            ]
        }]
    })

    expect(click).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledWith(20, 30, { count: 2 })
})
