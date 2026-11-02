#!/usr/bin/env node

import fsp from 'node:fs/promises'
import url from 'node:url'
import path from 'node:path'

import unzipper from 'unzipper'
import { Octokit } from '@octokit/rest'

const MAIN_BRANCH = 'main'

export default async function downloadSpec (page = 1) {
    const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
    const targetDir = path.join(__dirname, 'cddl')

    /**
     * check if `GITHUB_AUTH` environment variable is set to interact with GitHub API
     */
    if (!process.env.GITHUB_AUTH) {
        throw new Error('Please export a "GITHUB_AUTH" access token to access GitHub.')
    }

    const owner = 'w3c'
    const repo = 'webdriver-bidi'
    const api = new Octokit({ auth: process.env.GITHUB_AUTH })
    const artifacts = await api.rest.actions.listArtifactsForRepo({
        owner,
        repo,
        page,
        per_page: 100
    }).catch((error) => {
        console.log(`Failed to download spec file: ${error.message}`)
    })

    if (!artifacts || artifacts.data.artifacts.length === 0) {
        return false
    }

    // eslint-disable-next-line camelcase
    const cddlBuilds = artifacts.data.artifacts.filter(({ name, expired, workflow_run }) => (
        name === 'cddl' && !expired &&
        // eslint-disable-next-line camelcase
        workflow_run && workflow_run.head_branch === MAIN_BRANCH
    ))

    if (page > 10) {
        return false
    }

    if (cddlBuilds.length === 0) {
        return downloadSpec(page + 1)
    }

    console.log(`Downloading CDDL artifact ${cddlBuilds[0].id} from ${cddlBuilds[0].workflow_run?.head_sha}`)
    const { data } = await api.rest.actions.downloadArtifact({
        owner,
        repo,
        artifact_id: cddlBuilds[0].id,
        archive_format: 'zip',
    }) as { data: Uint8Array }

    const archive = await unzipper.Open.buffer(Buffer.from(data))
    await fsp.mkdir(targetDir, { recursive: true })
    for (const filename of ['local.cddl', 'remote.cddl']) {
        const file = archive.files.find(entry => entry.type === 'File' && entry.path === filename)
        if (!file) {
            throw new Error(`Missing ${filename} in CDDL artifact ${cddlBuilds[0].id}`)
        }
        await fsp.writeFile(path.join(targetDir, filename), await file.buffer())
    }
    return true
}
