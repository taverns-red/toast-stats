/**
 * Workflow guard: store downloads are normalised, `-Z` store uploads are
 * guarded, and compute failures reach the step's exit status (#1702).
 *
 * The mechanism this pins, from the 2026-10 incident:
 *  1. `gcloud storage rsync` (since #1412 / #1649) downloaded the
 *     `Content-Encoding: gzip` time-series objects WITHOUT decompressing them
 *     on the runner's SDK;
 *  2. `compute-analytics` could not parse them, logged "(continuing)", and
 *     `| tee` without pipefail threw away whatever exit code it had;
 *  3. `gcloud storage cp -Z` gzipped the already-gzipped bytes: +1 layer a run.
 *
 * Code-level reads now peel layers too, but the daily run only REWRITES the
 * current program year: every older file goes straight back up, so it must
 * be peeled on disk. Sourced from the workflow YAML so the glue can't drift.
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

const workflow = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as {
  jobs: Record<string, { steps?: Step[] }>
}
const steps = Object.values(workflow.jobs)
  .flatMap(job => job.steps ?? [])
  .filter((s): s is Step & { run: string } => typeof s.run === 'string')

const STORE_DIRS = ['time-series', 'club-trends', 'club-race'] as const
const AWARDS = 'district-awards-history.json'

/** Lines of a run block with shell comments dropped. */
function codeLines(run: string): string[] {
  return run.split('\n').map(line => line.replace(/^\s*#.*$/, ''))
}

/**
 * Join backslash-continued lines so a multi-line `gcloud storage cp \ ... -Z`
 * is one logical command. Returns [logicalLine, firstPhysicalIndex] pairs.
 */
function logicalLines(run: string): Array<{ text: string; index: number }> {
  const out: Array<{ text: string; index: number }> = []
  let buffer = ''
  let start = -1
  codeLines(run).forEach((line, i) => {
    if (start < 0) start = i
    if (/\\\s*$/.test(line)) {
      buffer += line.replace(/\\\s*$/, ' ')
      return
    }
    out.push({ text: buffer + line, index: start })
    buffer = ''
    start = -1
  })
  return out
}

/** Escape every RegExp metacharacter, backslash included. */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isStoreDownload(text: string, store: string): boolean {
  const name = escapeRegExp(store)
  if (store === AWARDS) {
    return new RegExp(
      `gcloud storage cp\\s+"gs://\\$\\{GCS_BUCKET\\}/${name}"`
    ).test(text)
  }
  return new RegExp(
    `gcloud storage rsync -r\\s+"gs://\\$\\{GCS_BUCKET\\}/${name}/"\\s+"\\./cache/${name}/"`
  ).test(text)
}

function normalisesStore(text: string, store: string): boolean {
  return (
    /scripts\/store-encoding\.ts\s+normalize\b/.test(text) &&
    text.includes(`./cache/${store}`)
  )
}

function isGzipStoreUpload(text: string, store: string): boolean {
  return (
    /gcloud storage cp\b/.test(text) &&
    /\s-Z\b/.test(text) &&
    text.includes(`./cache/${store}`)
  )
}

function checksStore(text: string, store: string): boolean {
  return (
    /scripts\/store-encoding\.ts\s+check\b/.test(text) &&
    text.includes(`./cache/${store}`)
  )
}

describe('data-pipeline.yml store encoding guards (#1702)', () => {
  const stores = [...STORE_DIRS, AWARDS]

  for (const store of stores) {
    it(`every download of ${store} is followed by an on-disk normalise in the same step`, () => {
      const unnormalised: string[] = []
      let downloads = 0
      for (const step of steps) {
        const lines = logicalLines(step.run)
        lines.forEach(({ text }, i) => {
          if (!isStoreDownload(text, store)) return
          downloads++
          const later = lines.slice(i + 1)
          if (!later.some(l => normalisesStore(l.text, store))) {
            unnormalised.push(step.name ?? '(unnamed)')
          }
        })
      }
      expect(unnormalised).toEqual([])
      // Non-vacuous: daily, rebuild and rescrape all sync every store.
      expect(downloads).toBeGreaterThanOrEqual(3)
    })
  }

  for (const store of STORE_DIRS) {
    it(`every -Z upload of ${store} is preceded by the double-encoding check`, () => {
      const unguarded: string[] = []
      for (const step of steps) {
        const lines = logicalLines(step.run)
        lines.forEach(({ text }, i) => {
          if (!isGzipStoreUpload(text, store)) return
          const earlier = lines.slice(0, i)
          if (!earlier.some(l => checksStore(l.text, store))) {
            unguarded.push(step.name ?? '(unnamed)')
          }
        })
      }
      expect(unguarded).toEqual([])
    })
  }

  it('finds the time-series -Z uploads it guards (non-vacuous)', () => {
    const uploads = steps.flatMap(step =>
      logicalLines(step.run).filter(l =>
        isGzipStoreUpload(l.text, 'time-series')
      )
    )
    expect(uploads.length).toBeGreaterThanOrEqual(4)
  })

  it('every collector-cli compute-analytics piped through tee runs under pipefail', () => {
    const masked: string[] = []
    let piped = 0
    for (const step of steps) {
      const lines = logicalLines(step.run)
      lines.forEach(({ text }, i) => {
        if (!/collector-cli compute-analytics\b.*\|\s*tee\b/.test(text)) return
        piped++
        const earlier = lines.slice(0, i)
        if (
          !earlier.some(l => /^\s*set\s+-[a-z]*o\s+pipefail\b/.test(l.text))
        ) {
          masked.push(step.name ?? '(unnamed)')
        }
      })
    }
    expect(masked).toEqual([])
    expect(piped).toBeGreaterThanOrEqual(1)
  })
})
