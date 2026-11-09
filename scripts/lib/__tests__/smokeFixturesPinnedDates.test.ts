/**
 * Contract: a smoke that pins a page to a calendar date has that date's
 * fixtures in the manifest literally (#2595).
 *
 * action-list-mobile-names.smoke.ts pins `?date=2026-10-24`. The manifest
 * covered it only through `{ago14}`, which slid to 10-25 when the 11-08 daily
 * landed, and every PR Preview run went red with "No CDN fixture". A relative
 * token (`{date}`, `{prev}`, `{ago14}`) moves with the latest snapshot, so it
 * can never be what keeps a pinned date covered.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseManifest } from '../smokeFixtures'

const ROOT = process.cwd()
const manifest = parseManifest(
  JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'scripts/smoke-fixtures.manifest.json'),
      'utf-8'
    )
  )
)

const e2eDir = path.join(ROOT, 'frontend/e2e')

/**
 * Page URLs pinned to a date: `/district/<id>/...date=YYYY-MM-DD` as a string
 * literal in a smoke. Other date shapes (a `promoDate` clock override, dates in
 * comments or recorded-fixture imports) do not make a CDN read for that date.
 */
const PINNED =
  /(['"`])(\/district\/(\w+)[^'"`]*[?&]date=(\d{4}-\d{2}-\d{2}))\1/g

interface Pin {
  file: string
  route: string
  district: string
  date: string
}

const pins: Pin[] = fs
  .readdirSync(e2eDir)
  .filter(f => f.endsWith('.smoke.ts'))
  .flatMap(f =>
    [...fs.readFileSync(path.join(e2eDir, f), 'utf-8').matchAll(PINNED)].map(
      m => ({
        file: f,
        route: m[2] as string,
        district: m[3] as string,
        date: m[4] as string,
      })
    )
  )

/** Manifest entries that name this date as a literal path segment. */
const literalEntriesFor = (date: string) =>
  manifest.paths.filter(e => e.path.split('/').includes(date))

const districtsOf = (e: { districts?: string[] }) =>
  e.districts ?? manifest.districts

describe('smokes that pin a date are covered by literal manifest paths (#2595)', () => {
  it('finds the pinned dates', () => {
    expect(pins.length).toBeGreaterThanOrEqual(3)
  })

  it.each(pins.map(p => [p.file, p.route, p]))(
    '%s: %s has literal manifest entries for its date and district',
    (_file, _route, pin) => {
      const { district, date } = pin as Pin
      const entries = literalEntriesFor(date).filter(
        e => e.path.includes('{district}') && districtsOf(e).includes(district)
      )
      expect(
        entries.map(e => e.path),
        `no manifest path pins ${date} for district ${district}; a relative token like {ago14} moves with the latest snapshot`
      ).not.toEqual([])
    }
  )
})
