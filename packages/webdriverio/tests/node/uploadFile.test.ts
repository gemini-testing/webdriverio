import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'

import { uploadFile } from '../../src/node/uploadFile.js'

it('uploads a readable ZIP containing the original file and basename', async () => {
    const localPath = fileURLToPath(import.meta.url)
    const file = vi.fn().mockResolvedValue('/remote/uploadFile.test.ts')

    await expect(uploadFile.call({ file } as unknown as WebdriverIO.Browser, localPath))
        .resolves.toBe('/remote/uploadFile.test.ts')

    const zip = await JSZip.loadAsync(file.mock.calls[0][0], { base64: true })
    expect(Object.keys(zip.files)).toEqual(['uploadFile.test.ts'])
    expect(await zip.file('uploadFile.test.ts')!.async('nodebuffer')).toEqual(await readFile(localPath))
})

it('rejects unreadable files without sending an upload command', async () => {
    const file = vi.fn()
    const localPath = `${fileURLToPath(import.meta.url)}.missing`

    await expect(uploadFile.call({ file } as unknown as WebdriverIO.Browser, localPath))
        .rejects.toMatchObject({ code: 'ENOENT' })
    expect(file).not.toHaveBeenCalled()
})

it('propagates upload errors from the remote driver', async () => {
    const error = new Error('Upload failed')
    const file = vi.fn().mockRejectedValue(error)

    await expect(uploadFile.call({ file } as unknown as WebdriverIO.Browser, fileURLToPath(import.meta.url)))
        .rejects.toBe(error)
})
