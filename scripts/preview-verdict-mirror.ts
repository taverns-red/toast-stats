#!/usr/bin/env tsx
/**
 * `PR Preview verdict` on an unrelated label event (#2865, review F1): mirror
 * the newest real verdict on this head instead of posting a skipped one that
 * would count as passing. Decision logic: scripts/lib/previewVerdictMirror.ts.
 *
 * Reads the head's other pr-preview.yml runs and their jobs once, no waiting.
 * R4: logs go to stderr.
 *
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY, GATE_HEAD_SHA, GITHUB_RUN_ID,
 * GITHUB_STEP_SUMMARY (optional).
 */
import { appendFileSync } from 'node:fs'
import {
  mirrorVerdict,
  VERDICT_JOB_NAME,
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
  const sha = requireEnv('GATE_HEAD_SHA')
  const self = requireEnv('GITHUB_RUN_ID')
  const { workflow_runs } = await getJson<{
    workflow_runs: { id: number }[]
  }>(
    `/repos/${repo}/actions/workflows/pr-preview.yml/runs?head_sha=${sha}&event=pull_request&per_page=100`
  )
  const others = workflow_runs.filter(r => String(r.id) !== self)
  const jobs: VerdictJob[] = []
  for (const run of others) {
    const { jobs: runJobs } = await getJson<{ jobs: VerdictJob[] }>(
      `/repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`
    )
    jobs.push(...runJobs.filter(j => j.name === VERDICT_JOB_NAME))
  }
  console.error(
    `${others.length} other run(s) on ${sha}, ${jobs.length} verdict job(s)`
  )
  const verdict = mirrorVerdict(jobs)
  const text = verdict.pass
    ? `Unrelated label event: mirrored the latest real ${VERDICT_JOB_NAME} on this head (success).`
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
