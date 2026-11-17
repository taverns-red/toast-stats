#!/usr/bin/env tsx
/**
 * CI Gate verdict (#2607 item 3).
 *
 * Normal run: reads `toJSON(needs)` from NEEDS_JSON and exits 1 unless every
 * job the diff requires succeeded. No network, no polling.
 *
 * No-op `edited` run (title/body only, GATE_NOOP=true): every needed job was
 * skipped, so `needs` proves nothing about the head. The gate reads the PR's
 * changed files, WAITS for the head's older ci.yml runs to complete (30 s
 * polls, fails if the head moves; #2881), then requires each expected job in
 * the newest older run to be `success` (scripts/lib/ciGateWait.ts). A failing
 * "still running" verdict would be the latest `CI Gate` on the head and pin it
 * red until a manual re-run, so it waits; the job's timeout bounds the wait.
 *
 * Env: NEEDS_JSON, GATE_NOOP, GITHUB_STEP_SUMMARY (optional); for a no-op:
 * GITHUB_TOKEN, GITHUB_REPOSITORY, GATE_PR_NUMBER, GATE_HEAD_SHA,
 * GITHUB_RUN_ID.
 */
import { appendFileSync } from 'node:fs'
import { CI_CHECKS, DOCS_CHECK } from './lib/ciGate'
import {
  ACTIONS_APP_SLUG,
  classifyChanges,
  evaluateNeeds,
  type HeadCheckRun,
  type NeedResult,
  type NeedsVerdict,
} from './lib/ciGateNeeds'
import {
  HttpError,
  jobsCacheKey,
  retryUntilOk,
  runBelongsToPr,
  waitForGate,
  type GateRun,
  type GateState,
  type RunRef,
} from './lib/ciGateWait'

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
    // A 403 is a rate limit (retry) or a permission failure (fail at once).
    const rateLimited =
      res.status === 403 &&
      (res.headers.get('x-ratelimit-remaining') === '0' ||
        res.headers.has('retry-after') ||
        /rate limit/i.test(await res.text().catch(() => '')))
    throw new HttpError(`GET ${path} -> ${res.status}`, res.status, rateLimited)
  }
}

async function paged<T>(
  path: string,
  pick: (body: never) => T[]
): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?'
    const body = await getJson<never>(`${path}${sep}per_page=100&page=${page}`)
    const items = pick(body)
    out.push(...items)
    if (items.length < 100) return out
  }
}

async function verifyHead(): Promise<NeedsVerdict> {
  const repo = requireEnv('GITHUB_REPOSITORY')
  const sleep = (ms: number): Promise<void> =>
    new Promise(r => setTimeout(r, ms))
  // Same retry as the poll loop: a network blip here must not fail the gate.
  const files = await retryUntilOk(
    () =>
      paged<{ filename: string }>(
        `/repos/${repo}/pulls/${requireEnv('GATE_PR_NUMBER')}/files`,
        b => b as { filename: string }[]
      ),
    { sleep, onRetry: m => console.error(m) }
  )
  const { code, docs } = classifyChanges(files.map(f => f.filename))
  const expected = [...(code ? CI_CHECKS : []), ...(docs ? [DOCS_CHECK] : [])]
  const pr = requireEnv('GATE_PR_NUMBER')
  const headSha = requireEnv('GATE_HEAD_SHA')
  const selfRunId = Number(requireEnv('GITHUB_RUN_ID'))
  // A completed attempt's jobs never change, but a re-run keeps the run id and
  // bumps run_attempt, so the cache key carries both.
  const jobsOf = new Map<string, HeadCheckRun[]>()
  const prNumber = Number(pr)

  const fetchState = async (): Promise<GateState> => {
    const live = await getJson<{ head: { sha: string } }>(
      `/repos/${repo}/pulls/${pr}`
    )
    const { workflow_runs } = await getJson<{
      workflow_runs: (RunRef & { status: string })[]
    }>(
      `/repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${headSha}&event=pull_request&per_page=100`
    )
    const runs: GateRun[] = []
    for (const r of workflow_runs) {
      if (r.id >= selfRunId) continue // never wait on this run or newer ones
      // The query is by SHA, so another PR on the same commit can match.
      if (!runBelongsToPr(r, prNumber)) continue
      const key = jobsCacheKey(r)
      if (r.status === 'completed' && !jobsOf.has(key)) {
        const { jobs } = await getJson<{ jobs: HeadCheckRun[] }>(
          `/repos/${repo}/actions/runs/${r.id}/jobs?filter=latest&per_page=100`
        )
        // The run-jobs endpoint lists only this workflow's own jobs, which
        // GitHub Actions reports; it carries no app, so stamp the slug.
        jobsOf.set(
          key,
          jobs.map(j => ({ ...j, app: { slug: ACTIONS_APP_SLUG } }))
        )
      }
      runs.push({ id: r.id, status: r.status, jobs: jobsOf.get(key) ?? [] })
    }
    return { headSha: live.head.sha, runs }
  }

  console.error(
    `no-op edit: waiting for earlier ci.yml runs, then checking ${expected.join(', ')}`
  )
  return waitForGate({
    fetchState,
    expected,
    headSha,
    selfRunId,
    sleep,
    onWait: reasons => console.error(`waiting: ${reasons.join('; ')}`),
  })
}

async function main(): Promise<void> {
  const raw = requireEnv('NEEDS_JSON')
  const needs = JSON.parse(raw) as Record<string, NeedResult>
  const noop = process.env.GATE_NOOP === 'true'
  const verdict = noop ? await verifyHead() : evaluateNeeds(needs, { noop })

  const summary = [
    `## CI Gate: ${verdict.pass ? 'pass' : 'FAIL'}${noop ? ' (no-op edit, head re-verified)' : ''}`,
    '',
    '| Job | Result |',
    '|-----|--------|',
    ...Object.entries(needs).map(([k, v]) => `| \`${k}\` | ${v.result} |`),
    ...verdict.reasons.map(r => `\n- ${r}`),
  ].join('\n')
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n')

  if (!verdict.pass) {
    console.error(`CI Gate failed: ${verdict.reasons.join('; ')}`)
    process.exit(1)
  }
  console.error('CI Gate passed')
}

main().catch(err => {
  console.error(`CI Gate errored: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
