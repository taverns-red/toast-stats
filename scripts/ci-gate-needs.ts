#!/usr/bin/env tsx
/**
 * CI Gate verdict (#2607 item 3).
 *
 * Normal run: reads `toJSON(needs)` from NEEDS_JSON and exits 1 unless every
 * job the diff requires succeeded. No network, no polling.
 *
 * No-op `edited` run (title/body only, GATE_NOOP=true): every needed job was
 * skipped, so `needs` proves nothing about the head. The gate reads the PR's
 * changed files and the head SHA's check runs ONCE and requires each expected
 * job's latest non-skipped run to be `success` (scripts/lib/ciGateNeeds.ts).
 * It does not wait: an in-flight run fails and the real run's own `CI Gate`
 * reports later.
 *
 * Env: NEEDS_JSON, GATE_NOOP, GITHUB_STEP_SUMMARY (optional); for a no-op:
 * GITHUB_TOKEN, GITHUB_REPOSITORY, GATE_PR_NUMBER, GATE_HEAD_SHA.
 */
import { appendFileSync } from 'node:fs'
import { CI_CHECKS, DOCS_CHECK } from './lib/ciGate'
import {
  classifyChanges,
  evaluateHeadChecks,
  evaluateNeeds,
  type HeadCheckRun,
  type NeedResult,
  type NeedsVerdict,
} from './lib/ciGateNeeds'

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
  const files = await paged<{ filename: string }>(
    `/repos/${repo}/pulls/${requireEnv('GATE_PR_NUMBER')}/files`,
    b => b as { filename: string }[]
  )
  const { code, docs } = classifyChanges(files.map(f => f.filename))
  const expected = [...(code ? CI_CHECKS : []), ...(docs ? [DOCS_CHECK] : [])]
  const runs = await paged<HeadCheckRun>(
    `/repos/${repo}/commits/${requireEnv('GATE_HEAD_SHA')}/check-runs?filter=all`,
    b => (b as { check_runs: HeadCheckRun[] }).check_runs
  )
  console.error(`no-op edit: re-verifying ${expected.join(', ')} on the head`)
  return evaluateHeadChecks(expected, runs)
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
