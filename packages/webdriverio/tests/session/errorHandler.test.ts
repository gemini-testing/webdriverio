import { describe, expect, it } from 'vitest'

import {
    flushSessionManagerErrors,
    reportSessionManagerError,
    trackSessionManagerTask,
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

    it('should wait for an active command before reporting a session manager error', async () => {
        const browser = {}
        let completeCommand!: () => void
        let commandCompleted = false
        const command = wrapCommandWithErrors('test', () => new Promise<void>((resolve) => {
            completeCommand = () => {
                commandCompleted = true
                resolve()
            }
        }))

        const commandResult = command.call(browser)
        reportSessionManagerError(browser, new Error('context update failed'))
        await Promise.resolve()
        expect(commandCompleted).toBe(false)
        completeCommand()

        await expect(commandResult).rejects.toThrow('context update failed')
        expect(commandCompleted).toBe(true)
    })

    it('should reject the next command when an error occurs between commands', async () => {
        const browser = {}
        reportSessionManagerError(browser, new Error('context update failed'))
        const command = wrapCommandWithErrors('test', async () => 'result')

        await expect(command.call(browser)).rejects.toThrow('context update failed')
        await expect(flushSessionManagerErrors(browser)).rejects.toThrow('context update failed')
        await expect(command.call(browser)).resolves.toBe('result')
    })

    it('should wait for background work and fail the test even after its last command', async () => {
        const browser = {}
        let rejectTask!: (error: Error) => void
        trackSessionManagerTask(browser, new Promise<void>((_resolve, reject) => {
            rejectTask = reject
        }))

        const result = flushSessionManagerErrors(browser)
        rejectTask(new Error('late context failure'))

        await expect(result).rejects.toThrow('late context failure')
        await expect(flushSessionManagerErrors(browser)).resolves.toBeUndefined()
    })

    it('should preserve multiple session manager errors', async () => {
        const browser = {}
        reportSessionManagerError(browser, new Error('first failure'))
        reportSessionManagerError(browser, new Error('second failure'))

        const error = await flushSessionManagerErrors(browser).catch(err => err)
        expect(error).toBeInstanceOf(AggregateError)
        expect(error.errors.map((err: Error) => err.message)).toEqual(['first failure', 'second failure'])
    })

    it('should allow deleteSession even when a session manager error is pending', async () => {
        const browser = {}
        const deleteSession = wrapCommandWithErrors('deleteSession', async () => 'deleted')
        reportSessionManagerError(browser, new Error('context update failed'))

        await expect(deleteSession.call(browser)).resolves.toBe('deleted')
        await expect(flushSessionManagerErrors(browser)).rejects.toThrow('context update failed')
    })
})
