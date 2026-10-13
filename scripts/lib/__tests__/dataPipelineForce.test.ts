/**
 * `force` has one meaning in every mode (#1771, ADR-015 P7): re-fetch and
 * re-derive even if cached.
 *
 * It used to act on the daily scrape only; rebuild, rescrape and
 * rescrape-historical were always forced inside the per-date runner without
 * the input ever reaching it, so "what does force do in mode X" had no
 * answer in the file. The contract, sourced from the workflow YAML, gives
 * every dispatch mode an explicit case (R17):
 *  - daily: the scrape re-fetches when `force` is true, otherwise reuses the
 *    raw-csv/<date>/ pre-synced from staging;
 *  - rebuild, rescrape, rescrape-historical: the input is passed through to
 *    scripts/pipeline/process-dates.sh as FORCE; those modes are
 *    re-derivations, so the runner forces them always (processDates.test.ts);
 *  - backfill-education-ledger: passed through as --force;
 *  - backfill-global-totals: always rebuilds from the production archive; it
 *    reads no staging cache, so there is nothing for force to bypass;
 *  - prune: no fetch, no derive; force does not apply.
 * And no `if:` compares the boolean input to a string (Lesson 161).
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)
const FLOW_DOC = path.resolve(process.cwd(), 'docs/data-pipeline-flow.md')

interface Step {
  name?: string
  if?: string
  run?: string
  env?: Record<string, string>
}

interface Input {
  type?: string
  default?: unknown
  description?: string
  options?: string[]
}

const workflow = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as {
  on: { workflow_dispatch: { inputs: Record<string, Input> } }
  jobs: Record<string, { if?: string; steps?: Step[] }>
}
const allSteps = Object.values(workflow.jobs).flatMap(j => j.steps ?? [])
const pipelineSteps = workflow.jobs.pipeline.steps ?? []
const FORCE_EXPR = '${{ inputs.force }}'

function stepMode(step: Step): string | undefined {
  return /^steps\.mode\.outputs\.mode == '([a-z-]+)'$/.exec(
    (step.if ?? '').trim()
  )?.[1]
}

function modeSteps(mode: string): Step[] {
  return pipelineSteps.filter(s => stepMode(s) === mode)
}

function mentionsForce(step: Step): boolean {
  return JSON.stringify(step).includes('inputs.force')
}

const CASES: Record<string, () => void> = {
  daily: () => {
    const scrape = modeSteps('daily').find(
      s => s.name === '[daily] Scrape & Transform'
    )
    expect(scrape?.run).toMatch(/npx collector-cli scrape \$ARGS/)
    expect(scrape?.run).toContain(
      `if [ "${FORCE_EXPR}" = "true" ]; then\n  ARGS="$ARGS --force"\nfi`
    )
  },
  rebuild: () => expectRunnerGetsForce('rebuild'),
  rescrape: () => expectRunnerGetsForce('rescrape'),
  'rescrape-historical': () => expectRunnerGetsForce('rescrape-historical'),
  'backfill-education-ledger': () => {
    const ledger = (workflow.jobs['education-ledger-history'].steps ?? []).find(
      s => (s.run ?? '').includes('backfill-education-ledger-history')
    )
    expect(ledger?.env?.FORCE_INPUT).toBe(FORCE_EXPR)
    expect(ledger?.run).toContain(
      'if [ "${FORCE_INPUT}" = "true" ]; then ARGS+=(--force); fi'
    )
  },
  'backfill-global-totals': () => {
    const steps = modeSteps('backfill-global-totals')
    expect(steps).toHaveLength(1)
    const run = steps[0].run ?? ''
    // Always forced: the only reads are the production archive, and the
    // staging rollup is written, never read back to skip a date.
    expect(steps.some(mentionsForce)).toBe(false)
    expect(run).not.toMatch(
      /gs:\/\/\$\{GCS_BUCKET\}\/[^"]*"\s+"?\$\{SNAPSHOT_DIR/
    )
    expect(run).not.toMatch(/gcloud storage (ls|cat)[^\n]*\$\{GCS_BUCKET\}\//)
  },
  prune: () => {
    expect(modeSteps('prune').length).toBeGreaterThan(0)
    expect(modeSteps('prune').some(mentionsForce)).toBe(false)
  },
}

/** The mode's per-date step hands `force` to the runner as FORCE. */
function expectRunnerGetsForce(mode: string): void {
  const loop = modeSteps(mode).filter(s =>
    (s.run ?? '').includes(
      `scripts/pipeline/process-dates.sh "\${GCS_BUCKET}" ${mode} `
    )
  )
  expect(loop, `${mode}: one process-dates.sh step`).toHaveLength(1)
  expect(loop[0].env?.FORCE).toBe(FORCE_EXPR)
}

describe('data-pipeline.yml: force has one meaning (#1771, ADR-015 P7)', () => {
  const force = workflow.on.workflow_dispatch.inputs.force

  it('declares force as a boolean dispatch input defaulting to false', () => {
    expect(force.type).toBe('boolean')
    expect(force.default).toBe(false)
  })

  it('describes the one meaning in the input itself', () => {
    expect(force.description).toMatch(/re-fetch and re-derive even if cached/i)
  })

  it('has a case for every dispatch mode', () => {
    expect(Object.keys(CASES).sort()).toEqual(
      [...(workflow.on.workflow_dispatch.inputs.mode.options ?? [])].sort()
    )
  })

  for (const [mode, check] of Object.entries(CASES)) {
    it(mode, check)
  }

  it('reads force only where a case above says so', () => {
    const readers = allSteps.filter(mentionsForce).map(s => s.name)
    expect(readers.sort()).toEqual(
      [
        '[daily] Scrape & Transform',
        '[rebuild] Stream rebuild — one date at a time',
        '[rescrape] Re-collect and process dates',
        '[rescrape-historical] Rebuild, guard and publish one date at a time',
        '[ledger] Fetch, parse and upload one program year at a time',
      ].sort()
    )
  })

  it('never compares the boolean input in an if: (Lesson 161)', () => {
    const ifs = allSteps.map(s => s.if ?? '')
    for (const job of Object.values(workflow.jobs)) ifs.push(job.if ?? '')
    expect(ifs.filter(c => c.includes('inputs.force'))).toEqual([])
  })

  it('documents the per-mode meaning in docs/data-pipeline-flow.md', () => {
    const doc = fs.readFileSync(FLOW_DOC, 'utf-8')
    expect(doc).toMatch(/re-fetch and re-derive even if cached/i)
    for (const mode of Object.keys(CASES)) {
      expect(doc).toMatch(new RegExp(`\\| \`${mode}\` \\|[^\\n]*force`, 'i'))
    }
  })
})
