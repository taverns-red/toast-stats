/**
 * Workflow guard: stateful stores go through scripts/pipeline/*.sh (#1722,
 * plan S1-2).
 *
 * The behaviour (fail-closed download, count floor, normalise, double-encoding
 * check) is tested by running the scripts themselves in
 * storeSyncScripts.test.ts. This guard only pins the wiring: a migrated mode
 * has no inline store transfer left to drift, it pulls each store before the
 * first command that reads it, and it publishes after the last one.
 *
 * Modes migrated one PR at a time; rescrape-historical was last (#1738,
 * with plan E2-5), so every mode is now on the scripts.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import { PROMOTED_PREFIXES } from '../promotionContentGate.js'

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)

const MIGRATED_MODES = [
  'daily',
  'rebuild',
  'rescrape',
  'rescrape-historical',
] as const

const DIR_STORES = ['time-series', 'club-trends', 'club-race'] as const
const AWARDS = 'district-awards-history'
const STORES = [...DIR_STORES, AWARDS] as const

interface Step {
  name?: string
  run?: string
}

const steps = (
  Object.values(
    (
      parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as {
        jobs: Record<string, { steps?: Step[] }>
      }
    ).jobs
  ).flatMap(job => job.steps ?? []) as Step[]
).filter((s): s is Step & { run: string } => typeof s.run === 'string')

function modeOf(step: Step): string | null {
  const m = step.name?.match(/^\[([\w-]+)\]/)
  return m ? m[1]! : null
}

/** Shell lines with comments dropped and `\` continuations joined. */
function logicalLines(run: string): string[] {
  const out: string[] = []
  let buffer = ''
  for (const raw of run.split('\n')) {
    const line = raw.replace(/^\s*#.*$/, '')
    if (/\\\s*$/.test(line)) {
      buffer += line.replace(/\\\s*$/, ' ')
      continue
    }
    out.push(buffer + line)
    buffer = ''
  }
  return out
}

/** Every logical line of a mode, in workflow order. */
function modeLines(mode: string): string[] {
  return steps.filter(s => modeOf(s) === mode).flatMap(s => logicalLines(s.run))
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const SYNC_RE = /scripts\/pipeline\/sync-stores\.sh\b/
const PUBLISH_RE = /scripts\/pipeline\/publish-stores\.sh\b/
const TRANSFORM_RE = /npx\s+collector-cli\s+(?:scrape|transform)\b/
const COMPUTE_RE = /npx\s+collector-cli\s+compute-analytics\b/

function names(line: string, store: string): boolean {
  return new RegExp(`(^|\\s)${escapeRegExp(store)}(\\s|$)`).test(line)
}

/** An inline gcloud transfer of a store, in either direction. */
function inlineTransfer(line: string, store: string): boolean {
  if (!/gcloud storage (?:rsync|cp)\b/.test(line)) return false
  const s = escapeRegExp(store)
  return new RegExp(`/${s}(?:/|\\.json)|\\./cache/${s}`).test(line)
}

/** A store READ (gs:// → local) whose failure is swallowed. */
function swallowedRead(line: string): boolean {
  if (!/\|\|\s*true\b/.test(line)) return false
  return STORES.some(store =>
    new RegExp(
      `gcloud storage (?:rsync -r|cp)\\s+"gs://\\$\\{GCS_BUCKET\\}/${escapeRegExp(store)}`
    ).test(line)
  )
}

describe('data-pipeline.yml store scripts wiring (#1722)', () => {
  for (const mode of MIGRATED_MODES) {
    const lines = modeLines(mode)

    it(`${mode} has no inline store transfer left`, () => {
      const inline = lines.filter(l => STORES.some(s => inlineTransfer(l, s)))
      expect(inline).toEqual([])
    })

    for (const store of STORES) {
      it(`${mode} pulls ${store} exactly once, via sync-stores.sh`, () => {
        const pulls = lines.filter(l => SYNC_RE.test(l) && names(l, store))
        expect(pulls).toHaveLength(1)
      })

      it(`${mode} publishes ${store} exactly once, via publish-stores.sh`, () => {
        const pushes = lines.filter(l => PUBLISH_RE.test(l) && names(l, store))
        expect(pushes).toHaveLength(1)
      })

      const reader = store === AWARDS ? TRANSFORM_RE : COMPUTE_RE
      it(`${mode} pulls ${store} before its first reader and publishes after the last`, () => {
        const pull = lines.findIndex(l => SYNC_RE.test(l) && names(l, store))
        const push = lines.findIndex(l => PUBLISH_RE.test(l) && names(l, store))
        const readers = lines
          .map((l, i) => (reader.test(l) ? i : -1))
          .filter(i => i >= 0)
        expect(
          readers.length,
          `${mode} has no reader of ${store}`
        ).toBeGreaterThan(0)
        expect(pull).toBeGreaterThanOrEqual(0)
        expect(pull).toBeLessThan(readers[0]!)
        expect(push).toBeGreaterThan(readers[readers.length - 1]!)
      })
    }
  }

  it('no stateful-store read swallows its failure with `|| true`', () => {
    const offenders = new Set<string>()
    for (const step of steps) {
      const mode = modeOf(step)
      if (!mode) continue
      if (logicalLines(step.run).some(swallowedRead)) offenders.add(mode)
    }
    expect([...offenders]).toEqual([])
  })

  it('every migrated mode still exists', () => {
    const modes = new Set(steps.map(modeOf))
    for (const mode of MIGRATED_MODES) expect(modes.has(mode)).toBe(true)
  })
})

describe('daily scopes the club-trends pull to the resolved PY (#1728, E2-2)', () => {
  const SCOPE_RE =
    /npx tsx scripts\/club-trends-sync-scope\.ts\b.*--program-year\s+"\$\{\{\s*steps\.daily-config\.outputs\.program_year\s*\}\}"/

  it('daily derives CLUB_TRENDS_PROGRAM_YEARS from the discovery resolver, before the pull', () => {
    const lines = modeLines('daily')
    const scope = lines.findIndex(
      l => /CLUB_TRENDS_PROGRAM_YEARS=/.test(l) && SCOPE_RE.test(l)
    )
    const pull = lines.findIndex(
      l => SYNC_RE.test(l) && names(l, 'club-trends')
    )
    expect(scope, 'no resolver-derived scope in daily').toBeGreaterThanOrEqual(
      0
    )
    expect(scope).toBeLessThan(pull)
    expect(lines[pull]).toMatch(
      /CLUB_TRENDS_PROGRAM_YEARS="\$\{CLUB_TRENDS_PROGRAM_YEARS\}"/
    )
  })

  for (const mode of ['rebuild', 'rescrape', 'rescrape-historical'] as const) {
    it(`${mode} still pulls the whole club-trends store`, () => {
      expect(
        modeLines(mode).some(l => /CLUB_TRENDS_PROGRAM_YEARS/.test(l))
      ).toBe(false)
    })
  }
})

describe('club-trends/ and club-race/ are pipeline-internal (#1738, E2-5, D3)', () => {
  const INTERNAL = ['club-trends', 'club-race'] as const
  const promote = steps.find(s => s.name === 'Promote staging to production')

  it('the content gate does not treat them as promoted', () => {
    for (const store of INTERNAL) {
      expect(PROMOTED_PREFIXES).not.toContain(`${store}/`)
    }
  })

  it('promotion never copies them to prod', () => {
    expect(promote, 'no promote step').toBeDefined()
    const lines = logicalLines(promote!.run)
    for (const store of INTERNAL) {
      expect(lines.filter(l => l.includes(`${store}/`))).toEqual([])
    }
  })

  it('no step uploads them gzip-encoded or with CDN headers', () => {
    const offenders = steps.flatMap(step =>
      logicalLines(step.run).filter(
        l =>
          /gcloud storage (?:cp|rsync)\b/.test(l) &&
          /(?:^|\s)(?:-Z|--gzip-in-flight-all|--cache-control|--content-type)\b/.test(
            l
          ) &&
          INTERNAL.some(store => inlineTransfer(l, store))
      )
    )
    expect(offenders).toEqual([])
  })
})
