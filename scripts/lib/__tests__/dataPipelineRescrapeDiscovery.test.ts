/**
 * Workflow guard: the rescrape step discovers districts per date and expands
 * `program_year` to registry month-ends (#1766, ADR-015 step 8, D-6, D-7).
 *
 * The behaviour runs for real elsewhere: per-date discovery in
 * processDates.test.ts and CollectorOrchestrator.discoverDistricts.test.ts,
 * the month-end expansion in programYearMonthEnds.test.ts. This pins the
 * step's hand-off to them, so the first-date discovery and the 15th-of-month
 * generator cannot drift back.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import { ALLOWED_INLINE_NODE_SCRIPTS } from '../workflowInlineScriptGuard.js'

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

describe('data-pipeline rescrape — per-date discovery and month-end program_year (#1766)', () => {
  const run = rescrapeStep()

  it('does not discover districts once for every date (D-7)', () => {
    expect(run).not.toMatch(/FIRST_DATE/)
    expect(run).not.toMatch(/discover-districts/)
  })

  it('hands the runner DISTRICTS=discover when no districts input is given', () => {
    expect(run).toMatch(/DISTRICTS="discover"/)
    expect(run).toMatch(
      /DISTRICTS="\$\{DISTRICTS\}" bash scripts\/pipeline\/process-dates\.sh "\$\{GCS_BUCKET\}" rescrape /
    )
  })

  it('expands program_year with the registry script, not an inline generator (D-6)', () => {
    expect(run).toMatch(/scripts\/program-year-month-ends\.ts/)
    expect(run).not.toMatch(/\bnode\s+-e\b/)
    expect(run).not.toMatch(/15th/)
  })

  it('drops the inline-node allow-list entry the 15th generator held (#1743)', () => {
    expect(
      ALLOWED_INLINE_NODE_SCRIPTS.filter(s => s.file === 'data-pipeline.yml')
    ).toEqual([])
  })

  it('says on the dispatch input that program_year means the closed month-ends', () => {
    const description =
      load().on.workflow_dispatch.inputs['program_year']?.description ?? ''
    expect(description).toMatch(/month-end/)
    expect(description).toContain('month-end-closing-dates.json')
  })
})
