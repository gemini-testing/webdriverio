import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Launcher } from '../../packages/wdio-cli/build/index.js'

const configs = {
    testrunner: 'wdio.conf.ts',
    multiremote: 'wdio-multiremote.conf.ts',
    classic: 'wdio.classic.conf.ts'
}
const mode = process.argv[2] || 'testrunner'
assert.ok(Object.hasOwn(configs, mode), 'Expected testrunner, multiremote or classic')
const e2eDir = fileURLToPath(new URL('../../e2e/', import.meta.url))
const evidenceDir = await mkdtemp(path.join(os.tmpdir(), `wdio-cold-${mode}-`))
process.chdir(e2eDir)
console.log(`Cold-cache evidence: ${evidenceDir}`)
const launcher = new Launcher(path.join(e2eDir, 'wdio', configs[mode]), {
    cacheDir: path.join(evidenceDir, 'browser-cache'),
    outputDir: evidenceDir
})
const exitCode = await launcher.run()
assert.equal(exitCode, 0, `${mode} failed; logs and browser cache retained in ${evidenceDir}`)
console.log(`PASS: ${mode} with an initially empty cache; default worker parallelism preserved`)
// Like the CLI, exit after launcher shutdown: services may keep parent-process sockets open.
process.exit(0)
