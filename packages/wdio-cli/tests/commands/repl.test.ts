import path from 'node:path'
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest'
// @ts-expect-error mock
import { yargs } from 'yargs'
import { remote } from '@testplane/webdriverio'

import { handler, builder } from '../../src/commands/repl.js'

vi.mock('@testplane/wdio-utils', () => {
    let syncSupport = false

    return {
        HOOK_DEFINITION: {},
        default: {
            setSyncSupport: (val: boolean) => (syncSupport = val),
            get hasWdioSyncSupport () {
                return syncSupport
            }
        }
    }
})

vi.mock('repl')
vi.mock('yargs')
vi.mock('webdriverio', () => import(path.join(process.cwd(), '__mocks__', 'webdriverio')))

describe('repl commandDir', () => {
    it('should call debug command', async () => {
        const client = await handler({ browserName: 'chrome' } as any) as any
        expect(client.debug).toHaveBeenCalledTimes(1)
        expect(client.deleteSession).toHaveBeenCalledTimes(1)
    })

    it('it should properly build command', () => {
        builder(yargs)
        expect(yargs.options).toHaveBeenCalled()
        expect(yargs.example).toHaveBeenCalled()
        expect(yargs.epilogue).toHaveBeenCalled()
        expect(yargs.help).toHaveBeenCalled()
    })

    afterEach(() => {
        // @ts-ignore mock feature
        delete global.$
        // @ts-ignore mock feature
        delete global.$$
        // @ts-ignore mock feature
        delete global.browser
    })
})

describe('Command: repl', () => {
    beforeEach(() => {
        vi.mocked(remote).mockClear()
    })

    it('should attach global variables', async () => {
        await handler({} as any)

        expect(global.$).not.toBeUndefined()
        expect(global.$$).not.toBeUndefined()
        expect(global.browser).not.toBeUndefined()
    })

    it('should set the correct browser', async () => {
        await handler({ option: 'foobar' } as any)

        expect(remote).toHaveBeenCalledWith({ capabilities: { browserName: 'foobar' }, option: 'foobar' } as any)
    })

    afterEach(() => {
        // @ts-ignore mock feature
        delete global.$
        // @ts-ignore mock feature
        delete global.$$
        // @ts-ignore mock feature
        delete global.browser
    })
})
