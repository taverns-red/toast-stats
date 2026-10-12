/**
 * Workflow contract: scoped promotion (#1763, ADR-015 P6, migration step 5,
 * PR 1 of 2 — the mechanism).
 *
 * - `promotion_scope` picks the writer: `prefix` (the whole-prefix rsync,
 *   still the default and the only one a schedule uses until PR 2 deletes
 *   it) or `manifest` (scripts/promote-run-manifest.ts --execute).
 * - Every non-prune run prints the scoped plan (`--dry-run`) after the
 *   gates, skip_promotion runs included, so a proof run shows exactly what a
 *   scoped promote would copy. The plan step writes nothing.
 * - The scoped promote needs the count, value and content gates to pass and
 *   the completeness gate to have produced a verdict; it applies that
 *   verdict per date itself, so a held date no longer holds the others.
 * - The prod-write guard sees the promoter as a prod write, so the
 *   skip_promotion contract covers it.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import {
  findProdWriteSteps,
  prodWriteReasons,
  topLevelConjuncts,
  SKIP_CLAUSE_SAME_JOB,
  type Workflow,
} from '../prodWriteGuard.js'

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  env?: Record<string, string>
}

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)
const workflow = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as Workflow & {
  on: { workflow_dispatch: { inputs: Record<string, Record<string, unknown>> } }
  jobs: Record<string, { steps?: Step[]; outputs?: Record<string, string> }>
}
const steps = (workflow.jobs.pipeline?.steps ?? []) as Step[]
const indexOf = (pred: (s: Step) => boolean) => steps.findIndex(pred)
const byId = (id: string) => steps.find(s => s.id === id)
const conj = (s: Step | undefined) => topLevelConjuncts(s?.if ?? '')

const MANIFEST_SCOPE = "steps.mode.outputs.promotion_scope == 'manifest'"
const PREFIX_SCOPE = "steps.mode.outputs.promotion_scope != 'manifest'"

describe('prodWriteGuard sees the manifest promoter (#1763)', () => {
  it('flags --execute as a production write and the dry run as not', () => {
    expect(
      prodWriteReasons('npx tsx scripts/promote-run-manifest.ts --execute')
    ).toEqual(['manifest promotion → production'])
    expect(
      prodWriteReasons('npx tsx scripts/promote-run-manifest.ts --dry-run')
    ).toEqual([])
  })
})

describe('data-pipeline promotion_scope input (#1763)', () => {
  it('is a choice of prefix|manifest, default prefix', () => {
    const input = workflow.on.workflow_dispatch.inputs.promotion_scope
    expect(input?.type).toBe('choice')
    expect(input?.options).toEqual(['prefix', 'manifest'])
    expect(input?.default).toBe('prefix')
  })

  it('is normalised once in the mode step; a schedule (no inputs) gets prefix', () => {
    const run = byId('mode')?.run ?? ''
    expect(run).toContain("${{ inputs.promotion_scope || 'prefix' }}")
    expect(run).toMatch(/promotion_scope=\$\{PROMOTION_SCOPE\}/)
  })
})

describe('data-pipeline scoped promotion steps (#1763)', () => {
  const planIdx = indexOf(s => s.id === 'promoteplan')
  const plan = steps[planIdx]
  const execIdx = indexOf(s => s.id === 'promotemanifest')
  const exec = steps[execIdx]
  const legacy = byId('promote')

  it('prints the plan after every gate, before the skip/promote steps, writing nothing', () => {
    expect(plan?.run).toMatch(/scripts\/promote-run-manifest\.ts --dry-run/)
    expect(plan?.run).not.toContain('--execute')
    expect(plan?.if).toBe("steps.mode.outputs.mode != 'prune'")
    for (const gate of [
      'diff',
      'valuediff',
      'contentgate',
      'completenessgate',
    ]) {
      expect(planIdx).toBeGreaterThan(indexOf(s => s.id === gate))
    }
    expect(planIdx).toBeLessThan(indexOf(s => s.id === 'skippromotion'))
    expect(prodWriteReasons(plan?.run ?? '')).toEqual([])
  })

  it('executes only under promotion_scope=manifest, after the run-level gates pass', () => {
    expect(exec?.run).toMatch(/scripts\/promote-run-manifest\.ts --execute/)
    const c = conj(exec)
    for (const clause of [
      "steps.diff.outputs.promote == 'true'",
      "steps.valuediff.outputs.value_promote == 'true'",
      "steps.contentgate.outputs.content_promote == 'true'",
      "steps.completenessgate.outputs.completeness_promote != ''",
      "steps.mode.outputs.mode != 'prune'",
      MANIFEST_SCOPE,
      SKIP_CLAUSE_SAME_JOB,
    ]) {
      expect(c, clause).toContain(clause)
    }
    // The per-date verdict is applied inside the promoter, not as a run hold.
    expect(exec?.if).not.toContain("completeness_promote == 'true'")
    expect(exec?.env?.COMPLETENESS_GATE_FILE).toBe(
      byId('completenessgate')?.env?.COMPLETENESS_GATE_FILE
    )
    expect(execIdx).toBeGreaterThan(planIdx)
  })

  it('keeps the whole-prefix rsync only for promotion_scope=prefix', () => {
    expect(conj(legacy)).toContain(PREFIX_SCOPE)
    expect(conj(legacy)).toContain(SKIP_CLAUSE_SAME_JOB)
  })

  it('no other step runs the promoter with --execute', () => {
    const executing = steps.filter(s =>
      /promote-run-manifest\.ts[^\n]*--execute/.test(s.run ?? '')
    )
    expect(executing.map(s => s.id)).toEqual(['promotemanifest'])
  })

  it('the skip_promotion contract covers it', () => {
    const found = findProdWriteSteps(workflow).find(s => s.step === exec?.name)
    expect(found?.guarded).toBe(true)
  })

  it('reports promoted only when the run promoted everything it planned', () => {
    expect(workflow.jobs.pipeline.outputs?.promoted).toBe(
      "${{ steps.promote.outcome == 'success' || steps.promotemanifest.outputs.complete == 'true' }}"
    )
  })

  it('purges the CDN after a scoped promotion that copied anything', () => {
    const purge = steps.find(
      s => s.name === 'Invalidate CDN cache after promotion (#1294)'
    )
    expect(purge?.if).toContain(
      "steps.promotemanifest.outputs.objects_copied != '0'"
    )
    expect(conj(purge)).toContain(SKIP_CLAUSE_SAME_JOB)
  })

  it('the skip_promotion summary points at the printed plan', () => {
    expect(byId('skippromotion')?.run).toContain(
      'steps.promoteplan.outputs.objects_planned'
    )
  })
})
