/**
 * Workflow guard: mode=rescrape-historical publishes like the other modes
 * (#1670).
 *
 * Before #1670 the mode:
 *  1. uploaded every rebuilt snapshot with one unguarded `cp -r`, so it could
 *     replace a remote close (#1621/#1626 protect rescrape and rebuild only);
 *  2. rebuilt time-series/ and club-trends/ on an empty runner (R2) and copied
 *     them over GCS, so a single-PY run replaced index-metadata.json with one
 *     that listed only that PY, and replaced that PY's daily points with the
 *     12 month-ends;
 *  3. let `Generate CDN manifests` take the newest LOCAL snapshot, which moved
 *     staging v1/latest.json back to the historical year-end;
 *  4. fell into the DAILY branch of `Update district-snapshot-index` with an
 *     empty date and district list (R17).
 *
 * Sourced from the workflow YAML so the glue cannot drift back.
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
  run?: string
}

interface Workflow {
  on: {
    workflow_dispatch: { inputs: { mode: { options: string[] } } }
  }
  jobs: Record<string, { steps?: Step[] }>
}

const workflow = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as Workflow
const steps = Object.values(workflow.jobs).flatMap(job => job.steps ?? [])

function stepNamed(name: string): Step {
  const step = steps.find(s => s.name === name)
  if (!step?.run) throw new Error(`step not found: ${name}`)
  return step
}

const historicalSteps = steps.filter(
  s =>
    (s.if ?? '').includes("mode == 'rescrape-historical'") ||
    (s.name ?? '').startsWith('[rescrape-historical]')
)
const historicalRun = historicalSteps.map(s => s.run ?? '').join('\n')

describe('rescrape-historical — guarded, upserting, never backwards (#1670)', () => {
  it('has rescrape-historical steps to check', () => {
    expect(historicalSteps.length).toBeGreaterThan(0)
  })

  it('deletes nothing from GCS (no clean-slate nuke)', () => {
    expect(historicalRun).not.toMatch(/gcloud storage rm/)
    expect(historicalRun).not.toMatch(/gsutil( -m)? rm/)
  })

  it('never bulk-uploads the local snapshots directory', () => {
    expect(historicalRun).not.toMatch(/\.\/cache\/snapshots\/\*/)
  })

  describe('the per-date rebuild loop', () => {
    const run = stepNamed(
      '[rescrape-historical] Rebuild, guard and publish one date at a time'
    ).run!
    // The loop runs in scripts/pipeline/process-dates.sh (#1742). Its
    // transform → guard → compute → upload order, and the refused/failed
    // skip, run for real in processDates.test.ts; this pins the hand-off.
    const loopAt = run.indexOf('bash scripts/pipeline/process-dates.sh')

    it('syncs time-series/ and club-trends/ from GCS before rebuilding, failing closed (R2, R9)', () => {
      // Through the fail-closed store script (#1722, #1738); its behaviour is
      // tested in storeSyncScripts.test.ts.
      const line = run
        .split('\n')
        .find(l => l.includes('scripts/pipeline/sync-stores.sh'))
      expect(line, 'store sync').toBeDefined()
      expect(line).not.toContain('|| true')
      const at = run.indexOf(line!)
      expect(at).toBeLessThan(loopAt)
      const call = run.slice(at, run.indexOf('\n\n', at))
      for (const store of ['time-series', 'club-trends']) {
        expect(call).toMatch(new RegExp(`\\s${store}(\\s|$)`))
      }
    })

    it('transforms one raw date at a time instead of the all-at-once rebuild', () => {
      expect(run).not.toContain('collector-cli rebuild')
      expect(run).toContain(
        'bash scripts/pipeline/process-dates.sh "${GCS_BUCKET}" rescrape-historical ${RAW_DATES}'
      )
    })

    it('leaves no inline transform, compute or upload in the step to drift back', () => {
      expect(run).not.toMatch(
        /collector-cli\s+(?:transform|compute-analytics)\b/
      )
      expect(run).not.toMatch(/gcloud storage cp\b/)
    })
  })

  it('publishes the stores it synced and upserted, not a rebuilt-from-empty copy', () => {
    const upload = stepNamed(
      '[rescrape-historical] Upload upserted stores and raw-csv'
    ).run!
    expect(upload).toMatch(
      /bash scripts\/pipeline\/publish-stores\.sh "\$\{GCS_BUCKET\}" \\\s+time-series club-trends club-race district-awards-history/
    )
  })
})

describe('Generate CDN manifests — v1/latest.json never moves backwards (#1670)', () => {
  const run = stepNamed('Generate CDN manifests').run!

  it('reads the current remote latest.json', () => {
    expect(run).toContain('gs://${GCS_BUCKET}/v1/latest.json')
    expect(run).toMatch(/latestSnapshotDate/)
  })

  it('chooses the date through the unit-tested resolver', () => {
    expect(run).toContain('scripts/resolve-latest-snapshot-date.ts')
    expect(run).toContain('--remote')
    expect(run).toContain('--dates-file')
  })
})

describe('Update district-snapshot-index — an explicit case per mode (R17, #1670)', () => {
  const run = stepNamed('Update district-snapshot-index').run!
  const modes = workflow.on.workflow_dispatch.inputs.mode.options

  it('names every mode that reaches the step', () => {
    for (const mode of modes.filter(m => m !== 'backfill-global-totals')) {
      expect(run, mode).toMatch(new RegExp(`\\b${mode}\\b[|)]`))
    }
  })

  it('regenerates from the listing for rescrape and rescrape-historical', () => {
    expect(run).toMatch(/rebuild\|prune\|rescrape\|rescrape-historical\)/)
  })

  it('fails on an unknown mode instead of falling into the daily merge', () => {
    expect(run).toMatch(/\*\)\s*\n\s*echo "::error::/)
  })
})
