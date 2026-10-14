/**
 * Per-date completeness gate (#1761, ADR-015 P5.2 / migration step 3).
 *
 * The question no other gate asks: for each date this run touched, did
 * staging end up with at least what production already has for that date?
 * FAC loss (D-1: club records 36 → 25 keys, `clubsByCountry.countries`
 * 158 → 0) and subset rollups (D-2: `totalDistricts` 94 → 1) passed the
 * count, value and content gates.
 *
 * The fake bucket answers `getFiles` the way @google-cloud/storage 8.2.0
 * does with `fields` set (plain `{name,size,md5Hash,crc32c[,contentEncoding]}`
 * items, #1727), pinned key-for-key to the recorded listing; the objects are
 * real snapshot files (fixtures/date-completeness/README.md).
 */

import { describe, it, expect } from 'vitest'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  buildCompletenessGateSummary,
  compareDateProfiles,
  districtShape,
  evaluateCompletenessGate,
  perDateSampleSize,
  runCompletenessGate,
  sampleDistricts,
  type DateProfile,
} from '../dateCompletenessGate.js'
import type { GateBucket } from '../promotionContentGateIo.js'

const FIX = path.resolve(__dirname, 'fixtures/date-completeness')
const load = (f: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf-8'))

const RECORDED = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, 'fixtures/gcs-get-files/with-fields.json'),
    'utf-8'
  )
) as { items: Array<Record<string, string>> }

interface Stored {
  bytes: Uint8Array
  contentEncoding?: string
}

const gz = (value: unknown): Stored => ({
  bytes: gzipSync(Buffer.from(JSON.stringify(value))),
  contentEncoding: 'gzip',
})

/** A bucket answering like @google-cloud/storage 8.2.0 (see the header). */
function fakeBucket(objects: Record<string, Stored>): GateBucket & {
  queries: Array<Record<string, unknown>>
  downloads: string[]
} {
  const queries: Array<Record<string, unknown>> = []
  const downloads: string[] = []
  return {
    queries,
    downloads,
    async getFiles(query) {
      queries.push(query)
      const prefix = String(query.prefix ?? '')
      const items = Object.keys(objects)
        .filter(n => n.startsWith(prefix))
        .sort()
        .map(name => {
          const o = objects[name]!
          const md5 = createHash('md5').update(o.bytes).digest('base64')
          const item: Record<string, string> = {
            name,
            size: String(o.bytes.length),
            md5Hash: md5,
          }
          if (o.contentEncoding) item.contentEncoding = o.contentEncoding
          item.crc32c = md5.slice(0, 8)
          return query.fields ? item : { name, metadata: item }
        })
      return [items]
    },
    file(name) {
      return {
        async download() {
          downloads.push(name)
          const o = objects[name]
          if (!o) throw new Error(`No such object: ${name}`)
          return [o.bytes]
        },
      }
    },
  }
}

const DATE = '2026-10-10'
const dir = `snapshots/${DATE}/`

const prodDistrict = load('prod-district_02.json')
const stagingDistrict = load('staging-district_02.json')
const prodTotals = load('prod-global-totals.json')
const stagingTotals = load('staging-global-totals.json')
const manifest = load('prod-manifest.json')
const metadata = load('prod-metadata.json')

/** One date directory, shaped like a real one (minus most districts). */
function dateTree(over: {
  district?: unknown
  totals?: unknown
  manifest?: unknown
  extra?: Record<string, unknown>
}): Record<string, Stored> {
  const tree: Record<string, unknown> = {
    [`${dir}manifest.json`]: over.manifest ?? manifest,
    [`${dir}metadata.json`]: metadata,
    [`${dir}global-totals.json`]: over.totals ?? prodTotals,
    [`${dir}district_02.json`]: over.district ?? prodDistrict,
    [`${dir}analytics/district_02_analytics.json`]: { metadata: {}, data: {} },
    ...over.extra,
  }
  return Object.fromEntries(Object.entries(tree).map(([k, v]) => [k, gz(v)]))
}

describe('fake bucket matches the recorded SDK listing (#1727)', () => {
  it('lists plain items with the recorded keys', async () => {
    const b = fakeBucket(dateTree({}))
    const [items] = (await b.getFiles({
      prefix: dir,
      fields: 'items(name,size,crc32c,md5Hash,contentEncoding),nextPageToken',
    })) as [Array<Record<string, unknown>>]
    const recordedGz = RECORDED.items.find(i => i.contentEncoding)!
    expect(Object.keys(items[0]!).sort()).toEqual(
      Object.keys(recordedGz).sort()
    )
    expect(typeof items[0]!.size).toBe('string')
  })
})

describe('red-first: FAC loss on a touched date HOLDS (#1758 shape)', () => {
  it('holds, naming the date and the dropped keys', async () => {
    const prod = fakeBucket(dateTree({}))
    const staging = fakeBucket(
      dateTree({ district: stagingDistrict, totals: stagingTotals })
    )
    const r = await runCompletenessGate(staging, prod, [DATE], {
      allowValueChanges: false,
    })
    expect(r.promote).toBe(false)
    const text = r.failures.map(f => `${f.path}: ${f.reason}`).join('\n')
    expect(text).toContain(DATE)
    expect(text).toMatch(/district_02\.json/)
    for (const key of [
      'address',
      'allowsVirtualAttendance',
      'coordinates',
      'meetingDay',
    ]) {
      expect(text).toContain(key)
    }
    expect(text).toContain('prospectiveClubs')
    expect(text).toMatch(/countries.*158.*0/)
    expect(r.reason).toMatch(/HOLD|regress/i)
  })

  it('passes the same pair with allow_value_changes, still listing them', async () => {
    const prod = fakeBucket(dateTree({}))
    const staging = fakeBucket(
      dateTree({ district: stagingDistrict, totals: stagingTotals })
    )
    const r = await runCompletenessGate(staging, prod, [DATE], {
      allowValueChanges: true,
    })
    expect(r.promote).toBe(true)
    expect(r.failures.length).toBeGreaterThan(0)
    expect(r.reason).toMatch(/allow_value_changes/)
  })

  it('passes an equal-shape pair', async () => {
    const r = await runCompletenessGate(
      fakeBucket(dateTree({})),
      fakeBucket(dateTree({})),
      [DATE],
      { allowValueChanges: false }
    )
    expect(r.promote).toBe(true)
    expect(r.failures).toEqual([])
  })
})

describe('retired club contact keys (#2026)', () => {
  /** prod's district file with every email/phone key removed. */
  const withoutContact = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value), (k, v) =>
      k === 'email' || k === 'phone' ? undefined : v
    )

  it('does not hold a re-derived date for dropping email/phone', async () => {
    const prod = fakeBucket(dateTree({}))
    const staging = fakeBucket(
      dateTree({ district: withoutContact(prodDistrict) })
    )
    const r = await runCompletenessGate(staging, prod, [DATE], {
      allowValueChanges: false,
    })
    expect(r.failures).toEqual([])
    expect(r.promote).toBe(true)
  })

  it('leaves the contact keys out of the compared club key sets', () => {
    const shape = districtShape(prodDistrict)!
    expect(shape.clubKeys).not.toContain('email')
    expect(shape.clubKeys).not.toContain('phone')
    expect(shape.clubPerformanceKeys).not.toContain('email')
    expect(shape.clubKeys).toContain('website')
  })
})

describe('runtime stays bounded', () => {
  it('lists only the touched date and reads only the sampled objects', async () => {
    const extra = { [`snapshots/2026-09-30/district_02.json`]: prodDistrict }
    const prod = fakeBucket(dateTree({ extra }))
    const staging = fakeBucket(dateTree({ extra }))
    await runCompletenessGate(staging, prod, [DATE], {
      allowValueChanges: false,
    })
    for (const b of [prod, staging]) {
      expect(b.queries.map(q => q.prefix)).toEqual([dir])
      expect(b.queries.every(q => typeof q.fields === 'string')).toBe(true)
      expect(b.downloads.some(d => d.includes('/analytics/'))).toBe(false)
      expect(b.downloads.some(d => d.includes('2026-09-30'))).toBe(false)
    }
  })

  it('splits a district budget across dates, never below a floor', () => {
    expect(perDateSampleSize(1)).toBeGreaterThanOrEqual(130)
    expect(perDateSampleSize(110)).toBeGreaterThanOrEqual(3)
    expect(perDateSampleSize(110) * 110).toBeLessThanOrEqual(400)
  })

  it('samples evenly and deterministically', () => {
    const ids = Array.from({ length: 94 }, (_, i) => String(i + 1))
    expect(sampleDistricts(ids, 200)).toEqual(ids)
    const s = sampleDistricts(ids, 3)
    expect(s).toHaveLength(3)
    expect(s).toEqual(sampleDistricts(ids, 3))
    expect(s[0]).toBe('1')
  })
})

describe('regressions that hold', () => {
  const profile = (over: Partial<DateProfile> = {}): DateProfile => ({
    objectNames: ['a.json', 'b.json', 'c.json'],
    manifestDistricts: 94,
    metadataDistricts: 94,
    globalClubs: 14513,
    globalCountries: 158,
    districts: {},
    ...over,
  })

  it('a new date (no prod baseline) passes', () => {
    expect(compareDateProfiles(DATE, null, profile())).toEqual([])
  })

  it('a touched date with nothing in staging holds', () => {
    expect(compareDateProfiles(DATE, profile(), null)).toHaveLength(1)
  })

  it('fewer objects holds and names the missing ones', () => {
    const r = compareDateProfiles(
      DATE,
      profile(),
      profile({ objectNames: ['a.json'] })
    )
    expect(r[0]!.reason).toMatch(/1 object.*3/)
    expect(r[0]!.reason).toContain('b.json')
  })

  it('a subset rollup (D-2) holds on every count', () => {
    const r = compareDateProfiles(
      DATE,
      profile(),
      profile({
        manifestDistricts: 1,
        metadataDistricts: 1,
        globalClubs: 161,
      })
    )
    const paths = r.map(x => x.path)
    expect(paths).toEqual(
      expect.arrayContaining([
        `snapshots/${DATE}/manifest.json`,
        `snapshots/${DATE}/metadata.json`,
        `snapshots/${DATE}/global-totals.json`,
      ])
    )
  })

  it('absent in staging is a regression, not a measured zero', () => {
    const r = compareDateProfiles(
      DATE,
      profile(),
      profile({ globalCountries: null })
    )
    expect(r[0]!.reason).toMatch(/absent/)
  })

  it('a field prod never had is not required', () => {
    expect(
      compareDateProfiles(
        DATE,
        profile({ globalCountries: null }),
        profile({ globalCountries: null })
      )
    ).toEqual([])
  })

  it('more is never a regression', () => {
    expect(
      compareDateProfiles(
        DATE,
        profile(),
        profile({ globalClubs: 14600, objectNames: ['a', 'b', 'c', 'd'] })
      )
    ).toEqual([])
  })
})

describe('districtShape', () => {
  it('takes the richest prod record, so one unmatched club cannot pass', () => {
    const s = districtShape(prodDistrict)!
    expect(s.clubKeys).toContain('address')
    expect(s.clubPerformanceKeys.length).toBeGreaterThanOrEqual(32)
    expect(s.dataKeys).toContain('prospectiveClubs')
  })

  it('reads the staging shape as observed after a non-daily re-run', () => {
    const s = districtShape(stagingDistrict)!
    expect(s.clubPerformanceKeys).toHaveLength(25)
    expect(s.clubKeys).not.toContain('coordinates')
  })

  it('is null for something that is not a district snapshot', () => {
    expect(districtShape({ nope: true })).toBeNull()
  })
})

describe('evaluate + summary', () => {
  it('an error holds even with allow_value_changes', () => {
    const r = evaluateCompletenessGate({
      dates: [DATE],
      regressions: [],
      allowValueChanges: true,
      error: 'boom',
    })
    expect(r.promote).toBe(false)
    expect(r.reason).toMatch(/failing closed/)
  })

  it('no touched dates passes, and says so', () => {
    const r = evaluateCompletenessGate({
      dates: [],
      regressions: [],
      allowValueChanges: false,
    })
    expect(r.promote).toBe(true)
    expect(r.reason).toMatch(/no dates/)
  })

  it('names the held dates, so scoped promotion (#1763) can hold only them', () => {
    const other = '2026-10-11'
    const held = evaluateCompletenessGate({
      dates: [DATE, other],
      regressions: [
        { date: DATE, path: `${dir}global-totals.json`, reason: 'x' },
        { date: DATE, path: `${dir}manifest.json`, reason: 'y' },
      ],
      allowValueChanges: false,
    })
    expect(held.heldDates).toEqual([DATE])
    // An override promotes every date; an error names none (hold all).
    expect(
      evaluateCompletenessGate({
        dates: [DATE],
        regressions: [{ date: DATE, path: dir, reason: 'x' }],
        allowValueChanges: true,
      }).heldDates
    ).toEqual([])
    expect(
      evaluateCompletenessGate({
        dates: [DATE],
        regressions: [],
        allowValueChanges: false,
        error: 'boom',
      }).heldDates
    ).toEqual([])
  })

  it('the summary names each held date and reason', () => {
    const r = evaluateCompletenessGate({
      dates: [DATE],
      regressions: [
        { date: DATE, path: `${dir}global-totals.json`, reason: 'x' },
      ],
      allowValueChanges: false,
    })
    const md = buildCompletenessGateSummary(r)
    expect(md).toContain('HOLD')
    expect(md).toContain(`${dir}global-totals.json`)
  })
})
