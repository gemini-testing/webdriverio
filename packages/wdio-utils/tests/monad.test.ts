import path from 'node:path'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import webdriverMonad from '../src/monad.js'

let prototype: any

vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

beforeEach(() => {
    prototype = {
        scope: { value: '' },
        someFunc: { value: vi.fn().mockImplementation((arg) => `result-${arg.toString()}`) }
    }
})

const sessionId = 'c5fa4320-07d5-48f5-b7c2-922d4405e17f'

function createElement (elementOverrides: PropertyDescriptor, command: Function) {
    return webdriverMonad({}, (element: any) => element, {
        scope: { value: 'element' },
        someFunc: { value: command },
        __elementOverrides__: elementOverrides
    })(sessionId)
}

describe('monad', () => {
    it('should be able to initialize client with prototype with commands', () => {
        const modifier = vi.fn()
        const monad = webdriverMonad({ baseUrl: 'option' }, (client: any) => {
            modifier()
            return client
        }, prototype)
        const client = monad(sessionId)

        expect(client.sessionId).toBe(sessionId)
        expect(client.options).toEqual({ baseUrl: 'option' })
        expect(client.commandList).toHaveLength(1)
        expect(client.commandList[0]).toBe('someFunc')

        client.someFunc(123)
        expect(prototype.someFunc.value.mock.calls).toHaveLength(1)
        expect(prototype.someFunc.value.mock.calls[0][0]).toBe(123)
        expect(client.constructor.name).toBe('Browser')
    })

    it('should allow to set element scope name', () => {
        prototype.scope.value = 'element'
        const monad = webdriverMonad({}, (client: any) => client, prototype)
        const client = monad(sessionId)
        expect(client.constructor.name).toBe('Element')
    })

    it('should allow to extend base prototype', () => {
        const monad = webdriverMonad({}, (client: any) => client, prototype)
        const commandWrapperMock = vi.fn().mockImplementation((name, fn) => fn)
        const client = monad(sessionId, commandWrapperMock)
        const fn = () => 'bar'

        client.addCommand('foo', fn)
        expect(client.foo()).toBe('bar')
    })

    it('should allow to overwrite command in base prototype', () => {
        const monad = webdriverMonad({}, (client: any) => client, { ...prototype })
        const commandWrapperMock = vi.fn().mockImplementation((name, fn) => fn)
        const client = monad(sessionId, commandWrapperMock)
        const fn = () => 'bar'

        client.overwriteCommand('someFunc', fn)
        expect(client.someFunc()).toBe('bar')
    })

    it('should throw if there is no command to be overwritten', () => {
        const monad = webdriverMonad({}, (client: any) => client, { ...prototype })
        const commandWrapperMock = vi.fn().mockImplementation((name, fn) => fn)
        const client = monad(sessionId, commandWrapperMock)
        const fn = () => 'bar'

        expect(() => client.overwriteCommand('someFunc2', fn))
            .toThrow('overwriteCommand: no command to be overwritten: someFunc2')
    })

    it('should add element commands to the __propertiesObject__ cache', () => {
        const monad = webdriverMonad({}, (client: any) => client, prototype)
        const client = monad(sessionId)

        const func = function (x: number, y: number) { return x + y }

        client.addCommand('myCustomElementCommand', func, true)
        expect(typeof client.__propertiesObject__.myCustomElementCommand).toBe('object')
        expect(client.__propertiesObject__.myCustomElementCommand.value).toBe(func)
    })

    it('should add element commands for override to the __propertiesObject__.__elementOverrides__ cache', () => {
        const monad = webdriverMonad({}, (client: any) => client, { ...prototype })
        const client = monad(sessionId)

        const func = function (x: number, y: number) { return x + y }

        client.overwriteCommand('someFunc', func, true)
        expect(client.__propertiesObject__.__elementOverrides__.value.someFunc(2, 3)).toBe(5)
    })

    it('should compose sequential element command overrides and propagate arguments and return values', async () => {
        const client = webdriverMonad({}, (browser: any) => browser, { ...prototype })(sessionId)
        const calls: string[] = []

        client.overwriteCommand('someFunc', async (originalCommand: Function, arg: number) => {
            calls.push(`first before: ${arg}`)
            const result = await originalCommand(arg * 2)
            calls.push('first after')
            return result + 1
        }, true)
        client.overwriteCommand('someFunc', async (originalCommand: Function, arg: number) => {
            calls.push(`second before: ${arg}`)
            const result = await originalCommand(arg + 1)
            calls.push('second after')
            return result * 3
        }, true)

        const element = createElement(client.__propertiesObject__.__elementOverrides__, async (arg: number) => {
            calls.push(`base: ${arg}`)
            return arg
        })

        await expect(element.someFunc(4)).resolves.toBe(33)
        expect(calls).toEqual(['second before: 4', 'first before: 5', 'base: 10', 'first after', 'second after'])
    })

    it.each([
        {
            name: 'plugin before guard',
            register: (client: any, plugin: Function, guard: Function) => {
                client.overwriteCommand('someFunc', plugin, true)
                client.overwriteCommand('someFunc', guard, true)
            },
            expected: ['guard start', 'plugin', 'base', 'guard wait']
        },
        {
            name: 'guard before plugin',
            register: (client: any, plugin: Function, guard: Function) => {
                client.overwriteCommand('someFunc', guard, true)
                client.overwriteCommand('someFunc', plugin, true)
            },
            expected: ['plugin', 'guard start', 'base', 'guard wait']
        }
    ])('should preserve a navigation guard with $name', async ({ register, expected }) => {
        const client = webdriverMonad({}, (browser: any) => browser, { ...prototype })(sessionId)
        const calls: string[] = []
        const plugin = async (originalCommand: Function) => {
            calls.push('plugin')
            return originalCommand()
        }
        const guard = async (originalCommand: Function) => {
            calls.push('guard start')
            const result = await originalCommand()
            calls.push('guard wait')
            return result
        }

        register(client, plugin, guard)
        const element = createElement(client.__propertiesObject__.__elementOverrides__, async () => calls.push('base'))

        await element.someFunc()
        expect(calls).toEqual(expected)
    })

    it('should propagate errors through sequential element command overrides', async () => {
        const client = webdriverMonad({}, (browser: any) => browser, { ...prototype })(sessionId)
        const calls: string[] = []
        const error = new Error('boom')

        client.overwriteCommand('someFunc', async (originalCommand: Function) => {
            try {
                return await originalCommand()
            } catch (err) {
                calls.push('first caught')
                throw err
            }
        }, true)
        client.overwriteCommand('someFunc', async (originalCommand: Function) => {
            try {
                return await originalCommand()
            } catch (err) {
                calls.push('second caught')
                throw err
            }
        }, true)

        const element = createElement(client.__propertiesObject__.__elementOverrides__, async () => {
            calls.push('base')
            throw error
        })

        await expect(element.someFunc()).rejects.toBe(error)
        expect(calls).toEqual(['base', 'first caught', 'second caught'])
    })

    it('should preserve explicit context rebinding through sequential element command overrides', () => {
        const client = webdriverMonad({}, (browser: any) => browser, { ...prototype })(sessionId)
        const reboundElement = { name: 'rebound element' }
        let firstContext: unknown
        let secondContext: unknown
        let baseContext: unknown

        client.overwriteCommand('someFunc', function (this: unknown, originalCommand: Function, arg: number) {
            firstContext = this
            return originalCommand(arg)
        }, true)
        client.overwriteCommand('someFunc', function (this: unknown, originalCommand: Function, arg: number) {
            secondContext = this
            return originalCommand.call(reboundElement, arg)
        }, true)

        const element = createElement(client.__propertiesObject__.__elementOverrides__, function (this: unknown, arg: number) {
            baseContext = this
            return arg
        })

        expect(element.someFunc(123)).toBe(123)
        expect(secondContext).toBe(element)
        expect(firstContext).toBe(reboundElement)
        expect(baseContext).toBe(reboundElement)
    })

    it('should compose three element command overrides in reverse registration order', () => {
        const client = webdriverMonad({}, (browser: any) => browser, { ...prototype })(sessionId)
        const calls: string[] = []

        for (const label of ['first', 'second', 'third']) {
            client.overwriteCommand('someFunc', (originalCommand: Function) => {
                calls.push(label)
                return originalCommand()
            }, true)
        }

        const element = createElement(client.__propertiesObject__.__elementOverrides__, () => calls.push('base'))

        element.someFunc()
        expect(calls).toEqual(['third', 'second', 'first', 'base'])
    })

    it('should add element commands to the __propertiesObject__ cache in multiremote', () => {
        const monad = webdriverMonad({}, (client: any) => client, prototype)
        const client = monad(sessionId)
        const instances = { foo: { __propertiesObject__: { myCustomElementCommand: { value: undefined } } } }

        const func = function (x: number, y: number) { return x + y }

        client.addCommand('myCustomElementCommand', func, true, undefined, instances)
        expect(typeof instances.foo.__propertiesObject__.myCustomElementCommand).toBe('object')
        expect(instances.foo.__propertiesObject__.myCustomElementCommand.value).toBe(func)
    })

    it('should compose element command overrides in multiremote', () => {
        const monad = webdriverMonad({}, (client: any) => client, { ...prototype })
        const client = monad(sessionId)
        const calls: string[] = []
        const instances = {
            foo: {
                __propertiesObject__: {
                    __elementOverrides__: {
                        value: {
                            someFunc: (originalCommand: Function, x: number, y: number) => {
                                calls.push('first')
                                return originalCommand(x * 2, y) + 1
                            }
                        }
                    }
                }
            }
        }

        const func = function (originalCommand: Function, x: number, y: number) {
            calls.push('second')
            return originalCommand(x, y * 3) * 2
        }

        client.overwriteCommand('someFunc', func, true, undefined, instances)
        const baseCommand = (x: number, y: number) => {
            calls.push('base')
            return x + y
        }
        const element = createElement(instances.foo.__propertiesObject__.__elementOverrides__, baseCommand)

        expect(element.someFunc(2, 3)).toBe(28)
        expect(calls).toEqual(['second', 'first', 'base'])
    })

    it('should invoke command wrappers once for each composed element override', () => {
        const calls: string[] = []
        const client = webdriverMonad({}, (browser: any) => browser, { ...prototype })(sessionId, (commandName: string, commandFn: Function) => {
            return function (this: unknown, ...args: unknown[]) {
                calls.push(`wrapper: ${commandName}`)
                return commandFn.apply(this, args)
            }
        })

        client.overwriteCommand('someFunc', (originalCommand: Function) => originalCommand(), true)
        client.overwriteCommand('someFunc', (originalCommand: Function) => originalCommand(), true)

        const element = createElement(client.__propertiesObject__.__elementOverrides__, () => calls.push('base'))

        element.someFunc()
        expect(calls).toEqual(['wrapper: someFunc', 'wrapper: someFunc', 'base'])
    })

    it('should keep composing sequential browser command overrides', () => {
        const client = webdriverMonad({}, (browser: any) => browser, { ...prototype })(sessionId, (commandName: string, commandFn: Function) => commandFn)
        const calls: string[] = []

        client.overwriteCommand('someFunc', (originalCommand: Function, arg: number) => {
            calls.push('first')
            return originalCommand(arg + 1)
        })
        client.overwriteCommand('someFunc', (originalCommand: Function, arg: number) => {
            calls.push('second')
            return originalCommand(arg + 1)
        })

        expect(client.someFunc(1)).toBe('result-3')
        expect(calls).toEqual(['second', 'first'])
    })

    it('allows to use custom command wrapper', () => {
        const monad = webdriverMonad({}, (client: any) => client, prototype)
        const client = monad(sessionId, (commandName: string, commandFn: Function) => {
            return (...args: any[]) => {
                return `${commandName}(${args.join(', ')}) = ${commandFn(...args)}`
            }
        })
        expect(client.someFunc(123)).toBe('someFunc(123) = result-123')
    })

    it('should allow empty prototype object', () => {
        const monad = webdriverMonad({}, (client: any) => client)
        const client = monad(sessionId)
        expect(client.commandList).toHaveLength(0)
    })

    it('should be ok without modifier', () => {
        const monad = webdriverMonad({})
        const client = monad(sessionId)
        expect(client.commandList).toHaveLength(0)
    })
})
