import assert from 'node:assert/strict'

export async function checkReleaseRun(actions, repo, sourceSha, artifactRun) {
    if (artifactRun) {
        // The run may have failed after pushing. Its immutable artifact, not a
        // new build from today's master, is what the recovery job will verify.
        const [{ data: run }, { data: workflow }] = await Promise.all([
            actions.getWorkflowRun({ ...repo, run_id: artifactRun }),
            actions.getWorkflow({ ...repo, workflow_id: 'publish.yml' })
        ])
        assert.ok(
            Number.isSafeInteger(workflow.id) && run.workflow_id === workflow.id && run.event === 'workflow_dispatch' &&
            run.head_branch === 'master' && run.head_sha === sourceSha,
            `Expected the original publish run for master@${sourceSha}, got ${artifactRun}`
        )
        return
    }

    // Do not filter by success: a running or failed latest attempt must not
    // fall back to an older green run or to a pull request's merge commit.
    const { data: { workflow_runs: [run] } } = await actions.listWorkflowRuns({
        ...repo, workflow_id: 'test.yml', event: 'push', branch: 'master', head_sha: sourceSha, per_page: 1
    })
    assert.ok(
        run?.status === 'completed' && run.conclusion === 'success' &&
        run.event === 'push' && run.head_branch === 'master' && run.head_sha === sourceSha,
        `Wait for a successful Test push run on master@${sourceSha} before releasing (found: ${run?.conclusion || run?.status || 'no run'})`
    )
}
