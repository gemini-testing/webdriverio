import { expect, test } from 'vitest'
import status from '../src/commands/status.js'

test('reports the installed Puppeteer version without depending on its entrypoint layout', async () => {
    expect(await status()).toEqual({ message: '', ready: true, puppeteerVersion: '25.10.0' })
})
