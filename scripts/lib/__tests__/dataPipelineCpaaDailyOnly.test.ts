/**
 * Workflow guard: Closing-Pinned Auto-Allow is for DAILY runs only (#1673).
 *
 * CPAA (#1086/#1092, epic #1083) exists so the routine daily month-end
 * reconciliation promotes without a manual override. Its detector only checks
 * the date shape (month-end, later as-of within 31 days), so a deliberate
 * `mode=rebuild` of a past year-end close carries the same signature. Run
 * 37535062136 (rebuild of 2019-06-30 + 2022-06-30) promoted to prod with
 * allow_value_changes=false because of it.
 *
 * The value-diff step must therefore disable CPAA for every mode except
 * `daily` (an allowlist, so a new mode fails closed). Sourced from the
 * workflow YAML so the glue cannot silently drift back.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)
const CLI_PATH = path.resolve(
  process.cwd(),
  'packages/collector-cli/src/cli.ts'
)

interface Step {
  name?: string
  id?: string
  env?: Record<string, string>
  run?: string
}

function valueDiffStep(): Step {
  const doc = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as {
    jobs: Record<string, { steps?: Step[] }>
  }
  const step = Object.values(doc.jobs)
    .flatMap(job => job.steps ?? [])
    .find(s => s.id === 'valuediff')
  if (!step?.run) throw new Error('value-diff step (id: valuediff) not found')
  return step
}

describe('data-pipeline value gate — CPAA is daily-only (#1673)', () => {
  const step = valueDiffStep()
  const run = step.run!

  it('reads the resolved pipeline mode (not the raw dispatch input)', () => {
    // steps.mode.outputs.mode maps schedule → daily/prune; inputs.mode is
    // empty on a schedule and would misclassify the daily cron.
    expect(step.env?.PIPELINE_MODE).toBe('${{ steps.mode.outputs.mode }}')
  })

  it('disables CPAA for every mode other than daily (allowlist, fail closed)', () => {
    expect(run).toMatch(
      /if \[ "\$\{PIPELINE_MODE:-\}" != "daily" \]; then\s+CPAA_FLAG="--no-closing-auto-allow"/
    )
  })

  it('passes the CPAA flag to the value-diff invocation', () => {
    const invoke = run.slice(run.indexOf('npx collector-cli value-diff'))
    const end = invoke.indexOf('> /tmp/value-diff.json')
    expect(invoke.slice(0, end)).toContain('${CPAA_FLAG}')
  })

  it('the collector-cli value-diff command declares the flag', () => {
    const cli = fs.readFileSync(CLI_PATH, 'utf-8')
    expect(cli).toContain("'--no-closing-auto-allow'")
  })
})
