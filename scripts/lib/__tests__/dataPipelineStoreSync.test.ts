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
  const m = step.name?.match(/^\[([\w-]+)\]/)
  return m ? m[1]! : null
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// download: GCS path is the FIRST cp arg (gs:// → ./cache), the
// fail-closed pull helper (#1704), or scripts/pipeline/sync-stores.sh naming
// the store (#1722), possibly across `\` continuation lines.
function inlinePullRegex(file: string): RegExp {
  return new RegExp(`cp\\s+"gs://\\$\\{GCS_BUCKET\\}/${escapeRegExp(file)}"`)
}

/** `scripts/pipeline/<script>` naming `store` as an argument. */
function storeScriptRegex(script: string, file: string): RegExp {
  const store = escapeRegExp(file.replace(/\.json$/, ''))
  return new RegExp(
    `scripts/pipeline/${script}\\.sh(?:[^\\n]|\\\\\\n)*?\\s${store}(?:\\s|$)`
  )
}

function downloadRegex(file: string): RegExp {
  return new RegExp(
    `${inlinePullRegex(file).source}|scripts/pull-awards-history\\.sh|` +
      storeScriptRegex('sync-stores', file).source
  )
}

function downloadsStore(run: string, file: string): boolean {
  return downloadRegex(file).test(run)
}

// Every collector-cli command that runs TransformService, which loads and
// saves the awards-history store (TransformService.writeCompetitiveAwardsToDate).
const TRANSFORM_RE = /npx\s+collector-cli\s+(?:scrape|transform)\b/

/** Position of a match across the whole workflow: [stepIndex, charOffset]. */
type Pos = [number, number]

function firstMatch(steps: Step[], mode: string, re: RegExp): Pos | null {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    if (modeOf(step) !== mode || !step.run) continue
    const m = re.exec(step.run)
    if (m) return [i, m.index]
  }
  return null
}

function before(a: Pos, b: Pos): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])
}

// upload: local cache path is the FIRST cp arg (./cache → gs://), or
// scripts/pipeline/publish-stores.sh naming the store (#1722)
function uploadsStore(run: string, file: string): boolean {
  return (
    new RegExp(`cp\\s+"\\./cache/${escapeRegExp(file)}"`).test(run) ||
    storeScriptRegex('publish-stores', file).test(run)
  )
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

    // #1704: syncing at all is not enough. Daily pulled the store AFTER its
    // scrape --transform, so the transform loaded an empty store (every daily
    // competitive-awards.json had priorYearAvgClubSize: null) and the late
    // pull then overwrote the store the transform had saved.
    const transformModes = [
      ...new Set(
        steps
          .filter(s => s.run && TRANSFORM_RE.test(s.run))
          .map(modeOf)
          .filter((m): m is string => m !== null)
      ),
    ].sort()

    it('finds a transform in every data mode', () => {
      expect(transformModes).toEqual([
        'daily',
        'rebuild',
        'rescrape',
        'rescrape-historical',
      ])
    })

    for (const mode of transformModes) {
      it(`${mode} pulls ${file} BEFORE its first transform (#1704)`, () => {
        const transform = firstMatch(steps, mode, TRANSFORM_RE)!
        const pull = firstMatch(steps, mode, downloadRegex(file))
        expect(pull, `${mode} never pulls ${file}`).not.toBeNull()
        expect(
          before(pull!, transform),
          `${mode} pulls ${file} at ${pull} after transform at ${transform}`
        ).toBe(true)
      })

      it(`${mode} pulls ${file} exactly once, so nothing overwrites the transform's save (#1704)`, () => {
        const pulls = steps.filter(
          s => modeOf(s) === mode && s.run && downloadsStore(s.run, file)
        )
        expect(pulls.length).toBe(1)
      })

      it(`${mode} pushes the upserted ${file} back (#1704)`, () => {
        expect(uploaders.has(mode)).toBe(true)
      })
    }

    it(`every ${file} pull is fail-closed via scripts/pull-awards-history.sh (#1704)`, () => {
      const inlinePulls = steps.filter(
        s => modeOf(s) && s.run && inlinePullRegex(file).test(s.run)
      )
      expect(inlinePulls.map(s => s.name)).toEqual([])
    })
  }
})
