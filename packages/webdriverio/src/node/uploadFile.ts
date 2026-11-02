import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'

/**
 * Command implementation of the `uploadFile` command.
 */
export async function uploadFile (
    this: WebdriverIO.Browser,
    localPath: string
): Promise<string> {
    /**
     * parameter check
     */
    if (typeof localPath !== 'string') {
        throw new Error('number or type of arguments don\'t agree with uploadFile command')
    }

    /**
     * check if command is available
     */
    if (typeof this.file !== 'function') {
        throw new Error(`The uploadFile command is not available in ${(this.capabilities as WebdriverIO.Capabilities).browserName}`)
    }

    const zip = new JSZip()
    zip.file(path.basename(localPath), fs.createReadStream(localPath))
    const zipData = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' })
    return this.file(zipData)
}
