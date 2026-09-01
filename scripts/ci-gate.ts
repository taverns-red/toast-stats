#!/usr/bin/env tsx
/**
 * CI Gate runner (#1216) — the I/O half of the aggregator.
 *
 * All decision logic lives in `scripts/lib/ciGate.ts` (pure, unit-tested).
 * This file only does the two things that need the network:
 *
 *   1. Read the PR's changed files  → `GET /repos/{repo}/pulls/{n}/files`
 *   2. Read the head SHA's checks    → `GET /repos/{repo}/commits/{sha}/check-runs`
 *
 * …then polls (2) until the verdict is terminal or the deadline expires. A
 * still-incomplete verdict at the deadline FAILS — an expected check that
 * never showed up is the failure mode this gate exists to catch (PR #1484).
 *
 * R4: every log line goes to stderr. Stdout stays free for the final verdict
 * JSON, so a caller can `| jq` it.
 *
 * Env (all supplied by the workflow):
 *   GITHUB_TOKEN       — repo-scoped token with `checks: read`, `pull-requests: read`
 *   GITHUB_REPOSITORY  — "owner/repo"
 *   GATE_PR_NUMBER     — the PR being gated
 *   GATE_HEAD_SHA      — the PR head SHA the check runs attach to
 *   GATE_DEADLINE_MINUTES — optional, default 40
 *   GATE_POLL_SECONDS     — optional, default 20
 *   GITHUB_STEP_SUMMARY   — optional, appended to when present
 */

import { appendFileSync } from 'node:fs'
import {
  GATE_CHECK,
  describeVerdict,
  evaluateChecks,
  expectedChecks,
  isDeadlineFailure,
  type GateVerdict,
  type ObservedCheck,
} from './lib/ciGate'

const API = 'https://api.github.com'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`❌ ${name} is not set`)
    process.exit(1)
  }
  return v
}

const token = requireEnv('GITHUB_TOKEN')
const repo = requireEnv('GITHUB_REPOSITORY')
const prNumber = requireEnv('GATE_PR_NUMBER')
const headSha = requireEnv('GATE_HEAD_SHA')
const deadlineMs = Number(process.env.GATE_DEADLINE_MINUTES ?? 40) * 60_000
const pollMs = Number(process.env.GATE_POLL_SECONDS ?? 20) * 1000

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  })
  if (!res.ok) {
    throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as T
}

/** Every changed file in the PR (paginated; GitHub caps the list at 3000). */
async function changedFiles(): Promise<string[]> {
  const files: string[] = []
  for (let page = 1; ; page++) {
    const batch = await api<{ filename: string }[]>(
      `/repos/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`
    )
    files.push(...batch.map(f => f.filename))
    if (batch.length < 100) return files
  }
}

/**
 * The check runs on the head SHA. `filter=latest` is the default and is what
 * we want: on a re-run, only the newest result per check name is returned, so
 * a stale red from an earlier attempt cannot pin the gate.
 */
async function observedChecks(): Promise<ObservedCheck[]> {
  const runs: ObservedCheck[] = []
  for (let page = 1; ; page++) {
    const body = await api<{
      total_count: number
      check_runs: ObservedCheck[]
    }>(
      `/repos/${repo}/commits/${headSha}/check-runs?per_page=100&filter=latest&page=${page}`
    )
    runs.push(
      ...body.check_runs.map(c => ({
        name: c.name,
        status: c.status,
        conclusion: c.conclusion,
      }))
    )
    if (body.check_runs.length < 100) return runs
  }
}

function summarise(
  expected: string[],
  verdict: GateVerdict,
  passed: boolean
): void {
  const path = process.env.GITHUB_STEP_SUMMARY
  if (!path) return
  const rows = [
    `## ${GATE_CHECK}: ${passed ? '✅ pass' : '❌ fail'}`,
    '',
    `Head SHA \`${headSha}\` · expected checks derived from the PR diff.`,
    '',
    '| Check | Required because | Result |',
    '|-------|------------------|--------|',
  ]
  for (const name of expected) {
    let result = '✅ success'
    if (verdict.missing.includes(name)) result = '❌ **never scheduled**'
    else if (verdict.pending.includes(name)) result = '⏳ still running'
    const failed = verdict.failed.find(f => f.name === name)
    if (failed) result = `❌ ${failed.conclusion}`
    rows.push(`| \`${name}\` | changed files require it | ${result} |`)
  }
  if (verdict.missing.length) {
    rows.push(
      '',
      '> A required check with **no check run at all** is a failure, not a pass.',
      '> The changed files say this workflow had to run and it never did — the',
      '> PR #1484 failure mode. Re-run the workflow, or fix its trigger.'
    )
  }
  appendFileSync(path, rows.join('\n') + '\n')
}

async function main(): Promise<void> {
  const files = await changedFiles()
  const expected = expectedChecks(files)
  console.error(
    `${files.length} changed file(s); expecting: ${expected.join(', ')}`
  )

  const startedAt = Date.now()
  let verdict = evaluateChecks(expected, [])

  for (;;) {
    verdict = evaluateChecks(expected, await observedChecks())
    const elapsedMs = Date.now() - startedAt
    const expired = elapsedMs >= deadlineMs
    console.error(
      `[${Math.round(elapsedMs / 1000)}s] ${describeVerdict(verdict)}`
    )

    if (verdict.state === 'pass') break
    if (isDeadlineFailure(verdict, expired)) break
    await new Promise(r => setTimeout(r, pollMs))
  }

  const passed = verdict.state === 'pass'
  summarise(expected, verdict, passed)
  console.log(JSON.stringify({ headSha, expected, verdict }, null, 2))

  if (!passed) {
    console.error(`❌ ${GATE_CHECK} failed: ${describeVerdict(verdict, true)}`)
    if (verdict.missing.length > 0) {
      console.error(
        'Expected checks were NEVER SCHEDULED. This is not "nothing to run" —' +
          " the PR's changed files require these workflows. Fail closed."
      )
    }
    process.exit(1)
  }
  console.error(`✅ ${GATE_CHECK} passed`)
}

main().catch(err => {
  console.error(
    `❌ ${GATE_CHECK} errored: ${err instanceof Error ? err.message : err}`
  )
  process.exit(1)
})
