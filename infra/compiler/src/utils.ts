import { builtinModules } from 'node:module'
import type { PackageJson } from 'type-fest'

export function getExternal(pkg: PackageJson) {
    return [
        'virtual:*',
        ...builtinModules,
        ...builtinModules.map((mod) => `node:${mod}`),
        // Keep Node's private package imports shared across ESM and CommonJS bundles.
        ...Object.keys(pkg.imports || {}),
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.peerDependencies || {}),
        ...Object.keys(pkg.optionalDependencies || {}),
        './node.js'
    ]
}
