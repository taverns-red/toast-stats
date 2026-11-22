/**
 * Workflow contract: prod `v1/latest.json` moves only after the report
 * sidecars of the new date are in prod (#3183).
 *
 * Before: the pipeline job's promote copied latest.json with the date, and
 * `promote-reports` promoted `district_*_reports.json` about 22 minutes
 * later, so Growth funnels read "Not available yet" in between.
 *
 * After: the pipeline job withholds latest.json when it promotes a date
 * (`--defer-latest`); promote-reports moves it as its last step, only when
 * the sidecar completeness check passed (`--latest-pointer`).
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import {
  findProdWriteSteps,
  topLevelConjuncts,
  type Workflow,
} from '../prodWriteGuard.js'

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  env?: Record<string, string>
  'continue-on-error'?: boolean
}

const workflow = parse(
  fs.readFileSync(
    path.join(process.cwd(), '.github/workflows/data-pipeline.yml'),
    'utf-8'
  )
) as Workflow & {
  jobs: Record<string, { steps?: Step[]; outputs?: Record<string, string> }>
}

const steps = (job: string) => (workflow.jobs[job]?.steps ?? []) as Step[]
const step = (job: string, name: string) =>
  steps(job).find(s => s.name === name)
const index = (job: string, name: string) =>
  steps(job).findIndex(s => s.name === name)

const CHECK =
  '[reports] Completeness gate: promoted dates have their reports (#2144)'
const MOVE = '[reports] Move v1/latest.json after the sidecars (#3183)'

describe('the pipeline job withholds latest.json when it promotes a date (#3183)', () => {
  it.each([
    'Plan scoped promotion (#1763)',
    'Promote run manifest to production (#1763)',
  ])('%s passes --defer-latest', name => {
    expect(step('pipeline', name)?.run).toContain('--defer-latest')
  })

  it('the prune reconcile does not defer: it promotes no date', () => {
    expect(
      step('pipeline', '[prune] Promote prod reconciliation (#1767)')?.run
    ).not.toContain('--defer-latest')
  })
})

describe('promote-reports moves latest.json last (#3183)', () => {
  const move = step('promote-reports', MOVE)

  it('exists, after the sidecar promote and the completeness check', () => {
    expect(move, MOVE).toBeDefined()
    expect(index('promote-reports', MOVE)).toBeGreaterThan(
      index('promote-reports', CHECK)
    )
    expect(index('promote-reports', CHECK)).toBeGreaterThan(
      index('promote-reports', '[reports] Promote the report sidecars (#1767)')
    )
  })

  it('goes through the manifest promoter with the sidecar verdict', () => {
    expect(move?.run).toBe(
      'npx tsx scripts/promote-run-manifest.ts --execute --latest-pointer'
    )
    expect(move?.env?.RUN_MANIFEST_FILE).toBe('${{ env.RUN_MANIFEST_FILE }}')
    expect(move?.env?.COMPLETENESS_GATE_FILE).toBe(
      '${{ env.REPORT_SIDECAR_VERDICT_FILE }}'
    )
  })

  it('runs only when the completeness check passed and the run promoted a date', () => {
    expect(step('promote-reports', CHECK)?.id).toBe('completeness')
    const c = topLevelConjuncts(move?.if ?? '')
    expect(c).toContain("steps.completeness.outcome == 'success'")
    expect(c).toContain("needs.pipeline.outputs.promoted_dates != ''")
  })

  it('moves only when the main promote also promoted the globals', () => {
    expect(workflow.jobs.pipeline?.outputs?.globals_promoted).toBe(
      '${{ steps.promotemanifest.outputs.globals_promoted }}'
    )
    const c = topLevelConjuncts(move?.if ?? '')
    expect(c).toContain("needs.pipeline.outputs.globals_promoted == 'true'")
  })

  it('tells the promoter which dates this run promoted', () => {
    expect(move?.env?.PROMOTED_DATES).toBe(
      '${{ needs.pipeline.outputs.promoted_dates }}'
    )
  })

  it('a failure fails the job, so the existing alert path fires', () => {
    expect(move?.['continue-on-error']).not.toBe(true)
  })

  it('is a guarded prod write', () => {
    const found = findProdWriteSteps(workflow).find(
      s => s.job === 'promote-reports' && s.step === MOVE
    )
    expect(found?.guarded).toBe(true)
  })
})
