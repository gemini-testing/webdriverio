import { expect, describe, it, vi } from 'vitest'

import path from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import JSZip from 'jszip'
import { remote } from '../../../src/index.js'

import '../../../src/node.js'

vi.mock('fetch')
vi.mock('devtools')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('uploadFile', () => {
    it('should throw if browser does not support it', async function () {
        const browser = await remote({
            baseUrl: 'http://webdriver.io',
            capabilities: {
                browserName: 'firefox'
            }
        })

        await expect(browser.uploadFile('/foo/bar.jpg')).rejects.toEqual(
            new Error('The uploadFile command is not available in mockBrowser'))
    })

    it('should throw if path is not a string', async function () {
        const browser = await remote({
            baseUrl: 'http://webdriver.io',
            capabilities: {
                browserName: 'chrome'
            }
        })

        // @ts-expect-error wrong parameter
        await expect(browser.uploadFile(123)).rejects.toEqual(
            new Error('number or type of arguments don\'t agree with uploadFile command'))
    })

    it('should archive the file and use file command', async () => {
        const browser = await remote({
            baseUrl: 'http://webdriver.io',
            capabilities: {
                browserName: 'chrome'
            }
        })
        const file = vi.fn().mockResolvedValue('/some/local/path')
        browser.file = file
        const directory = await mkdtemp(path.join(tmpdir(), 'wdio-upload-'))
        const filename = 'файл с пробелом.bin'
        const contents = Buffer.from([0, 1, 127, 128, 255])
        const localPath = path.join(directory, filename)

        try {
            await writeFile(localPath, contents)
            await expect(browser.uploadFile(localPath)).resolves.toBe('/some/local/path')

            const zip = await JSZip.loadAsync(file.mock.calls[0][0], { base64: true })
            expect(Object.keys(zip.files)).toEqual([filename])
            expect(await zip.file(filename)!.async('nodebuffer')).toEqual(contents)
        } finally {
            await rm(directory, { recursive: true, force: true })
        }
    })
})
