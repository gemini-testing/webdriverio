import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// A publication must start from a clean checkout.
execFileSync('git', ['diff', '--exit-code', 'HEAD'], { stdio: 'inherit' })

const revision = ref => execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { encoding: 'utf8' }).trim()
const head = revision('HEAD')
const { packages } = JSON.parse(readFileSync('lerna.json', 'utf8'))
for (const location of packages) {
    const { name, version } = JSON.parse(readFileSync(path.join(location, 'package.json'), 'utf8'))
    assert.ok(name.startsWith('@testplane/'), `Unexpected release package: ${name}`)
    const tag = `${name}@${version}`
    assert.equal(revision(`refs/tags/${tag}`), head, `Check out the original release commit for ${tag}`)
}
