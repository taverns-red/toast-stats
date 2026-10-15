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

describe('a #1671 source gap recorded in staging (#2038)', () => {
  const junkU = load('prod-district_U-gap-junk.json')
  const meta = metadata as {
    successfulDistricts: string[]
    failedDistricts: string[]
    errors: string[]
  }
  const man = manifest as { successfulDistricts: number }
  const GAP_U =
    'U: Skipped: club-performance.csv for district U on 2018-04-18 is not a CSV (body is HTML (starts "<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML…"), not a CSV) — a gap, not zero clubs (#1671)'

  /** Staging metadata/manifest as the #2036 rebuild writes them. */
  const gapRollups = (
    opts: { drop?: string[]; reason?: string } = {}
  ): Record<string, unknown> => {
    const drop = new Set(['U', ...(opts.drop ?? [])])
    return {
      [`${dir}metadata.json`]: {
        ...meta,
        status: 'partial',
        successfulDistricts: meta.successfulDistricts.filter(
          id => !drop.has(id)
        ),
        failedDistricts: ['U'],
        errors: [opts.reason ?? GAP_U],
      },
      [`${dir}manifest.json`]: {
        ...man,
        successfulDistricts: man.successfulDistricts - drop.size,
        failedDistricts: 1,
      },
    }
  }
  const uObjects = (district: unknown = junkU): Record<string, unknown> => ({
    [`${dir}district_U.json`]: district,
    [`${dir}analytics/district_U_analytics.json`]: { metadata: {}, data: {} },
  })
  const tree = (objects: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(objects).map(([k, v]) => [k, gz(v)]))
  const run = (prod: Record<string, Stored>, staging: Record<string, Stored>) =>
    runCompletenessGate(fakeBucket(staging), fakeBucket(prod), [DATE], {
      allowValueChanges: false,
    })

  it('the fixtures are the real shapes: U counted in prod, junk has 0 clubs', () => {
    expect(meta.successfulDistricts).toContain('U')
    const data = (junkU as { data: { clubs: unknown[] } }).data
    expect(data.clubs).toEqual([])
  })

  it('does not hold when the stale junk objects are still in staging', async () => {
    const prod = { ...dateTree({ extra: uObjects() }) }
    const staging = {
      ...dateTree({ extra: uObjects() }),
      ...tree(gapRollups()),
    }
    const r = await run(prod, staging)
    expect(r.failures).toEqual([])
    expect(r.promote).toBe(true)
  })

  it('does not hold once the junk objects are removed from staging', async () => {
    const prod = dateTree({ extra: uObjects() })
    const staging = { ...dateTree({}), ...tree(gapRollups()) }
    const r = await run(prod, staging)
    expect(r.failures).toEqual([])
    expect(r.promote).toBe(true)
  })

  it('still holds a district that is genuinely missing beside the gap', async () => {
    const prod = dateTree({ extra: uObjects() })
    const staging = {
      ...dateTree({ extra: uObjects() }),
      ...tree(gapRollups({ drop: ['03'] })),
    }
    const r = await run(prod, staging)
    expect(r.promote).toBe(false)
    const paths = r.failures.map(f => f.path)
    expect(paths).toEqual(
      expect.arrayContaining([`${dir}metadata.json`, `${dir}manifest.json`])
    )
  })

  it('holds a failure whose reason is not a source gap', async () => {
    const prod = dateTree({ extra: uObjects() })
    const staging = {
      ...dateTree({ extra: uObjects() }),
      ...tree(
        gapRollups({
          reason: 'U: Raw CSV data not found for district U on 2018-03-31',
        })
      ),
    }
    const r = await run(prod, staging)
    expect(r.promote).toBe(false)
    expect(r.failures.map(f => f.path)).toContain(`${dir}metadata.json`)
  })

  it('holds a gap where production has real clubs for that district', async () => {
    const realU = {
      ...(prodDistrict as Record<string, unknown>),
      districtId: 'U',
    }
    const prod = dateTree({ extra: uObjects(realU) })
    const staging = { ...dateTree({}), ...tree(gapRollups()) }
    const r = await run(prod, staging)
    expect(r.promote).toBe(false)
    const text = r.failures.map(f => `${f.path}: ${f.reason}`).join('\n')
    expect(text).toMatch(/district_U\.json.*source gap.*3 club/)
    expect(text).toContain(`${dir}metadata.json`)
  })

  it('reads production only for the gap district, not the date tree', async () => {
    const prod = fakeBucket(dateTree({ extra: uObjects() }))
    const staging = fakeBucket({ ...dateTree({}), ...tree(gapRollups()) })
    await runCompletenessGate(staging, prod, [DATE], {
      allowValueChanges: false,
    })
    expect(prod.downloads.some(d => d.includes('/analytics/'))).toBe(false)
    expect(prod.downloads.filter(d => d.endsWith('district_U.json'))).toEqual([
      `${dir}district_U.json`,
    ])
  })
})

describe('gap credit in compareDateProfiles (#2038)', () => {
  const base = (over: Partial<DateProfile> = {}): DateProfile => ({
    objectNames: ['district_01.json', 'district_U.json', 'metadata.json'],
    manifestDistricts: 2,
    metadataDistricts: 2,
    metadataDistrictIds: ['01', 'U'],
    globalClubs: null,
    globalCountries: null,
    districts: {},
    clubCounts: { U: 0 },
    ...over,
  })

  it('credits a gap only for a district production counted', () => {
    // prod already listed U as failed: 1 counted. Staging lost 01 and
    // records U as a gap; U cannot stand in for 01.
    const prod = base({
      manifestDistricts: 1,
      metadataDistricts: 1,
      metadataDistrictIds: ['01'],
    })
    const staging = base({
      manifestDistricts: 0,
      metadataDistricts: 0,
      metadataDistrictIds: [],
      gapDistricts: ['U'],
    })
    const r = compareDateProfiles(DATE, prod, staging)
    expect(r.map(x => x.path)).toEqual(
      expect.arrayContaining([
        `snapshots/${DATE}/manifest.json`,
        `snapshots/${DATE}/metadata.json`,
      ])
    )
  })

  it('takes no credit when production has no district list to check', () => {
    const prod = base({ metadataDistrictIds: undefined })
    const staging = base({
      manifestDistricts: 1,
      metadataDistricts: 1,
      metadataDistrictIds: ['01'],
      gapDistricts: ['U'],
    })
    expect(compareDateProfiles(DATE, prod, staging).length).toBeGreaterThan(0)
  })

  it('a gap production cannot read is not excused', () => {
    const prod = base({ clubCounts: { U: null } })
    const staging = base({
      objectNames: ['district_01.json', 'metadata.json'],
      manifestDistricts: 1,
      metadataDistricts: 1,
      metadataDistrictIds: ['01'],
      gapDistricts: ['U'],
    })
    const r = compareDateProfiles(DATE, prod, staging)
    expect(r.map(x => x.reason).join('\n')).toMatch(/could not be read/)
  })

  it('a gap production never had a file for is excused', () => {
    const prod = base({
      objectNames: ['district_01.json', 'metadata.json'],
      clubCounts: {},
    })
    const staging = base({
      objectNames: ['district_01.json', 'metadata.json'],
      manifestDistricts: 1,
      metadataDistricts: 1,
      metadataDistrictIds: ['01'],
      gapDistricts: ['U'],
    })
    expect(compareDateProfiles(DATE, prod, staging)).toEqual([])
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

describe('retired analytics files are not a regression (#1798)', () => {
  // Compute stopped writing these 8 per-district files (#1798); prod keeps
  // its old copies until a separately approved cleanup. A re-touch of an
  // already-promoted date must not hold because staging no longer has them.
  const RETIRED = [
    'membership',
    'clubhealth',
    'membership-analytics',
    'vulnerable-clubs',
    'leadership-insights',
    'distinguished-analytics',
    'year-over-year',
    'club-trends-index',
  ]
  const retiredFiles = (id: string) =>
    RETIRED.map(t => `analytics/district_${id}_${t}.json`)
  const kept = (id: string) => [
    `analytics/district_${id}_analytics.json`,
    `analytics/district_${id}_performance-targets.json`,
  ]
  const profile = (objectNames: string[]): DateProfile => ({
    objectNames: [...objectNames].sort(),
    manifestDistricts: 94,
    metadataDistricts: 94,
    globalClubs: 14513,
    globalCountries: 158,
    districts: {},
  })
  const base = ['manifest.json', 'metadata.json', 'district_61.json']

  it('a rebuild missing only retired files passes', () => {
    const prod = profile([...base, ...kept('61'), ...retiredFiles('61')])
    const staging = profile([...base, ...kept('61')])
    expect(compareDateProfiles(DATE, prod, staging)).toEqual([])
  })

  it('a rebuild missing a non-retired analytics file still holds, naming only it', () => {
    const prod = profile([...base, ...kept('61'), ...retiredFiles('61')])
    const staging = profile([...base, 'analytics/district_61_analytics.json'])
    const r = compareDateProfiles(DATE, prod, staging)
    expect(r).toHaveLength(1)
    expect(r[0]!.reason).toContain('district_61_performance-targets.json')
    for (const t of RETIRED) {
      expect(r[0]!.reason).not.toContain(`district_61_${t}.json`)
    }
  })

  it('stale retired copies in staging cannot mask a missing live file', () => {
    const prod = profile([...base, ...kept('61'), ...retiredFiles('61')])
    // Staging still holds old retired copies (more objects in total) but
    // lost the district snapshot.
    const staging = profile([
      'manifest.json',
      'metadata.json',
      ...kept('61'),
      ...retiredFiles('61'),
      ...retiredFiles('62'),
    ])
    const r = compareDateProfiles(DATE, prod, staging)
    expect(r).toHaveLength(1)
    expect(r[0]!.reason).toContain('district_61.json')
  })

  it('only the exact retired names are exempt', () => {
    const prod = profile([
      ...base,
      'analytics/district_61_membership-extra.json',
      'district_61_clubhealth.json',
    ])
    const r = compareDateProfiles(DATE, prod, profile(base))
    expect(r).toHaveLength(1)
    expect(r[0]!.reason).toContain('district_61_membership-extra.json')
    expect(r[0]!.reason).toContain('district_61_clubhealth.json')
  })

  it('end to end: prod with retired copies vs a staging rebuild passes', async () => {
    const retiredObjects = Object.fromEntries(
      retiredFiles('02').map(f => [`${dir}${f}`, { metadata: {}, data: {} }])
    )
    const prod = fakeBucket(dateTree({ extra: retiredObjects }))
    const staging = fakeBucket(dateTree({}))
    const r = await runCompletenessGate(staging, prod, [DATE], {
      allowValueChanges: false,
    })
    expect(r.failures).toEqual([])
    expect(r.promote).toBe(true)
  })
})
