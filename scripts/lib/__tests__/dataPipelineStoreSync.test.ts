/**
 * Store-sync symmetry guard for data-pipeline.yml (#1111).
 *
 * The pipeline runs in three modes (daily / rebuild / rescrape). Each mode
 * that pushes a GCS-backed store FILE back at the end of its run must first
 * pull that same file at the start — otherwise the store loads empty and the
 * push CLOBBERS the accumulated GCS copy (R2 / R9).
 *
 * The 2026-06-09 audit (§9b) found rescrape pushing district-awards-history.json
 * back without ever syncing it down (daily and rebuild both sync it). This
 * guard parses the workflow and asserts: for every mode, the set of stores it
 * UPLOADS is a subset of the set it DOWNLOADS. Sourced from the workflow YAML
 * itself, so it can't drift from the real steps.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)

// GCS-backed store files that persist across runs and must survive a clobber.
const STORE_FILES = ['district-awards-history.json']

interface Step {
  name?: string
  run?: string
}

function loadSteps(): Step[] {
  const doc = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as {
    jobs: Record<string, { steps?: Step[] }>
  }
  return Object.values(doc.jobs).flatMap(job => job.steps ?? [])
}

function modeOf(step: Step): string | null {
  const m = step.name?.match(/^\[(\w+)\]/)
  return m ? m[1]! : null
}

// download: GCS path is the FIRST cp arg (gs:// → ./cache)
function downloadsStore(run: string, file: string): boolean {
  return new RegExp(
    `cp\\s+"gs://\\$\\{GCS_BUCKET\\}/${file.replace(/\./g, '\\.')}"`
  ).test(run)
}

// upload: local cache path is the FIRST cp arg (./cache → gs://)
function uploadsStore(run: string, file: string): boolean {
  return new RegExp(`cp\\s+"\\./cache/${file.replace(/\./g, '\\.')}"`).test(run)
}

describe('data-pipeline.yml store-sync symmetry (#1111)', () => {
  const steps = loadSteps()

  for (const file of STORE_FILES) {
    const downloaders = new Set<string>()
    const uploaders = new Set<string>()
    for (const step of steps) {
      const mode = modeOf(step)
      if (!mode || !step.run) continue
      if (downloadsStore(step.run, file)) downloaders.add(mode)
      if (uploadsStore(step.run, file)) uploaders.add(mode)
    }

    it(`every mode that uploads ${file} also downloads it first`, () => {
      const clobberers = [...uploaders].filter(m => !downloaders.has(m))
      expect(clobberers).toEqual([])
    })

    it(`rescrape syncs ${file} down (regression: #1111)`, () => {
      expect(uploaders.has('rescrape')).toBe(true)
      expect(downloaders.has('rescrape')).toBe(true)
    })
  }
})
