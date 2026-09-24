import { describe, expect, it } from 'vitest'

import {
    reportSessionManagerError,
    wrapCommandWithSessionManagerErrors
} from '../../src/session/errorHandler.js'

describe('session manager error handler', () => {
    const wrapCommand = (_commandName: string, command: Function) => command
    const wrapCommandWithErrors = wrapCommandWithSessionManagerErrors(wrapCommand)

    it('should resolve a command when no session manager error occurs', async () => {
        const browser = {}
        const command = wrapCommandWithErrors('test', async () => 'result')

        await expect(command.call(browser)).resolves.toBe('result')
    })

    it('should reject an active command when a session manager reports an error', async () => {
        const browser = {}
        let completeCommand!: () => void
        const command = wrapCommandWithErrors('test', () => new Promise<void>((resolve) => {
            completeCommand = resolve
        }))

        const commandResult = command.call(browser)
        reportSessionManagerError(browser, new Error('context update failed'))
        completeCommand()

        await expect(commandResult).rejects.toThrow('context update failed')
    })

    it('should reject the next command when an error occurs between commands', async () => {
        const browser = {}
        reportSessionManagerError(browser, new Error('context update failed'))
        const command = wrapCommandWithErrors('test', async () => 'result')

        await expect(command.call(browser)).rejects.toThrow('context update failed')
        await expect(command.call(browser)).resolves.toBe('result')
    })
})
