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

function rescrapeLoop(): string {
  const step = Object.values(load().jobs)
    .flatMap(job => job.steps ?? [])
    .find(s => s.name === '[rescrape] Re-collect and process dates')
  if (!step?.run) throw new Error('[rescrape] Re-collect step not found')
  const run = step.run
  return run.slice(run.indexOf('for DATE in ${DATES}; do'))
}

describe('data-pipeline rescrape — a date whose as-of is wrong is never uploaded (#1669)', () => {
  const loop = rescrapeLoop()
  const scrapeAt = loop.indexOf('if ! npx collector-cli scrape ${SCRAPE_ARGS}')
  const failureBranch = loop.slice(scrapeAt, loop.indexOf('fi', scrapeAt))
  const firstUpload = loop.indexOf('gcloud storage')

  it('scrapes before any upload in the per-date loop', () => {
    expect(scrapeAt).toBeGreaterThan(-1)
    expect(firstUpload).toBeGreaterThan(scrapeAt)
  })

  it('skips the date on a failed scrape, before reaching an upload', () => {
    expect(failureBranch).toContain('continue')
    expect(failureBranch).not.toContain('gcloud storage')
  })

  it('clears the failed date’s local raw-csv and snapshot so later steps cannot publish it', () => {
    expect(failureBranch).toMatch(/rm -rf "\.\/cache\/raw-csv\/\$\{DATE\}"/)
    expect(failureBranch).toContain('${LEFTOVER_DIRS}')
  })

  it('documents what rescrape + dates does on the dispatch input', () => {
    const description =
      load().on.workflow_dispatch.inputs['dates']?.description ?? ''
    expect(description).toMatch(/as-of/)
    expect(description).toContain('#1669')
  })
})
