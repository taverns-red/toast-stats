#!/usr/bin/env tsx
/**
 * `PR Preview verdict` on an unrelated label event (#2865): wait for the
 * older pr-preview.yml runs on this head to finish, then mirror the newest
 * one's verdict. A skipped verdict would count as passing and clear an earlier
 * failure, and a failing "still running" verdict would pin the check red
 * (GitHub resolves a required check by the latest run in the newest check
 * suite), so this waits instead. The decision and the wait loop are in
 * scripts/lib/previewVerdictMirror.ts; the job's timeout bounds the wait.
 *
 * R4: logs go to stderr.
 *
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY, GATE_PR_NUMBER, GATE_HEAD_SHA,
 * GITHUB_RUN_ID, GITHUB_STEP_SUMMARY (optional).
 */
import { appendFileSync } from 'node:fs'
import {
  VERDICT_JOB_NAME,
  waitForMirror,
  type MirrorState,
  type RunInfo,
  type VerdictJob,
} from './lib/previewVerdictMirror'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`${name} is not set`)
    process.exit(1)
  }
  return v
}

async function getJson<T>(path: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: {
        authorization: `Bearer ${requireEnv('GITHUB_TOKEN')}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      },
    })
    if (res.ok) return (await res.json()) as T
    if (res.status >= 500 && attempt < 3) {
      await new Promise(r => setTimeout(r, 2000 * attempt))
      continue
    }
    throw new Error(`GET ${path} -> ${res.status}`)
  }
}

async function main(): Promise<void> {
  const repo = requireEnv('GITHUB_REPOSITORY')
  const pr = requireEnv('GATE_PR_NUMBER')
  const headSha = requireEnv('GATE_HEAD_SHA')
  const selfRunId = Number(requireEnv('GITHUB_RUN_ID'))
  // A completed run's verdict jobs never change: read them once.
  const jobsOf = new Map<number, VerdictJob[]>()

  const fetchState = async (): Promise<MirrorState> => {
    const live = await getJson<{ head: { sha: string } }>(
      `/repos/${repo}/pulls/${pr}`
    )
    const { workflow_runs } = await getJson<{
      workflow_runs: { id: number; status: string }[]
    }>(
      `/repos/${repo}/actions/workflows/pr-preview.yml/runs?head_sha=${headSha}&event=pull_request&per_page=100`
    )
    const runs: RunInfo[] = []
    for (const r of workflow_runs) {
      if (r.id >= selfRunId) continue // never wait on this run or newer ones
      if (r.status === 'completed' && !jobsOf.has(r.id)) {
        const { jobs } = await getJson<{ jobs: VerdictJob[] }>(
          `/repos/${repo}/actions/runs/${r.id}/jobs?filter=latest&per_page=100`
        )
        jobsOf.set(
          r.id,
          jobs.filter(j => j.name === VERDICT_JOB_NAME)
        )
      }
      runs.push({
        id: r.id,
        status: r.status,
        verdictJobs: jobsOf.get(r.id) ?? [],
      })
    }
    return { headSha: live.head.sha, runs }
  }

  const verdict = await waitForMirror({
    fetchState,
    headSha,
    selfRunId,
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    onWait: reasons => console.error(`waiting: ${reasons.join('; ')}`),
  })
  const text = verdict.pass
    ? `Unrelated label event: mirrored the newest real ${VERDICT_JOB_NAME} older than this run (success).`
    : `Unrelated label event: ${verdict.reasons.join('; ')}`
  console.log(text)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n')
  if (!verdict.pass) process.exit(1)
}

main().catch(err => {
  console.error(
    `verdict mirror errored: ${err instanceof Error ? err.message : err}`
  )
  process.exit(1)
})
