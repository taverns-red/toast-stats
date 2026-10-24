/**
 * Workflow contract: daily runs on scripts/pipeline/process-dates.sh
 * (#1765, ADR-015 step 7, decision P1).
 *
 * Daily used to run its own inline scrape, FAC, compute, validate and
 * upload steps, so it had no upload guard (D-20), derived its date twice
 * (D-23, the two could straddle midnight UTC) and installed Playwright for
 * an HTTP-only collector (D-24). Every stage added to daily alone recreated
 * the FAC class of defect. The per-stage behaviour is tested by running the
 * runner itself (processDates.test.ts, "process-dates.sh daily"); this
 * guard pins the wiring, sourced from the YAML.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  uses?: string
  env?: Record<string, string>
}

const workflow = parse(
  fs.readFileSync(
    path.resolve(process.cwd(), '.github/workflows/data-pipeline.yml'),
    'utf-8'
  )
) as {
  jobs: Record<string, { outputs?: Record<string, string>; steps?: Step[] }>
}
const pipeline = workflow.jobs['pipeline']!
const steps = pipeline.steps ?? []
const daily = steps.filter(s => (s.name ?? '').startsWith('[daily]'))
const text = (s: Step) => JSON.stringify(s)

/** Shell text with comment lines dropped, so prose never satisfies a guard. */
const code = (s: Step) =>
  (s.run ?? '')
    .split('\n')
    .filter(l => !/^\s*#/.test(l))
    .join('\n')

const RUNNER = 'scripts/pipeline/process-dates.sh "${GCS_BUCKET}" daily'

describe('daily runs on process-dates.sh (#1765)', () => {
  it('has daily steps', () => {
    expect(daily.length).toBeGreaterThan(0)
  })

  it('no daily step runs an inline per-date stage', () => {
    const inline = daily.filter(s =>
      /collector-cli\s+(scrape|compute-analytics|merge-find-a-club|fetch-find-a-club|transform)\b|daily-fac-merge\.sh|validate-snapshots\.ts/.test(
        code(s)
      )
    )
    expect(inline.map(s => s.name)).toEqual([])
  })

  it('exactly one daily step calls the runner, in daily mode', () => {
    const calls = daily.filter(s => code(s).includes(RUNNER))
    expect(calls.map(s => s.name)).toHaveLength(1)
    expect(calls[0]!.id).toBe('daily-process')
  })

  it('no daily step uploads a snapshot itself: every snapshot goes through the runner, after its upload guard (D-20)', () => {
    const uploads = daily.filter(
      s =>
        /gs:\/\/\$\{GCS_BUCKET\}\/snapshots\//.test(code(s)) &&
        !code(s).includes(RUNNER)
    )
    expect(uploads.map(s => s.name)).toEqual([])
  })

  it('hands the runner the one date, the resolved districts and force', () => {
    const step = daily.find(s => s.id === 'daily-process')!
    expect(step.env?.TARGET_DATE).toBe('${{ steps.daily-config.outputs.date }}')
    expect(step.env?.DISTRICTS).toBe(
      '${{ steps.daily-config.outputs.districts }}'
    )
    expect(step.env?.FORCE).toBe('${{ inputs.force }}')
    expect(code(step)).toContain(`${RUNNER} "\${TARGET_DATE}"`)
  })

  it('fails the run unless the date published: a refused or failed date publishes no store and places no report', () => {
    const run = code(daily.find(s => s.id === 'daily-process')!)
    const gate = run.indexOf('if [ "${SUCCEEDED}" != "1" ]; then')
    const push = run.indexOf('bash scripts/pipeline/publish-stores.sh')
    expect(gate, 'no succeeded gate').toBeGreaterThan(0)
    expect(push).toBeGreaterThan(gate)
    expect(run.slice(gate, push)).toMatch(/::error::[\s\S]*exit 1/)
  })

  it('exposes the raw and snapshot date from the runner step', () => {
    expect(pipeline.outputs?.raw_date).toBe(
      '${{ steps.daily-process.outputs.date }}'
    )
    expect(pipeline.outputs?.snapshot_date).toBe(
      '${{ steps.daily-process.outputs.snapshot_date }}'
    )
    const index = steps.find(s => s.name === 'Update district-snapshot-index')
    expect(code(index!)).toContain(
      'DATE="${{ steps.daily-process.outputs.snapshot_date }}"'
    )
  })

  it('no step reads an output of the removed inline steps', () => {
    const job = JSON.stringify(workflow.jobs)
    expect(job).not.toMatch(
      /steps\.daily-(scrape|fac-fetch|fac-persist|fac-merge)\./
    )
  })
})

describe('the daily date is derived exactly once (D-23)', () => {
  it('one `1 day ago` in the pipeline job, in daily-config', () => {
    const derivers = steps.filter(s => /1 day ago/.test(code(s)))
    expect(derivers.map(s => s.id)).toEqual(['daily-config'])
    expect(code(derivers[0]!).match(/1 day ago/g)).toHaveLength(1)
  })

  it('inputs.date is read only by daily-config; everything else takes its output', () => {
    const readers = steps.filter(s => /inputs\.date(?![\w-])/.test(text(s)))
    expect(readers.map(s => s.id)).toEqual(['daily-config'])
  })
})

describe('no Playwright in the pipeline job (D-24)', () => {
  it('installs no browser: the collector is HTTP-only', () => {
    expect(steps.filter(s => /playwright/i.test(text(s)))).toEqual([])
  })
})
