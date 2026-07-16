/**
 * Self-test for the CDN fixture harness's snapshot-date honesty (#1322, epic
 * #1319 Sprint 3).
 *
 * The harness is the thing every page/journey test trusts, so its own
 * divergence contract needs a guard. Two properties, and BOTH must hold or the
 * divergence-by-default fixtures are decoration:
 *
 *  1. `sourceCsvDate` diverges from the snapshot date by default, so every test
 *     runs inside the month-end closing window.
 *  2. `/snapshots/{date}/…` resolves ONLY under a date the bucket really has.
 *     Property 1 without property 2 is inert: the route table matches on
 *     `path.includes(filename)` and is otherwise date-blind, so a consumer
 *     keying on the as-of date would be handed the snapshot's own fixture and
 *     pass — reproducing the #1315 blind spot inside the harness meant to catch
 *     it.
 *
 * @see tasks/lessons/lessons/key-per-snapshot-fetches-on-the-snapshot-date-not-the-as-of-sourcecsvdate.md
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  setupCdnFetchMock,
  cdnMocks,
  SNAPSHOT_DATE,
  SOURCE_CSV_DATE,
  KNOWN_SNAPSHOT_DATES,
} from './utils/mockCdnData'

const baseUrl = 'https://cdn.taverns.red'
const originalFetch = global.fetch

// Block body, not a concise arrow: `setupCdnFetchMock` RETURNS the mock fn, and
// vitest treats a function returned from beforeEach as that test's teardown —
// it would call the fetch mock with no args at cleanup (`input.toString()` of
// undefined). Swallow the return value.
beforeEach(() => {
  setupCdnFetchMock()
})
afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('CDN fixture harness — snapshot-date honesty (#1322)', () => {
  it('diverges the as-of sourceCsvDate from the snapshot date by default', () => {
    // The whole guard rests on this: equal dates make the wrong keying
    // unobservable, which is how #1315 shipped.
    expect(SOURCE_CSV_DATE).not.toEqual(SNAPSHOT_DATE)
    expect(SOURCE_CSV_DATE > SNAPSHOT_DATE).toBe(true)
  })

  it('never lists the as-of date as a snapshot date', () => {
    // The as-of date is display/provenance only — no file is stored under it.
    expect(KNOWN_SNAPSHOT_DATES).toContain(SNAPSHOT_DATE)
    expect(KNOWN_SNAPSHOT_DATES).not.toContain(SOURCE_CSV_DATE)
  })

  it('serves the per-snapshot rankings file under the snapshot date, carrying the advanced as-of date', async () => {
    const res = await fetch(
      `${baseUrl}/snapshots/${SNAPSHOT_DATE}/all-districts-rankings.json`
    )
    expect(res.ok).toBe(true)
    const body = (await res.json()) as { metadata: { sourceCsvDate: string } }
    expect(body.metadata.sourceCsvDate).toBe(SOURCE_CSV_DATE)
  })

  it('404s a per-snapshot file requested under the as-of date', async () => {
    // This is the live behaviour a wrongly-keyed consumer hits during closing:
    // no file exists under the as-of date. `fetchCdnCompetitiveAwards` maps the
    // 404 to null → the blank UI of #1315.
    const res = await fetch(
      `${baseUrl}/snapshots/${SOURCE_CSV_DATE}/competitive-awards.json`
    )
    expect(res.ok).toBe(false)
    expect(res.status).toBe(404)
  })

  it('404s every per-snapshot path under an unknown date, not just awards', async () => {
    // The gate is keyed on the date segment, so it must hold for the whole
    // /snapshots/{date}/ family — a per-file allowlist would rot.
    for (const file of [
      'all-districts-rankings.json',
      'district_61.json',
      'analytics/district_61_analytics.json',
    ]) {
      const res = await fetch(`${baseUrl}/snapshots/${SOURCE_CSV_DATE}/${file}`)
      expect(res.status).toBe(404)
    }
  })

  it('still serves undated v1 routes, which are not snapshot-scoped', async () => {
    // Guard against the date gate over-reaching: v1/latest.json has no snapshot
    // date segment and must stay reachable.
    const res = await fetch(`${baseUrl}/v1/latest.json`)
    expect(res.ok).toBe(true)
    expect(await res.json()).toEqual(cdnMocks.latest)
  })

  it('exposes the latest snapshot manifest and the rankings as-of date as DIFFERENT dates', async () => {
    // v1/latest.json pins the snapshot; v1/rankings.json carries the as-of date
    // as a bare `date`. Conflating the two is the root of the bug class.
    const manifest = (await (
      await fetch(`${baseUrl}/v1/latest.json`)
    ).json()) as { latestSnapshotDate: string }
    const rankings = (await (
      await fetch(`${baseUrl}/v1/rankings.json`)
    ).json()) as { date: string }

    expect(manifest.latestSnapshotDate).toBe(SNAPSHOT_DATE)
    expect(rankings.date).toBe(SOURCE_CSV_DATE)
    expect(rankings.date).not.toBe(manifest.latestSnapshotDate)
  })
})
