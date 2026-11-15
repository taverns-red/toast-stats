#!/usr/bin/env tsx
/**
 * CI Gate verdict (#2607 item 3): reads `toJSON(needs)` from NEEDS_JSON and
 * exits 1 unless every job the diff requires succeeded. No network, no
 * polling. Logic: scripts/lib/ciGateNeeds.ts.
 *
 * Env: NEEDS_JSON, GATE_NOOP ('true' for a title/body-only edit),
 * GITHUB_STEP_SUMMARY (optional).
 */
import { appendFileSync } from 'node:fs'
import { evaluateNeeds, type NeedResult } from './lib/ciGateNeeds'

const raw = process.env.NEEDS_JSON
if (!raw) {
  console.error('NEEDS_JSON is not set')
  process.exit(1)
}
const needs = JSON.parse(raw) as Record<string, NeedResult>
const verdict = evaluateNeeds(needs, { noop: process.env.GATE_NOOP === 'true' })

const summary = [
  `## CI Gate: ${verdict.pass ? 'pass' : 'FAIL'}`,
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
