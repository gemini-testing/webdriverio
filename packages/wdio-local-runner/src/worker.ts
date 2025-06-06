import url from 'node:url'
import path from 'node:path'
import child from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import type { WritableStreamBuffer } from 'stream-buffers'
import type { Options, Workers } from '@testplane/wdio-types'
import type { ReplConfig } from '@testplane/wdio-repl'

import logger from '@testplane/wdio-logger'

import runnerTransformStream from './transformStream.js'
import ReplQueue from './replQueue.js'
import RunnerStream from './stdStream.js'

const log = logger('@wdio/local-runner')
const replQueue = new ReplQueue()
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const ACCEPTABLE_BUSY_COMMANDS = ['workerRequest', 'endSession']

const stdOutStream = new RunnerStream()
const stdErrStream = new RunnerStream()
stdOutStream.pipe(process.stdout)
stdErrStream.pipe(process.stderr)

/**
 * WorkerInstance
 * responsible for spawning a sub process to run the framework in and handle its
 * session lifetime.
 */
export default class WorkerInstance extends EventEmitter implements Workers.Worker {
    cid: string
    config: Options.Testrunner
    configFile: string
    // requestedCapabilities
    caps: WebdriverIO.Capabilities
    // actual capabilities returned by driver
    capabilities: WebdriverIO.Capabilities
    specs: string[]
    execArgv: string[]
    retries: number
    stdout: WritableStreamBuffer
    stderr: WritableStreamBuffer
    childProcess?: ChildProcess
    sessionId?: string
    server?: Record<string, string>
    logsAggregator: string[] = []

    instances?: Record<string, { sessionId: string }>
    isMultiremote?: boolean

    isBusy = false
    isKilled = false
    isReady: Promise<boolean>
    isSetup: Promise<boolean>
    isReadyResolver: (value: boolean | PromiseLike<boolean>) => void = () => {}
    isSetupResolver: (value: boolean | PromiseLike<boolean>) => void = () => {}

    /**
     * assigns paramters to scope of instance
     * @param  {object}   config      parsed configuration object
     * @param  {string}   cid         capability id (e.g. 0-1)
     * @param  {string}   configFile  path to config file (for sub process to parse)
     * @param  {object}   caps        capability object
     * @param  {string[]} specs       list of paths to test files to run in this worker
     * @param  {number}   retries     number of retries remaining
     * @param  {object}   execArgv    execution arguments for the test run
     */
    constructor(
        config: Options.Testrunner,
        { cid, configFile, caps, specs, execArgv, retries }: Workers.WorkerRunPayload,
        stdout: WritableStreamBuffer,
        stderr: WritableStreamBuffer
    ) {
        super()
        this.cid = cid
        this.config = config
        this.configFile = configFile
        this.caps = caps
        this.capabilities = caps
        this.specs = specs
        this.execArgv = execArgv
        this.retries = retries
        this.stdout = stdout
        this.stderr = stderr

        this.isReady = new Promise((resolve) => { this.isReadyResolver = resolve })
        this.isSetup = new Promise((resolve) => { this.isSetupResolver = resolve })
    }

    /**
     * spawns process to kick of wdio-runner
     */
    startProcess() {
        const { cid, execArgv } = this
        const argv = process.argv.slice(2)

        const runnerEnv = Object.assign({
            NODE_OPTIONS: '--enable-source-maps',
        }, process.env, this.config.runnerEnv, {
            WDIO_WORKER_ID: cid,
            NODE_ENV: process.env.NODE_ENV || 'test'
        })

        if (this.config.outputDir) {
            runnerEnv.WDIO_LOG_PATH = path.join(this.config.outputDir, `wdio-${cid}.log`)
        }

        /**
         * propagate node flags to child process, e.g. `--import tsx`
         */
        runnerEnv.NODE_OPTIONS = process.env.NODE_OPTIONS + ' ' + (runnerEnv.NODE_OPTIONS || '')

        log.info(`Start worker ${cid} with arg: ${argv.join(' ')}`)
        const childProcess = this.childProcess = child.fork(path.join(__dirname, 'run.js'), argv, {
            cwd: process.cwd(),
            env: runnerEnv,
            execArgv,
            stdio: ['inherit', 'pipe', 'pipe', 'ipc']
        })

        childProcess.on('message', this._handleMessage.bind(this))
        childProcess.on('error', this._handleError.bind(this))
        childProcess.on('exit', this._handleExit.bind(this))

        /* istanbul ignore if */
        if (!process.env.WDIO_UNIT_TESTS) {
            if (childProcess.stdout !== null) {
                if (this.config.groupLogsByTestSpec) {
                    // Test spec logs are collected only from child stdout stream
                    // and then printed when the worker exits
                    // As a result, there is no pipe to parent stdout stream here
                    runnerTransformStream(cid, childProcess.stdout, this.logsAggregator)
                } else {
                    runnerTransformStream(cid, childProcess.stdout).pipe(stdOutStream)
                }
            }

            if (childProcess.stderr !== null) {
                runnerTransformStream(cid, childProcess.stderr).pipe(stdErrStream)
            }
        }

        return childProcess
    }

    private _handleMessage (payload: Workers.WorkerMessage) {
        const { cid, childProcess } = this

        /**
         * resolve pending commands
         */
        if (payload.name === 'finishedCommand') {
            this.isBusy = false
        }

        /**
         * mark worker process as ready to receive events
         */
        if (payload.name === 'ready') {
            this.isReadyResolver(true)
        }

        /**
         * store sessionId and connection data to worker instance
         */
        if (payload.name === 'sessionStarted') {
            this.isSetupResolver(true)
            if (payload.content.isMultiremote) {
                Object.assign(this, payload.content)
            } else {
                this.sessionId = payload.content.sessionId
                this.capabilities = payload.content.capabilities
                Object.assign(this.config, payload.content)
            }
        }

        /**
         * handle debug command called within worker process
         */
        if (childProcess && payload.origin === 'debugger' && payload.name === 'start') {
            replQueue.add(
                childProcess,
                { prompt: `[${cid}] \u203A `, ...payload.params } as ReplConfig,
                () => this.emit('message', Object.assign(payload, { cid })),
                (ev: unknown) => this.emit('message', ev)
            )
            return replQueue.next()
        }

        /**
         * handle debugger results
         */
        if (replQueue.isRunning && payload.origin === 'debugger' && payload.name === 'result') {
            replQueue.runningRepl?.onResult(payload.params)
        }

        this.emit('message', Object.assign(payload, { cid }))
    }

    private _handleError (payload: Error) {
        const { cid } = this
        this.emit('error', Object.assign(payload, { cid }))
    }

    private _handleExit (exitCode: number) {
        const { cid, childProcess, specs, retries } = this

        /**
         * delete process of worker
         */
        delete this.childProcess
        this.isBusy = false
        this.isKilled = true

        log.debug(`Runner ${cid} finished with exit code ${exitCode}`)
        this.emit('exit', { cid, exitCode, specs, retries })

        if (childProcess) {
            childProcess.kill('SIGTERM')
        }
    }

    /**
     * sends message to sub process to execute functions in wdio-runner
     * @param  command  method to run in wdio-runner
     * @param  args     arguments for functions to call
     */
    postMessage (command: string, args: Workers.WorkerMessageArgs, requiresSetup = false): void {
        const { cid, configFile, capabilities, specs, retries, isBusy } = this

        if (isBusy && !ACCEPTABLE_BUSY_COMMANDS.includes(command)) {
            return log.info(`worker with cid ${cid} already busy and can't take new commands`)
        }

        /**
         * start up process if worker hasn't done yet or if child process
         * closes after running its job
         */
        if (!this.childProcess) {
            this.childProcess = this.startProcess()
        }

        const cmd: Workers.WorkerCommand = { cid, command, configFile, args, caps: capabilities, specs, retries }
        log.debug(`Send command ${command} to worker with cid "${cid}"`)
        this.isReady.then(async () => {
            if (requiresSetup) {
                await this.isSetup
            }

            this.childProcess!.send(cmd)
        })
        this.isBusy = true
    }
}
