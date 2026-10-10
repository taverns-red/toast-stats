/**
 * Value-diff fetch plan from bucket listings (#1730, plan E2-4).
 *
 * The listings are recorded from the real `gcloud storage objects list
 * --format=json` call (fixtures/gcs-objects-list/README.md). Variations are
 * made by cloning a recorded entry, so the shape can't drift from reality.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  parseRankingsListing,
  planValueDiffFetch,
} from '../SnapshotListingHashes.js'

type Entry = Record<string, unknown>

const FIXTURE_DIR = fileURLToPath(
  new URL('./fixtures/gcs-objects-list/', import.meta.url)
)
function recorded(file: string): Entry[] {
  return JSON.parse(readFileSync(FIXTURE_DIR + file, 'utf8')) as Entry[]
}
const STAGING = (): Entry[] => recorded('staging-rankings.json')
const PROD = (): Entry[] => recorded('prod-rankings.json')
const RECORDED_DATES = ['2017-01-31', '2026-09-30', '2026-10-08', '2026-10-09']

function nameOf(date: string): string {
  return `snapshots/${date}/all-districts-rankings.json`
}
/** The live (current-generation) entry for a date in a recorded listing. */
function live(listing: Entry[], date: string): Entry {
  const e = listing.find(
    x => x['name'] === nameOf(date) && x['noncurrent_time'] === undefined
  )
  if (!e) throw new Error(`no live entry for ${date}`)
  return e
}

describe('recorded listing shape (guards the fixture itself)', () => {
  it('uses crc32c_hash / md5_hash keys and carries a noncurrent generation', () => {
    const prod = PROD()
    expect(live(prod, '2026-10-08')).toMatchObject({
      name: nameOf('2026-10-08'),
      crc32c_hash: expect.any(String),
      md5_hash: expect.any(String),
      content_encoding: 'gzip',
    })
    const gens = prod.filter(x => x['name'] === nameOf('2017-01-31'))
    expect(gens).toHaveLength(2)
    expect(gens.filter(x => x['noncurrent_time'] !== undefined)).toHaveLength(1)
  })
})

describe('parseRankingsListing', () => {
  it('maps each date to its live object hashes, ignoring noncurrent generations', () => {
    const map = parseRankingsListing(PROD())
    expect(map).not.toBeNull()
    expect([...map!.keys()].sort()).toEqual(RECORDED_DATES)
    const live2017 = live(PROD(), '2017-01-31')
    expect(map!.get('2017-01-31')).toEqual({
      crc32c: live2017['crc32c_hash'],
      md5: live2017['md5_hash'],
    })
  })

  it('returns null for a listing that is not an array (unusable)', () => {
    expect(parseRankingsListing(undefined)).toBeNull()
    expect(parseRankingsListing({ items: [] })).toBeNull()
    expect(parseRankingsListing('[]')).toBeNull()
  })

  it('returns null when an entry is not an object (unusable)', () => {
    expect(parseRankingsListing([...STAGING(), 'oops'])).toBeNull()
  })

  it('ignores objects that are not a dated all-districts-rankings.json', () => {
    const other = {
      ...live(STAGING(), '2026-10-08'),
      name: 'snapshots/2026-10-08/district_61.json',
    }
    const map = parseRankingsListing([other])
    expect(map!.size).toBe(0)
  })

  it('marks a date with two live entries as ambiguous', () => {
    const a = live(STAGING(), '2026-10-08')
    const map = parseRankingsListing([a, { ...a, crc32c_hash: 'AAAAAA==' }])
    expect(map!.get('2026-10-08')).toBe('ambiguous')
  })
})

describe('planValueDiffFetch', () => {
  it('skips every overlap date whose live hashes are equal (recorded steady state)', () => {
    const plan = planValueDiffFetch(RECORDED_DATES, STAGING(), PROD())
    expect(plan.fullFetch).toBe(false)
    expect(plan.hashEqual).toEqual(RECORDED_DATES)
    expect(plan.fetch).toEqual([])
  })

  it('fetches only the date whose hash differs', () => {
    const staging = STAGING().map(e =>
      e['name'] === nameOf('2026-10-09') ? { ...e, md5_hash: 'changed==' } : e
    )
    const plan = planValueDiffFetch(RECORDED_DATES, staging, PROD())
    expect(plan.fetch).toEqual(['2026-10-09'])
    expect(plan.hashEqual).toEqual(['2017-01-31', '2026-09-30', '2026-10-08'])
  })

  it('a crc32c mismatch alone is a difference even when md5 is absent (composite object)', () => {
    const strip = (e: Entry): Entry => {
      const { md5_hash: _drop, ...rest } = e
      return rest
    }
    const staging = STAGING().map(e =>
      e['name'] === nameOf('2026-10-08')
        ? { ...strip(e), crc32c_hash: 'changed=' }
        : e
    )
    const prod = PROD().map(e =>
      e['name'] === nameOf('2026-10-08') ? strip(e) : e
    )
    const plan = planValueDiffFetch(['2026-10-08'], staging, prod)
    expect(plan.fetch).toEqual(['2026-10-08'])
  })

  it('matching crc32c with no md5 on either side counts as equal', () => {
    const strip = (e: Entry): Entry => {
      const { md5_hash: _drop, ...rest } = e
      return rest
    }
    const plan = planValueDiffFetch(
      ['2026-10-08'],
      STAGING().map(strip),
      PROD().map(strip)
    )
    expect(plan.hashEqual).toEqual(['2026-10-08'])
  })

  it('fetches a date that exists on only one side, so it is flagged as today', () => {
    const staging = STAGING().filter(e => e['name'] !== nameOf('2026-09-30'))
    const prod = PROD().filter(e => e['name'] !== nameOf('2026-10-09'))
    const plan = planValueDiffFetch(RECORDED_DATES, staging, prod)
    expect(plan.fetch).toEqual(['2026-09-30', '2026-10-09'])
    expect(plan.hashEqual).toEqual(['2017-01-31', '2026-10-08'])
  })

  it('compares the LIVE prod generation, not a noncurrent one', () => {
    // Prod's noncurrent 2017-01-31 differs from staging; the live one matches.
    const plan = planValueDiffFetch(['2017-01-31'], STAGING(), PROD())
    expect(plan.hashEqual).toEqual(['2017-01-31'])
    // Drop prod's live generation: only the stale one is left, so fetch.
    const prodStaleOnly = PROD().filter(
      e =>
        e['name'] !== nameOf('2017-01-31') || e['noncurrent_time'] !== undefined
    )
    const plan2 = planValueDiffFetch(['2017-01-31'], STAGING(), prodStaleOnly)
    expect(plan2.fetch).toEqual(['2017-01-31'])
  })

  it('fetches a date whose entries have no usable hash', () => {
    const noHash = (e: Entry): Entry => {
      const { md5_hash: _m, crc32c_hash: _c, ...rest } = e
      return rest
    }
    const plan = planValueDiffFetch(
      ['2026-10-08'],
      STAGING().map(noHash),
      PROD().map(noHash)
    )
    expect(plan.fetch).toEqual(['2026-10-08'])
    expect(plan.hashEqual).toEqual([])
  })

  it('fetches a date with two live entries on a side (ambiguous)', () => {
    const a = live(STAGING(), '2026-10-08')
    const plan = planValueDiffFetch(['2026-10-08'], [a, { ...a }], PROD())
    expect(plan.fetch).toEqual(['2026-10-08'])
  })

  it('falls back to a full fetch when either listing is unusable', () => {
    for (const [s, p] of [
      [undefined, PROD()],
      [STAGING(), undefined],
      [{ error: 'x' }, PROD()],
      [STAGING(), [null]],
    ] as const) {
      const plan = planValueDiffFetch(RECORDED_DATES, s, p)
      expect(plan.fullFetch).toBe(true)
      expect(plan.fetch).toEqual(RECORDED_DATES)
      expect(plan.hashEqual).toEqual([])
      expect(plan.reason).toMatch(/full fetch/)
    }
  })

  it('only plans overlap dates and keeps their order', () => {
    const plan = planValueDiffFetch(['2026-10-09', '2026-10-08'], STAGING(), [])
    expect(plan.fetch).toEqual(['2026-10-09', '2026-10-08'])
    expect(plan.hashEqual).toEqual([])
  })
})
