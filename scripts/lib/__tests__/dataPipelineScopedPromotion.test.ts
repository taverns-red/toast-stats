/**
 * Workflow contract: scoped promotion (#1763, ADR-015 P6, migration step 5).
 *
 * PR 2 of 2 retired the whole-prefix rsync. Every mode that promotes copies
 * only the run manifest's objects, for the dates the gates passed:
 *
 * - there is no `promotion_scope` input and no `Promote staging to
 *   production` step any more; scripts/promote-run-manifest.ts --execute is
 *   the one promotion writer (the prune reconcile runs it too, #1767), and
 *   no step rsyncs into prod;
 * - every non-prune run prints the scoped plan (`--dry-run`) after the
 *   gates, skip_promotion runs included. The plan step writes nothing;
 * - the scoped promote needs the count, value and content gates to pass and
 *   the completeness gate to have produced a verdict; it applies that
 *   verdict per date itself, so a held date no longer holds the others;
 * - a scoped promotion that copied less than it planned (a held date, held
 *   globals) is a hold, and the promotion-held alert says so.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import {
  findProdWriteSteps,
  prodRsyncSteps,
  PROD_RSYNC_EXEMPT,
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

describe('topLevelConjuncts handles nested groups (#1763)', () => {
  it('sees a top-level clause after a nested ((a && b) || (c)) group', () => {
    const expr = `((a == 'x' && b == 'y') || (c != '' && c != '0')) && ${SKIP_CLAUSE_SAME_JOB}`
    expect(topLevelConjuncts(expr)).toContain(SKIP_CLAUSE_SAME_JOB)
    expect(
      topLevelConjuncts(`((a) && ${SKIP_CLAUSE_SAME_JOB}) || b`)
    ).not.toContain(SKIP_CLAUSE_SAME_JOB)
  })
})

describe('the whole-prefix promotion is retired (#1763 PR 2)', () => {
  it('has no promotion_scope input: there is one way to promote', () => {
    expect(workflow.on.workflow_dispatch.inputs.promotion_scope).toBeUndefined()
    expect(byId('mode')?.run ?? '').not.toContain('promotion_scope')
  })

  it('has no whole-prefix promote step', () => {
    expect(byId('promote')).toBeUndefined()
    expect(
      steps.find(s => s.name === 'Promote staging to production')
    ).toBeUndefined()
  })

  // The #1755 guard, extended: no `gcloud storage rsync` into prod survives
  // in any workflow. The prune reconcile was the last exemption (#1767).
  it('no workflow rsyncs into production', () => {
    const dir = path.resolve(process.cwd(), '.github/workflows')
    const found = fs
      .readdirSync(dir)
      .filter(f => /\.ya?ml$/.test(f))
      .flatMap(f =>
        prodRsyncSteps(
          parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as Workflow
        ).map(s => `${f} / ${s.job} / ${s.step}`)
      )
    expect(found).toEqual([])
  })

  it('has no rsync exemption left (#1767 retired the last)', () => {
    expect(PROD_RSYNC_EXEMPT).toEqual({})
  })

  it('the detector sees an rsync into prod (it is not blind)', () => {
    const wf: Workflow = {
      jobs: {
        j: {
          steps: [
            {
              name: 'sneaky',
              run: 'gcloud storage rsync -r "gs://${GCS_BUCKET}/v1/" "gs://${GCS_BUCKET_PRODUCTION}/v1/"',
            },
            {
              name: 'download',
              run: 'gcloud storage rsync -r "gs://${GCS_BUCKET_PRODUCTION}/v1/" ./v1/',
            },
          ],
        },
      },
    }
    expect(prodRsyncSteps(wf).map(s => s.step)).toEqual(['sneaky'])
  })
})

describe('data-pipeline scoped promotion steps (#1763)', () => {
  const planIdx = indexOf(s => s.id === 'promoteplan')
  const plan = steps[planIdx]
  const execIdx = indexOf(s => s.id === 'promotemanifest')
  const exec = steps[execIdx]

  it('prints the plan after every gate, before the skip/promote steps, writing nothing', () => {
    expect(plan?.run).toMatch(/scripts\/promote-run-manifest\.ts --dry-run/)
    expect(plan?.run).not.toContain('--execute')
    expect(plan?.if).toBe(
      "steps.mode.outputs.mode != 'prune' || steps.mode.outputs.prune_reconcile == 'true'"
    )
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

  it('executes in every promoting run, after the run-level gates pass', () => {
    expect(exec?.run).toMatch(/scripts\/promote-run-manifest\.ts --execute/)
    const c = conj(exec)
    for (const clause of [
      "steps.diff.outputs.promote == 'true'",
      "steps.valuediff.outputs.value_promote == 'true'",
      "steps.contentgate.outputs.content_promote == 'true'",
      "steps.completenessgate.outputs.completeness_promote != ''",
      "steps.mode.outputs.mode != 'prune'",
      SKIP_CLAUSE_SAME_JOB,
    ]) {
      expect(c, clause).toContain(clause)
    }
    // The per-date verdict is applied inside the promoter, not as a run hold.
    expect(exec?.if).not.toContain("completeness_promote == 'true'")
    expect(exec?.if).not.toContain('promotion_scope')
    expect(exec?.env?.COMPLETENESS_GATE_FILE).toBe(
      byId('completenessgate')?.env?.COMPLETENESS_GATE_FILE
    )
    expect(execIdx).toBeGreaterThan(planIdx)
  })

  it('no other step runs the promoter with --execute', () => {
    const executing = steps.filter(s =>
      /promote-run-manifest\.ts[^\n]*--execute/.test(s.run ?? '')
    )
    // The prune reconcile runs the same promoter (#1767): one prod writer.
    expect(executing.map(s => s.id)).toEqual([
      'promotemanifest',
      'prunepromote',
    ])
  })

  it('the skip_promotion contract covers it', () => {
    const found = findProdWriteSteps(workflow).find(s => s.step === exec?.name)
    expect(found?.guarded).toBe(true)
  })

  it('reports promoted only when the run promoted everything it planned', () => {
    expect(workflow.jobs.pipeline.outputs?.promoted).toBe(
      "${{ steps.promotemanifest.outputs.complete == 'true' }}"
    )
  })

  it('exposes the promoted dates, for the reports placement', () => {
    expect(workflow.jobs.pipeline.outputs?.promoted_dates).toBe(
      '${{ steps.promotemanifest.outputs.promoted_dates }}'
    )
  })

  it('purges the CDN after a scoped promotion that copied or removed anything (#2232), and only then', () => {
    const purge = steps.find(
      s => s.name === 'Invalidate CDN cache after promotion (#1294)'
    )
    const c = conj(purge)
    for (const clause of [
      "steps.mode.outputs.mode != 'prune'",
      SKIP_CLAUSE_SAME_JOB,
    ]) {
      expect(c, clause).toContain(clause)
    }
    const cond = (purge?.if ?? '').replace(/\s+/g, ' ')
    for (const clause of [
      "steps.promotemanifest.outputs.objects_copied != ''",
      "steps.promotemanifest.outputs.objects_copied != '0'",
      "steps.promotemanifest.outputs.objects_removed != ''",
      "steps.promotemanifest.outputs.objects_removed != '0'",
    ]) {
      expect(cond, clause).toContain(clause)
    }
  })

  it('feeds the scoped outcome to the promotion-held alert', () => {
    const env = byId('promoalert')?.env ?? {}
    expect(env.SCOPED_COMPLETE).toBe(
      '${{ steps.promotemanifest.outputs.complete }}'
    )
    expect(env.SCOPED_HELD_DATES).toBe(
      '${{ steps.promotemanifest.outputs.held_dates }}'
    )
    expect(env.SCOPED_GLOBALS_REASON).toBe(
      '${{ steps.promotemanifest.outputs.globals_reason }}'
    )
    expect(indexOf(s => s.id === 'promoalert')).toBeGreaterThan(
      indexOf(s => s.id === 'promotemanifest')
    )
  })

  it('the skip_promotion summary points at the printed plan', () => {
    expect(byId('skippromotion')?.run).toContain(
      'steps.promoteplan.outputs.objects_planned'
    )
  })
})
