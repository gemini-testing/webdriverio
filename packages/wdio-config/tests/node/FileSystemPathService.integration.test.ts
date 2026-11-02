import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'

import FileSystemPathService from '../../src/node/FileSystemPathService.js'

it('finds nested specs with glob patterns and literal bracket filenames', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'wdio-glob-'))
    try {
        mkdirSync(path.join(root, 'nested'))
        for (const name of ['a.spec.ts', 'b.spec.js', '[literal].ts']) {
            writeFileSync(path.join(root, 'nested', name), '')
        }
        const service = new FileSystemPathService()
        expect(service.glob('*.spec.{ts,js}', root)).toEqual(['nested/a.spec.ts', 'nested/b.spec.js'])
        expect(service.glob('**/*.spec.ts', root)).toEqual(['nested/a.spec.ts'])
        expect(service.glob('nested/[literal].ts', root)).toEqual([path.join(root, 'nested', '[literal].ts')])
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})
