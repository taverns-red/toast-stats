/**
 * Every shared manifest step carries the same mode exclusions (#1771,
 * ADR-015 P7, audit D-22).
 *
 * The shared steps run after every mode's own steps and regenerate the
 * manifests and indexes derived from the bucket's district snapshots
 * (v1/latest.json + v1/dates.json, v1/global-history.json,
 * config/district-snapshot-index.json, config/club-index.json,
 * config/divisions-areas-index.json). `backfill-global-totals` publishes no
 * district snapshot, so none of them has anything new to derive from it
 * (#1498); a dry-run prune deletes nothing, so none of them runs then either.
 *
 * Four of the five steps carried the backfill exclusion; `Generate
 * divisions-areas index` did not. Harmless in data (it rebuilt the same
 * latest-date index) but an R17 inconsistency: the condition was copied per
 * step, and the copies drifted. The contract, sourced from the workflow YAML:
 *  - every shared step has the SAME `if:`, character for character;
 *  - a step that carries either shared exclusion is one of the shared steps,
 *    so a new shared step cannot opt into half of them;
 *  - the common `if:` has an explicit, asserted outcome for every mode
 *    (R17), evaluated rather than pattern-matched.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)

interface Step {
  name?: string
  if?: string
}

const workflow = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as {
  on: { workflow_dispatch: { inputs: Record<string, { options?: string[] }> } }
  jobs: Record<string, { if?: string; steps?: Step[] }>
}
const pipelineSteps = workflow.jobs.pipeline.steps ?? []

const SHARED_STEPS = [
  'Generate CDN manifests',
  'Generate global-history manifest',
  'Update district-snapshot-index',
  'Generate club-index',
  'Generate divisions-areas index',
] as const

const BACKFILL_EXCLUSION = "steps.mode.outputs.mode != 'backfill-global-totals'"
const DRY_RUN_PRUNE_EXCLUSION =
  "steps.mode.outputs.mode != 'prune' || steps.mode.outputs.dry_run != 'true'"

/**
 * Evaluate a GitHub Actions `if:` over `steps.mode.outputs.*` string
 * outputs. Only the operators these conditions use (`==`, `!=`, `&&`, `||`,
 * parentheses, single-quoted strings) are accepted; anything else throws, so
 * a condition this cannot read fails the test instead of passing it.
 */
function evaluate(condition: string, outputs: Record<string, string>): boolean {
  const js = condition.replace(
    /steps\.mode\.outputs\.([a-z_]+)|'([^']*)'|==|!=|&&|\|\||[()]|\s+|(.)/g,
    (m, output: string, literal: string, other: string) => {
      if (other !== undefined) {
        throw new Error(`unsupported token '${other}' in: ${condition}`)
      }
      if (output !== undefined) return JSON.stringify(outputs[output] ?? '')
      if (literal !== undefined) return JSON.stringify(literal)
      if (m === '==') return '==='
      if (m === '!=') return '!=='
      return m
    }
  )
  return Boolean(new Function(`return (${js})`)())
}

function step(name: string): Step {
  const found = pipelineSteps.find(s => s.name === name)
  if (!found) throw new Error(`no pipeline step named '${name}'`)
  return found
}

describe('data-pipeline.yml: shared manifest steps share one exclusion list (#1771, D-22)', () => {
  it('finds every shared step (non-vacuous)', () => {
    for (const name of SHARED_STEPS) {
      expect(step(name).if, name).toBeTruthy()
    }
  })

  it('gives every shared step the same if:', () => {
    const conditions = SHARED_STEPS.map(name => ({
      name,
      if: (step(name).if ?? '').trim(),
    }))
    for (const c of conditions) {
      expect(c, c.name).toEqual({ name: c.name, if: conditions[0].if })
    }
  })

  it('lets no other step carry a shared exclusion', () => {
    const carriers = pipelineSteps
      .filter(
        s =>
          (s.if ?? '').includes(BACKFILL_EXCLUSION) ||
          (s.if ?? '').includes(DRY_RUN_PRUNE_EXCLUSION)
      )
      .map(s => s.name)
    expect(carriers).toEqual([...SHARED_STEPS])
  })

  describe('has an explicit outcome for every mode (R17)', () => {
    const condition = () => (step(SHARED_STEPS[0]).if ?? '').trim()
    const modes = workflow.on.workflow_dispatch.inputs.mode.options ?? []

    // The ledger backfill never reaches this job (its own job, #1802).
    const EXPECTED: Record<string, boolean | 'job-skipped'> = {
      daily: true,
      rebuild: true,
      rescrape: true,
      'rescrape-historical': true,
      prune: true,
      'backfill-global-totals': false,
      'backfill-education-ledger': 'job-skipped',
    }

    it('covers every dispatch mode', () => {
      expect(Object.keys(EXPECTED).sort()).toEqual([...modes].sort())
    })

    for (const [mode, expected] of Object.entries(EXPECTED)) {
      it(`${mode}: ${expected === 'job-skipped' ? 'pipeline job skipped' : expected ? 'runs' : 'skipped'}`, () => {
        if (expected === 'job-skipped') {
          expect(workflow.jobs.pipeline.if).toBe(`inputs.mode != '${mode}'`)
          return
        }
        expect(evaluate(condition(), { mode, dry_run: 'false' })).toBe(expected)
      })
    }

    it('prune with dry_run=true: skipped', () => {
      expect(evaluate(condition(), { mode: 'prune', dry_run: 'true' })).toBe(
        false
      )
    })
  })

  it('evaluator sentinel: reads the pre-#1771 divisions-areas condition as running in backfill', () => {
    // The condition the drifted step carried; the evaluator must see the gap.
    expect(
      evaluate(DRY_RUN_PRUNE_EXCLUSION, {
        mode: 'backfill-global-totals',
        dry_run: 'false',
      })
    ).toBe(true)
    expect(() => evaluate("inputs.force == 'true'", {})).toThrow()
  })
})
