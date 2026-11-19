import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const [recoveryCommit, distTag] = process.argv.slice(2)
const head = recoveryCommit ?? git('rev-parse', 'HEAD')
let runId
if (recoveryCommit !== undefined) {
    // This script and the package allowlist come from master, NOT from the input commit.
    assert.match(recoveryCommit, /^[0-9a-f]{40}$/)
    git('merge-base', '--is-ancestor', recoveryCommit, 'refs/remotes/origin/master')
    assert.ok(['latest', 'next'].includes(distTag))
    const subject = git('log', '-1', '--format=%s', head)
    const release = /^Publish to npm \((latest|next)\) from run ([1-9]\d*)$/.exec(subject)
    assert.equal(release?.[1], distTag, 'Wrong release or npm tag')
    runId = release[2]
} else {
    git('diff', '--exit-code', 'HEAD')
}

const { packages } = JSON.parse(readFileSync('lerna.json', 'utf8'))
for (const location of packages) {
    // Read data from the commit, without checking it out or installing its dependencies.
    const { name, version } = JSON.parse(git('show', `${head}:${location}/package.json`))
    assert.equal(name, `@testplane/${path.basename(location)}`)
    assert.match(version, /^\d+\.\d+\.\d+$/)
    const tag = `${name}@${version}`
    assert.equal(git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`), head, `Wrong release commit for ${tag}`)
}

if (runId) {
    console.log(runId)
}
