/**
 * Workflow guard: `mode=rescrape` with `dates=` never uploads a date whose
 * source CSVs are for another day (#1669).
 *
 * `collector-cli scrape --date D` now requests D's own as-of and exits
 * non-zero, writing nothing, when the dashboard answers with a different day
 * (unit-tested in CollectorOrchestrator.requestedAsOf.test.ts). This pins the
 * workflow half: a failed scrape skips the date before any upload, and clears
 * what it left locally so the shared store-sync and manifest steps cannot
 * publish it either.
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
  run?: string
}

interface Workflow {
  on: {
    workflow_dispatch: {
      inputs: Record<string, { description?: string }>
    }
  }
  jobs: Record<string, { steps?: Step[] }>
}

function load(): Workflow {
  return parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as Workflow
}

function rescrapeStep(): string {
  const step = Object.values(load().jobs)
    .flatMap(job => job.steps ?? [])
    .find(s => s.name === '[rescrape] Re-collect and process dates')
  if (!step?.run) throw new Error('[rescrape] Re-collect step not found')
  return step.run
}

// The per-date loop runs in scripts/pipeline/process-dates.sh (#1742). Its
// failed-scrape path runs for real in processDates.test.ts: the date is
// counted failed, nothing is uploaded for it, and its local raw-csv and
// snapshot leftovers are removed so later steps cannot publish them. This
// guard pins the hand-off.
describe('data-pipeline rescrape — a date whose as-of is wrong is never uploaded (#1669)', () => {
  const run = rescrapeStep()

  it('runs every date through process-dates.sh in rescrape mode, with the district list', () => {
    expect(run).toMatch(
      /DISTRICTS="\$\{DISTRICTS\}" bash scripts\/pipeline\/process-dates\.sh "\$\{GCS_BUCKET\}" rescrape /
    )
  })

  it('has no inline scrape or upload left in the step to drift back', () => {
    expect(run).not.toMatch(/collector-cli\s+scrape\b/)
    expect(run).not.toMatch(/gcloud storage (?:cp|rsync)\b/)
  })

  it('documents what rescrape + dates does on the dispatch input', () => {
    const description =
      load().on.workflow_dispatch.inputs['dates']?.description ?? ''
    expect(description).toMatch(/as-of/)
    expect(description).toContain('#1669')
  })
})
