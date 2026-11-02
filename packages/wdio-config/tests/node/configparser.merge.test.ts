import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import ConfigParserBuilder from '../lib/ConfigParserBuilder.js'
import { FileNamed } from '../lib/FileNamed.js'

vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('configuration merge compatibility', () => {
    async function mergeConfig(initial: object, file: object) {
        const filePath = path.resolve('/config/wdio.conf.js')
        const parser = new ConfigParserBuilder(path.dirname(filePath), filePath, initial, [
            FileNamed(filePath).withContents({ config: { capabilities: [], ...file } })
        ]).build()
        await parser.initialize()
        return parser.getConfig() as ReturnType<typeof parser.getConfig> & { custom: any }
    }

    it('merges cyclic configuration objects without exhausting the stack', async () => {
        const first: Record<string, unknown> = { first: true }
        const second: Record<string, unknown> = { second: true }
        first.self = first
        second.self = second

        const config = await mergeConfig({ custom: first }, { custom: second })
        expect(config.custom.first).toBe(true)
        expect(config.custom.second).toBe(true)
        expect(config.custom.self).toBe(config.custom)
    })

    it('preserves Map keys and replaces duplicate values without deep merging them', async () => {
        const initialValue = { initial: true }
        const fileValue = { file: true }
        const config = await mergeConfig(
            { custom: new Map([['same', initialValue], ['keep', initialValue]]) },
            { custom: new Map([['same', fileValue], ['added', fileValue]]) }
        )
        expect([...config.custom.keys()]).toEqual(['same', 'keep', 'added'])
        expect(config.custom.get('same')).toBe(fileValue)
        expect(config.custom.get('keep')).toBe(initialValue)
    })

    it('preserves array concatenation and nested object merging', async () => {
        const config = await mergeConfig(
            { custom: { args: ['first'], nested: { first: true } } },
            { custom: { args: ['second'], nested: { second: true } } }
        )
        expect(config.custom).toEqual({
            args: ['first', 'second'],
            nested: { first: true, second: true }
        })
    })
})
