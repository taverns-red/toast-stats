/**
 * Workflow contract: the per-date completeness gate (#1761, ADR-015 P5.2,
 * migration step 3) runs before `Promote staging to production`, holds it
 * (D8) through `completeness_promote`, honours allow_value_changes, feeds
 * the promotion-held issue flow, and still runs and reports under
 * skip_promotion. Sourced from the workflow YAML so the glue cannot drift
 * from the tested module.
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
  id?: string
  if?: string
  run?: string
  env?: Record<string, string>
  'continue-on-error'?: boolean
}

const workflow = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as {
  env?: Record<string, string>
  jobs: Record<string, { steps?: Step[] }>
}
const steps = workflow.jobs.pipeline?.steps ?? []

const indexOf = (pred: (s: Step) => boolean) => steps.findIndex(pred)
const byName = (name: string) => steps.find(s => s.name === name)

const OUTPUT = '${{ steps.completenessgate.outputs.completeness_promote }}'
const FAILS = "steps.completenessgate.outputs.completeness_promote == 'false'"

describe('data-pipeline per-date completeness gate (#1761)', () => {
  const gateIndex = indexOf(s => s.id === 'completenessgate')
  const gate = steps[gateIndex]

  it('has a gate step that runs the tested module', () => {
    expect(gate).toBeDefined()
    expect(gate?.run).toMatch(/scripts\/date-completeness-gate\.ts/)
  })

  it('runs in every mode that promotes, skip_promotion and a prune reconcile included (#1767)', () => {
    expect(gate?.if).toBe(
      "steps.mode.outputs.mode != 'prune' || steps.mode.outputs.prune_reconcile == 'true'"
    )
  })

  it('cannot be silently skipped by continue-on-error', () => {
    expect(gate?.['continue-on-error']).toBeUndefined()
  })

  it('reads its dates from the job-wide run manifest (#1762)', () => {
    // Every stage that uploads a snapshot date (daily, the per-date loop,
    // the backfill) records it there; dataPipelineRunManifest.test.ts pins
    // that no staging upload bypasses it.
    expect(workflow.env?.RUN_MANIFEST_FILE).toBeTruthy()
    expect(gate?.env?.RUN_MANIFEST_FILE).toBeUndefined()
  })

  it('honours allow_value_changes', () => {
    expect(gate?.env?.ALLOW_VALUE_CHANGES).toBe(
      '${{ inputs.allow_value_changes }}'
    )
  })

  it('runs before promotion', () => {
    const promoteIndex = indexOf(
      s => s.name === 'Promote run manifest to production (#1763)'
    )
    expect(gateIndex).toBeGreaterThanOrEqual(0)
    expect(promoteIndex).toBeGreaterThan(gateIndex)
    expect(indexOf(s => s.id === 'skippromotion')).toBeGreaterThan(gateIndex)
  })

  it('promotion applies its verdict per date; the CDN purge requires a copy', () => {
    // #1763: the scoped promote needs a verdict and holds failing dates
    // itself (a held date holds itself and the globals, the rest promote).
    expect(byName('Promote run manifest to production (#1763)')?.if).toContain(
      "steps.completenessgate.outputs.completeness_promote != ''"
    )
    expect(
      byName('Promote run manifest to production (#1763)')?.env
        ?.COMPLETENESS_GATE_FILE
    ).toBeTruthy()
    expect(
      byName('Invalidate CDN cache after promotion (#1294)')?.if
    ).toContain("steps.promotemanifest.outputs.objects_copied != '0'")
  })

  it('a failure is reported as a blocked promotion', () => {
    const blocked = byName('Promotion blocked')
    expect(blocked?.if).toContain(FAILS)
    expect(blocked?.run).toContain(OUTPUT)
  })

  it('skip_promotion still reports its verdict', () => {
    expect(byName('Promotion skipped (skip_promotion)')?.run).toContain(OUTPUT)
  })

  it('feeds the promotion-held alert so a hold files the issue', () => {
    const alert = steps.find(s => s.id === 'promoalert')
    expect(alert?.env?.COMPLETENESS_PROMOTE).toBe(OUTPUT)
    expect(alert?.env?.COMPLETENESS_GATE_FILE).toBe(
      gate?.env?.COMPLETENESS_GATE_FILE
    )
    expect(indexOf(s => s.id === 'promoalert')).toBeGreaterThan(gateIndex)
  })
})

describe('Find-A-Club warnings (#2239: warn on few, hold on many)', () => {
  const WARNINGS = 'steps.completenessgate.outputs.fac_warnings'
  const filer = byName('File or refresh Find-A-Club loss warning issue (#2239)')

  it('the gate writes the warning issue body to a known file', () => {
    const gate = steps.find(s => s.id === 'completenessgate')
    expect(gate?.env?.FAC_WARNING_BODY_FILE).toBeTruthy()
  })

  it('files or refreshes a fac-loss issue when the gate warned, whatever it promoted', () => {
    expect(filer).toBeDefined()
    expect(filer?.if).toContain(`${WARNINGS} != '0'`)
    expect(filer?.if).toContain(`${WARNINGS} != ''`)
    expect(filer?.if).toContain("steps.mode.outputs.skip_promotion != 'true'")
    expect(filer?.if).not.toContain('completeness_promote')
    expect(filer?.run).toContain('--label fac-loss')
    expect(filer?.run).toContain('gh issue comment')
    expect(filer?.run).toContain('gh issue create')
    expect(filer?.env?.GH_TOKEN).toBe('${{ github.token }}')
  })

  it('can never fail the run: an issue-API error must not skip the sidecars and rollup', () => {
    // place-reports, education-rollup and promote-reports need
    // needs.pipeline.result == 'success'; this step is only an alert.
    expect(filer?.['continue-on-error']).toBe(true)
    expect(filer?.run).toMatch(/::warning::/)
    expect(filer?.run).not.toMatch(/^\s*set -e/m)
  })

  it('runs after the gate', () => {
    expect(
      indexOf(
        s => s.name === 'File or refresh Find-A-Club loss warning issue (#2239)'
      )
    ).toBeGreaterThan(indexOf(s => s.id === 'completenessgate'))
  })
})
