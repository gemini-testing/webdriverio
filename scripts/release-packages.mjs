import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const root = fileURLToPath(new URL('../', import.meta.url))
const registry = 'https://registry.npmjs.org'
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))

export function candidates(bump) {
    if (bump) {
        assert.ok(['patch', 'minor'].includes(bump), 'Unsupported version bump')
    }
    // lerna.json is the single allowlist, in dependency-first publication order.
    return readJson(path.join(root, 'lerna.json')).packages.map(location => {
        const cwd = path.join(root, location)
        const { name, version } = readJson(path.join(cwd, 'package.json'))
        assert.equal(name, `@testplane/${path.basename(location)}`)
        assert.ok(semver.valid(version), `Invalid version for ${name}`)
        return { cwd, name, version: bump ? semver.inc(version, bump) : version }
    })
}

export function pack(directory) {
    mkdirSync(directory, { recursive: true })
    assert.equal(readdirSync(directory).length, 0, 'Pack into an empty directory')
    for (const { cwd } of candidates()) {
        execFileSync('pnpm', ['pack', '--pack-destination', directory], { cwd, stdio: 'inherit' })
    }
}

export function artifacts(directory) {
    const packages = candidates()
    assert.equal(readdirSync(directory).length, packages.length, 'Expected one tarball per release package')
    return packages.map(({ name, version }, index) => {
        const filename = path.join(directory, `${name.slice(1).replace('/', '-')}-${version}.tgz`)
        const manifest = JSON.parse(execFileSync('tar', ['-xOzf', filename, 'package/package.json'], { encoding: 'utf8' }))
        assert.equal(manifest.name, name)
        assert.equal(manifest.version, version)
        for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
            for (const [dep, spec] of Object.entries(manifest[field] || {})) {
                assert.doesNotMatch(spec, /^(workspace|file|link):/, `${name}: non-registry ${field} spec for ${dep}`)
                const depIndex = packages.findIndex(pkg => pkg.name === dep)
                if (field !== 'devDependencies' && depIndex !== -1) {
                    assert.ok(depIndex < index, `Order ${dep} before ${name} in lerna.json`)
                    const released = packages[depIndex].version
                    if (field === 'peerDependencies') {
                        assert.equal(spec, `^${released}`, `${name} must use the compatible release line of ${dep}`)
                    } else {
                        assert.equal(spec, released, `${name} must depend on the exact release of ${dep}`)
                    }
                }
            }
        }
        const integrity = 'sha512-' + createHash('sha512').update(readFileSync(filename)).digest('base64')
        return { name, version, filename, manifest, integrity }
    })
}

export function selectForPublication({ name, version, integrity }, metadata, mode, tag) {
    assert.ok(['fresh', 'from-package'].includes(mode))
    assert.ok(['latest', 'next'].includes(tag))
    const current = metadata['dist-tags'][tag]
    assert.ok(!current || !semver.gt(current, version), `${name}: ${tag} already points to newer ${current}`)
    if (!Object.hasOwn(metadata.versions, version)) {
        return true
    }
    assert.equal(mode, 'from-package', `${name}@${version} already published; refusing a fresh release`)
    assert.ok(integrity && metadata.versions[version].dist?.integrity === integrity, `${name}@${version}: registry integrity mismatch`)
    assert.equal(current, version, `${name}@${version}: unexpected dist-tag ${tag}=${current}`)
    console.log(`Already published and verified: ${name}@${version}`)
    return false
}

async function registryPlan(packages, mode, tag) {
    // Check the entire batch before doing ANY write. Errors, including registry/network
    // errors, are not evidence that a version is available.
    const plan = await Promise.all(packages.map(async pkg => {
        const response = await fetch(`${registry}/${encodeURIComponent(pkg.name)}`, {
            headers: { Accept: 'application/vnd.npm.install-v1+json' }, signal: AbortSignal.timeout(30_000)
        })
        assert.ok(response.ok, `Cannot verify ${pkg.name}: registry returned ${response.status}`)
        const metadata = await response.json()
        assert.equal(metadata.name, pkg.name)
        return selectForPublication(pkg, metadata, mode, tag)
    }))
    return packages.filter((_, index) => plan[index])
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [command, ...args] = process.argv.slice(2)
    if (command === 'pack') {
        pack(path.resolve(args[0]))
    } else if (command === 'preflight') {
        const [bump, tag] = args
        const available = await registryPlan(candidates(bump), 'fresh', tag)
        console.log('Available:', available.map(pkg => `${pkg.name}@${pkg.version}`).join(', '))
    } else {
        const [directory, releaseType, tag] = args
        assert.ok(['check', 'publish'].includes(command), 'Expected preflight, pack, check or publish')
        assert.ok(['patch', 'minor', 'from-package'].includes(releaseType))
        const pending = await registryPlan(artifacts(path.resolve(directory)), releaseType === 'from-package' ? 'from-package' : 'fresh', tag)
        if (command === 'publish') {
            for (const { filename } of pending) {
                execFileSync('npm', ['publish', filename, '--ignore-scripts', '--access', 'public', '--tag', tag, '--registry', registry], { stdio: 'inherit' })
            }
        }
    }
}
