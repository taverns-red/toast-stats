/**
 * Workflow contract: the `og-cards` job (#2304).
 *
 * Ron's decisions (2026-10-28): districts only, in a NEW job with its own
 * 10-minute cap; no existing job's timeout changes. The cards follow the
 * staging-first pattern: render from staging, upload to staging, and copy
 * to prod only when prod serves the exact rankings and awards the cards
 * were drawn from (a held date holds its cards), never on a staging-only
 * proof run. Stable URL, overwritten daily, an hour of CDN cache.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import {
  prodWriteReasons,
  topLevelConjuncts,
  SKIP_CLAUSE_DOWNSTREAM,
} from '../prodWriteGuard.js'

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  uses?: string
  env?: Record<string, string>
}
interface Job {
  if?: string
  needs?: string | string[]
  'timeout-minutes'?: number | string
  steps?: Step[]
}

const source = fs.readFileSync(
  path.resolve(process.cwd(), '.github/workflows/data-pipeline.yml'),
  'utf-8'
)
const workflow = parse(source) as { jobs: Record<string, Job> }
const job = workflow.jobs['og-cards']
const steps = job?.steps ?? []
const idx = (pred: (s: Step) => boolean) => steps.findIndex(pred)
const runs = steps.map(s => s.run ?? '').join('\n')

describe('og-cards job (#2304)', () => {
  it('exists, after the pipeline job, with its own 10-minute cap', () => {
    expect(job).toBeDefined()
    expect(job!.needs).toBe('pipeline')
    expect(job!['timeout-minutes']).toBe(10)
  })

  it('runs only after a successful daily pipeline', () => {
    const c = topLevelConjuncts(job!.if ?? '')
    expect(c).toContain("needs.pipeline.result == 'success'")
    expect(c).toContain("needs.pipeline.outputs.mode == 'daily'")
  })

  it('leaves every existing job timeout as it was', () => {
    const timeouts = Object.fromEntries(
      Object.entries(workflow.jobs)
        .filter(([k]) => k !== 'og-cards')
        .map(([k, j]) => [k, j['timeout-minutes']])
    )
    expect(timeouts).toEqual({
      pipeline:
        "${{ (inputs.mode == 'rebuild' || inputs.mode == 'rescrape' || inputs.mode == 'rescrape-historical') && 240 || (inputs.mode == 'backfill-global-totals' && 120 || 30) }}",
      'closing-registry-pr': 15,
      'daily-reports': 45,
      'place-reports': 15,
      'education-rollup': 15,
      'promote-reports': 30,
      'education-ledger-history': 240,
    })
  })

  it('reads its inputs from STAGING and renders with the tested CLI', () => {
    const fetch = steps[idx(s => s.id === 'inputs')]!
    expect(fetch.run).toMatch(/gs:\/\/\$\{GCS_BUCKET\}\/v1\/rankings\.json/)
    expect(fetch.run).toMatch(
      /gs:\/\/\$\{GCS_BUCKET\}\/snapshots\/\$\{DATE\}\/competitive-awards\.json/
    )
    expect(fetch.run).not.toMatch(/GCS_BUCKET_PRODUCTION/)
    expect(runs).toMatch(/npx tsx scripts\/og-cards\.ts render\b/)
    expect(runs).toMatch(/npx playwright install chromium/)
  })

  it('uploads to staging og/v1/district/ with the hour TTL and PNG type', () => {
    const up = steps[idx(s => s.id === 'upload')]!
    expect(up.run).toMatch(/gs:\/\/\$\{GCS_BUCKET\}\/og\/v1\/district\//)
    expect(up.run).toContain('--cache-control="public, max-age=3600"')
    expect(up.run).toContain('--content-type="image/png"')
    expect(prodWriteReasons(up.run ?? '')).toEqual([])
  })

  it('gates, then promotes: only the copy step writes prod, after the gate passed', () => {
    const upload = idx(s => s.id === 'upload')
    const gate = idx(s => s.id === 'gate')
    const promote = idx(s => s.id === 'promote')
    expect(upload).toBeGreaterThan(-1)
    expect(gate).toBeGreaterThan(upload)
    expect(promote).toBeGreaterThan(gate)

    const writers = steps
      .filter(s => prodWriteReasons(s.run ?? '').length > 0)
      .map(s => s.id)
    expect(writers).toEqual(['promote'])

    const c = topLevelConjuncts(steps[promote]!.if ?? '')
    expect(c).toContain("steps.gate.outputs.promote == 'true'")
    expect(c).toContain(SKIP_CLAUSE_DOWNSTREAM)
  })

  it('the gate compares staging and prod hashes of both inputs through the CLI', () => {
    const g = steps[idx(s => s.id === 'gate')]!
    expect(g.run).toMatch(/npx tsx scripts\/og-cards\.ts gate\b/)
    expect(g.run).toMatch(/GCS_BUCKET_PRODUCTION\}\/v1\/rankings\.json/)
    expect(g.run).toMatch(/competitive-awards\.json/)
    expect(g.run).toMatch(/objects describe/)
  })

  it('copies exactly the planned cards into prod, with the same TTL and type', () => {
    const p = steps[idx(s => s.id === 'promote')]!
    expect(p.run).toContain('--cache-control="public, max-age=3600"')
    expect(p.run).toContain('--content-type="image/png"')
    expect(p.run).toMatch(
      /gs:\/\/\$\{GCS_BUCKET_PRODUCTION\}\/og\/v1\/district\//
    )
    // No wildcard source: the list comes from the render's own plan.
    expect(p.run).not.toMatch(/\*\.png/)
    expect(p.run).toMatch(/cards\.json/)
  })

  it('a held gate is a warning, not a failed run (prod keeps yesterday’s cards)', () => {
    const held = steps.find(s =>
      (s.if ?? '').includes("steps.gate.outputs.promote == 'false'")
    )
    expect(held?.run).toMatch(/::warning/)
  })

  it('never touches the run manifest or the CDN purge (og/ is outside the data prefixes)', () => {
    expect(runs).not.toMatch(/RUN_MANIFEST_FILE|runs\/\$\{GITHUB_RUN_ID\}/)
    expect(runs).not.toMatch(/invalidate-cdn-cache|promote-run-manifest/)
  })
})
