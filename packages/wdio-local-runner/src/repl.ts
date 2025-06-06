import type vm from 'node:vm'

import type { ReplConfig, ReplCallback } from '@testplane/wdio-repl'
import WDIORepl from '@testplane/wdio-repl'
import type { ChildProcess } from 'node:child_process'

export default class WDIORunnerRepl extends WDIORepl {
    childProcess: ChildProcess
    callback?: ReplCallback
    commandIsRunning = false

    constructor (childProcess: ChildProcess, options: ReplConfig) {
        super(options)
        this.childProcess = childProcess
    }

    private _getError (params: Record<string, string>) {
        if (!params.error) {
            return null
        }

        const err = new Error(params.message)
        err.stack = params.stack
        return err
    }

    eval (cmd: string, context: vm.Context, filename: string, callback: ReplCallback) {
        if (this.commandIsRunning) {
            return
        }

        this.commandIsRunning = true
        this.childProcess.send({
            origin: 'debugger',
            name: 'eval',
            content: { cmd }
        })

        this.callback = callback
    }

    onResult (params: Record<string, string>) {
        const error = this._getError(params)

        if (this.callback) {
            this.callback(error, params.result)
        }

        this.commandIsRunning = false
    }

    start (context?: vm.Context) {
        this.childProcess.send({
            origin: 'debugger',
            name: 'start'
        })

        return super.start(context)
    }
}
