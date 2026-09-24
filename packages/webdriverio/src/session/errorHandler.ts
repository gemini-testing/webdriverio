type CommandWrapper = (commandName: string, command: Function) => (...args: unknown[]) => unknown

type SessionManagerErrorState = {
    errors: Error[]
    pendingTasks: Set<Promise<void>>
}

const sessionManagerErrors = new WeakMap<object, SessionManagerErrorState>()

function getErrorState(browser: object): SessionManagerErrorState {
    let state = sessionManagerErrors.get(browser)
    if (!state) {
        state = { errors: [], pendingTasks: new Set() }
        sessionManagerErrors.set(browser, state)
    }

    return state
}

export function reportSessionManagerError(browser: object, error: unknown): void {
    const state = getErrorState(browser)
    state.errors.push(error instanceof Error ? error : new Error(String(error)))
}

/** Keep event-listener work observable until the runner finishes the current test. */
export function trackSessionManagerTask(browser: object, task: Promise<unknown>, onError?: (error: unknown) => void): void {
    const state = getErrorState(browser)
    const tracked = task.then(
        () => undefined,
        (error) => {
            reportSessionManagerError(browser, error)
            try {
                onError?.(error)
            } catch {
                // A logging callback must not introduce another unhandled rejection.
            }
        }
    )
    state.pendingTasks.add(tracked)
    void tracked.finally(() => state.pendingTasks.delete(tracked))
}

function getReportedError(errors: Error[]): Error | undefined {
    if (errors.length === 1) {
        return errors[0]
    }

    if (errors.length > 1) {
        return new AggregateError(errors, `Session manager errors: ${errors.map((error) => error.message).join('; ')}`)
    }
}

/** Wait for background listeners, then consume every error they reported. */
export async function flushSessionManagerErrors(browser: object): Promise<void> {
    const state = getErrorState(browser)
    while (state.pendingTasks.size) {
        await Promise.all(state.pendingTasks)
    }

    const error = getReportedError(state.errors.splice(0))
    if (error) {
        throw error
    }
}

/**
 * Session manager event listeners run outside of the command promise chain. A command
 * must settle before reporting their errors so that it cannot continue in the background.
 * Errors remain recorded until the runner checks them at the end of the test.
 */
async function runWithSessionManagerErrors<T>(browser: object, commandName: string, command: () => T | Promise<T>): Promise<T> {
    if (commandName === 'deleteSession') {
        return command()
    }

    const state = getErrorState(browser)
    const error = getReportedError(state.errors)
    if (error) {
        throw error
    }

    const result = await command()
    const reportedError = getReportedError(state.errors)
    if (reportedError) {
        throw reportedError
    }

    return result
}

export function wrapCommandWithSessionManagerErrors(wrapCommand: CommandWrapper): CommandWrapper {
    return (commandName, command) => wrapCommand(commandName, function (this: object, ...args: unknown[]) {
        return runWithSessionManagerErrors(this, commandName, () => command.apply(this, args))
    })
}
