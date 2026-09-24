type CommandWrapper = (commandName: string, command: Function) => (...args: unknown[]) => unknown

type SessionManagerErrorState = {
    pendingError?: Error
    rejectActiveCommands: Set<(error: Error) => void>
}

const sessionManagerErrors = new WeakMap<object, SessionManagerErrorState>()

function getErrorState(browser: object): SessionManagerErrorState {
    let state = sessionManagerErrors.get(browser)
    if (!state) {
        state = { rejectActiveCommands: new Set() }
        sessionManagerErrors.set(browser, state)
    }

    return state
}

export function reportSessionManagerError(browser: object, error: unknown): void {
    const state = getErrorState(browser)
    const commandError = error instanceof Error ? error : new Error(String(error))

    if (!state.rejectActiveCommands.size) {
        state.pendingError = commandError
        return
    }

    for (const reject of state.rejectActiveCommands) {
        reject(commandError)
    }
}

/**
 * Session manager event listeners run outside of the command promise chain. Race their
 * background work with active commands so runners can attribute failures to the command
 * and test that were executing. Errors reported between commands fail the next command.
 */
async function runWithSessionManagerErrors<T>(browser: object, command: () => T | Promise<T>): Promise<T> {
    const state = getErrorState(browser)
    if (state.pendingError) {
        const error = state.pendingError
        state.pendingError = undefined
        throw error
    }

    let rejectCommand!: (error: Error) => void
    const sessionManagerError = new Promise<never>((_resolve, reject) => {
        rejectCommand = reject
    })
    state.rejectActiveCommands.add(rejectCommand)

    try {
        return await Promise.race([command(), sessionManagerError])
    } finally {
        state.rejectActiveCommands.delete(rejectCommand)
    }
}

export function wrapCommandWithSessionManagerErrors(wrapCommand: CommandWrapper): CommandWrapper {
    return (commandName, command) => wrapCommand(commandName, function (this: object, ...args: unknown[]) {
        return runWithSessionManagerErrors(this, () => command.apply(this, args))
    })
}
