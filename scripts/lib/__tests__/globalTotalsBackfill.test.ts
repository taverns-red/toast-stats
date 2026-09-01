/**
 * Worldwide-rollup backfill guard for data-pipeline.yml (#1498, epic #1496).
 *
 * The daily pipeline writes `global-totals.json` from `compute-analytics`.
 * Historical dates will never be recomputed, so a dispatch mode builds the
 * same artifact for the dates the 5-year history (Sprint 3) reads. Four
 * things about that mode are load-bearing and silently breakable, so they are
 * sourced from the workflow YAML itself rather than trusted:
 *
 * 1. The date set. Sprint 3 reads five program-year ends AND five March 31s
 *    (the TI-comparable membership dates). Dropping one leaves a hole that
 *    only shows up as a missing row in a chart months later.
 * 2. The read side is PRODUCTION. The archive lives there; staging carries
 *    only recent dates, so sourcing from staging would silently backfill
 *    nothing for the historical dates that are the entire point.
 * 3. The write side is STAGING, with the snapshots' own CDN headers, so the
 *    artifact reaches production through the ordinary gated promotion rather
 *    than around it.
 * 4. Each date's directory is deleted after upload. A year-end snapshot
 *    directory is ~500 MB against a runner's ~14 GB — the same constraint
 *    the rebuild mode streams for.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)

const MODE = 'backfill-global-totals'

/** The minimum set #1498 requires; a superset is fine, a subset is not. */
const REQUIRED_DATES = [
  '2022-06-30',
  '2023-06-30',
  '2024-06-30',
  '2025-06-30',
  '2026-06-30',
  '2022-03-31',
  '2023-03-31',
  '2024-03-31',
  '2025-03-31',
  '2026-03-31',
]

interface Step {
  name?: string
  if?: string
  run?: string
}

const doc = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as {
  on: { workflow_dispatch: { inputs: Record<string, { options?: string[] }> } }
  jobs: Record<string, { steps?: Step[] }>
}

const steps = Object.values(doc.jobs).flatMap(job => job.steps ?? [])
/** Steps that RUN in this mode (as opposed to steps that exclude it). */
const backfillSteps = steps.filter(
  step => step.if?.includes(MODE) && !step.if.includes(`!= '${MODE}'`)
)
/** Steps that explicitly opt OUT of this mode. */
const excludingSteps = steps.filter(step => step.if?.includes(`!= '${MODE}'`))

describe('data-pipeline.yml worldwide-rollup backfill (#1498)', () => {
  it('exposes the mode as a dispatch option', () => {
    expect(doc.on.workflow_dispatch.inputs['mode']?.options).toContain(MODE)
  })

  it('has exactly one step gated on the mode', () => {
    expect(backfillSteps).toHaveLength(1)
    expect(backfillSteps[0]!.run).toBeTruthy()
  })

  const run = () => backfillSteps[0]!.run!

  it('defaults to every date the 5-year history needs', () => {
    for (const date of REQUIRED_DATES) {
      expect(run()).toContain(date)
    }
  })

  it('reads the archive from PRODUCTION, not staging', () => {
    // Both inputs the rollup needs, and both from the production bucket.
    expect(run()).toContain(
      '"gs://${GCS_BUCKET_PRODUCTION}/snapshots/${DATE}/all-districts-rankings.json"'
    )
    expect(run()).toContain(
      '"gs://${GCS_BUCKET_PRODUCTION}/snapshots/${DATE}/district_*.json"'
    )
  })

  it('writes to staging with the snapshots’ own CDN headers', () => {
    expect(run()).toContain(
      '"gs://${GCS_BUCKET}/snapshots/${DATE}/global-totals.json"'
    )
    expect(run()).toContain(
      '-h "Cache-Control:public, max-age=3600, must-revalidate"'
    )
    expect(run()).toContain('-h "Content-Type:application/json"')
    // Never written straight to production — promotion is gated for a reason.
    // (The production bucket appears only on the READ side, above.)
    expect(run()).not.toContain(
      '"gs://${GCS_BUCKET_PRODUCTION}/snapshots/${DATE}/global-totals.json"'
    )
  })

  it('skips a date with no district set instead of guessing one', () => {
    // #1466/R17: without the date's own all-districts-rankings.json there is
    // nothing to scope to, and an unscoped rollup is refused, not invented.
    expect(run()).toMatch(
      /if \[ ! -f "\$\{SNAPSHOT_DIR\}\/all-districts-rankings\.json" \]/
    )
  })

  it('streams one date at a time, freeing each directory after upload', () => {
    expect(run()).toContain('rm -rf "${SNAPSHOT_DIR}"')
  })

  it('refuses a date whose district files did not all arrive', () => {
    // The sync is fail-soft (`|| true`, R2). If it half-fails, the club and
    // payment sums come out understated while the rankings-derived counts stay
    // whole — plausible, and wrong. The builder exits non-zero; the mode must
    // not paper over it, so the upload is inside the success branch and the
    // override flag is never passed by default.
    expect(run()).not.toContain('--allow-missing-districts')
    expect(run()).toMatch(
      /if npx tsx scripts\/build-global-totals\.ts[\s\S]*?; then[\s\S]*?gsutil/
    )
  })

  it('is excluded from every district-derived shared manifest step', () => {
    // R17: this mode publishes no district_*.json, so nothing derived from
    // district snapshots may be regenerated from it. The index step's `else`
    // is the DAILY merge branch — left in, it wrote a phantom `"": [""]`
    // entry that promotion then rsynced to production.
    const excluded = excludingSteps.map(step => step.name)
    expect(excluded).toEqual(
      expect.arrayContaining([
        'Generate CDN manifests',
        'Update district-snapshot-index',
        'Generate club-index',
      ])
    )
  })

  it('runs the tested builder rather than reimplementing the rollup', () => {
    expect(run()).toContain('scripts/build-global-totals.ts')
    expect(
      fs.existsSync(
        path.resolve(process.cwd(), 'scripts/build-global-totals.ts')
      )
    ).toBe(true)
  })
})
