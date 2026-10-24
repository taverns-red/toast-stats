/**
 * Find-A-Club continuity in the completeness gate (#2239 AC3).
 *
 * The same-date gate compares staging with production, so once production
 * is stripped it has no memory: in #2237, 81 prod dates lost their FAC data
 * and the later rebuilds of those dates passed, because staging matched the
 * stripped prod copy. These tests hold the gate to two more questions for a
 * date in the FAC era (2026-05-15 on):
 *   - does each sampled district keep the FAC coverage of the nearest
 *     earlier production dates (best of the last 3)?
 *   - is the date FAC-merged at all? A stripped baseline cannot answer
 *     this one, so a whole stripped run of dates still holds.
 *
 * District files are built from the real date-completeness fixtures
 * (`prod-district_02.json`, enriched; `staging-district_02.json`, the
 * stripped shape) by repeating their club rows under new ids. The fake
 * bucket answers `getFiles` like @google-cloud/storage 8.2.0 with `fields`
 * (see dateCompletenessGate.test.ts).
 */

import { describe, it, expect } from 'vitest'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  buildCompletenessGateSummary,
  buildFacWarningBody,
  runCompletenessGate,
} from '../dateCompletenessGate.js'
import {
  FAC_ENRICHED_SINCE,
  FAC_KNOWN_UNENRICHED_DATES,
  FAC_HOLD_MIN_DISTRICTS,
  compareFacContinuity,
  facBaselineDates,
  facCheckApplies,
  facCoverage,
  type FacBaseline,
  type FacCoverage,
  type FacFindings,
} from '../facContinuity.js'
import type { GateBucket } from '../promotionContentGateIo.js'

const FIX = path.resolve(__dirname, 'fixtures/date-completeness')
const load = (f: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf-8'))

const enriched = load('prod-district_02.json')
const stripped = load('staging-district_02.json')

type Row = Record<string, unknown>
const dataOf = (v: Record<string, unknown>) => v.data as Row
const clubsOf = (v: Record<string, unknown>) => dataOf(v).clubs as Row[]

/** clubs[0] is FAC-matched, clubs[2] is in the snapshot but not in FAC. */
const MATCHED = clubsOf(enriched)[0]!
const UNMATCHED = clubsOf(enriched)[2]!

/**
 * A district file of `clubs` rows, the first `fac` of them FAC-matched (less
 * the keys in `drop`), the rest unmatched. Merged (the merge's
 * `prospectiveClubs` mark) when `merged`, default: any club matched.
 */
function district(o: {
  clubs: number
  fac: number
  merged?: boolean
  drop?: string[]
  id?: string
}): Record<string, unknown> {
  const drop = new Set(o.drop ?? [])
  const rows = Array.from({ length: o.clubs }, (_, i) => {
    const src = i < o.fac ? MATCHED : UNMATCHED
    const row: Row = { ...src, clubId: String(10000 + i) }
    for (const k of drop) if (i < o.fac) delete row[k]
    return row
  })
  const data: Row = { ...dataOf(stripped), clubs: rows }
  if (o.merged ?? o.fac > 0) {
    data.prospectiveClubs = dataOf(enriched).prospectiveClubs
  }
  return { ...stripped, districtId: o.id ?? '02', data }
}

const cov = (
  clubs: number,
  fac: number,
  merged = fac > 0,
  over: Partial<FacCoverage> = {}
): FacCoverage => ({
  clubs,
  merged,
  coordinates: fac,
  address: fac,
  meeting: fac,
  ...over,
})

// ── Fake bucket ─────────────────────────────────────────────────────────────

interface Stored {
  bytes: Uint8Array
  contentEncoding?: string
}

const gz = (value: unknown): Stored => ({
  bytes: gzipSync(Buffer.from(JSON.stringify(value))),
  contentEncoding: 'gzip',
})

function fakeBucket(objects: Record<string, unknown>): GateBucket & {
  queries: Array<Record<string, unknown>>
  downloads: string[]
} {
  const stored = Object.fromEntries(
    Object.entries(objects).map(([k, v]) => [k, gz(v)])
  )
  const queries: Array<Record<string, unknown>> = []
  const downloads: string[] = []
  return {
    queries,
    downloads,
    async getFiles(query) {
      queries.push(query)
      const prefix = String(query.prefix ?? '')
      const items = Object.keys(stored)
        .filter(n => n.startsWith(prefix))
        .sort()
        .map(name => {
          const o = stored[name]!
          const md5 = createHash('md5').update(o.bytes).digest('base64')
          const item: Record<string, string> = {
            name,
            size: String(o.bytes.length),
            md5Hash: md5,
            crc32c: md5.slice(0, 8),
          }
          if (o.contentEncoding) item.contentEncoding = o.contentEncoding
          return query.fields ? item : { name, metadata: item }
        })
      return [items]
    },
    file(name) {
      return {
        async download() {
          downloads.push(name)
          const o = stored[name]
          if (!o) throw new Error(`No such object: ${name}`)
          return [o.bytes]
        },
      }
    },
  }
}

/** prod's `v1/dates.json`, shaped like the CDN index (CdnDatesIndex). */
const datesIndex = (dates: string[]) => ({
  'v1/dates.json': {
    _format: { version: '1.0.0', type: 'dates-index' },
    dates,
    count: dates.length,
    generatedAt: '2026-10-24T09:10:00.000Z',
  },
})

/** `snapshots/<date>/district_<id>.json` for each (id → file). */
const day = (date: string, files: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(files).map(([id, f]) => [
      `snapshots/${date}/district_${id}.json`,
      f,
    ])
  )

const D61_ENRICHED = () => district({ clubs: 162, fac: 158, id: '61' })
const D61_STRIPPED = () =>
  district({ clubs: 162, fac: 0, merged: false, id: '61' })
const D02_ENRICHED = () => district({ clubs: 204, fac: 196 })
const D02_STRIPPED = () => district({ clubs: 204, fac: 0, merged: false })

const gate = (
  staging: Record<string, unknown>,
  prod: Record<string, unknown>,
  dates: string[],
  allowValueChanges = false
) =>
  runCompletenessGate(fakeBucket(staging), fakeBucket(prod), dates, {
    allowValueChanges,
  })

const text = (r: { failures: Array<{ path: string; reason: string }> }) =>
  r.failures.map(f => `${f.path}: ${f.reason}`).join('\n')

// ── Pure parts ──────────────────────────────────────────────────────────────

describe('facCoverage', () => {
  it('counts the real enriched fixture: 2 of 3 clubs matched, merged', () => {
    expect(facCoverage(enriched)).toEqual({
      clubs: 3,
      merged: true,
      coordinates: 2,
      address: 2,
      meeting: 2,
    })
  })

  it('reads the real stripped shape as unmerged with no coverage', () => {
    expect(facCoverage(stripped)).toEqual({
      clubs: 3,
      merged: false,
      coordinates: 0,
      address: 0,
      meeting: 0,
    })
  })

  it('a coordinates object without numeric lat/lng is not a map point', () => {
    const f = district({ clubs: 2, fac: 2 })
    clubsOf(f)[0]!.coordinates = { lat: null, lng: null }
    expect(facCoverage(f)?.coordinates).toBe(1)
  })

  it('is null for something that is not a district snapshot', () => {
    expect(facCoverage({ data: [] })).toBeNull()
    expect(facCoverage(null)).toBeNull()
  })
})

describe('which dates the check covers', () => {
  it('starts with the FAC era (2026-05-15)', () => {
    expect(FAC_ENRICHED_SINCE).toBe('2026-05-15')
    expect(facCheckApplies('2026-05-14')).toBe(false)
    expect(facCheckApplies('2019-06-30')).toBe(false)
    expect(facCheckApplies('2026-05-15')).toBe(true)
    expect(facCheckApplies('2026-10-24')).toBe(true)
  })

  it('exempts the 39 known-unenriched dates of the #2239 audit, and only them', () => {
    // Group A (6, prod-only source, recovery declined) + group D (33, no source).
    expect(FAC_KNOWN_UNENRICHED_DATES.size).toBe(39)
    for (const d of ['2026-05-30', '2026-06-09', '2026-06-30', '2026-07-26']) {
      expect(facCheckApplies(d)).toBe(false)
    }
    for (const d of ['2026-08-11', '2026-08-30', '2026-09-04', '2026-09-11']) {
      expect(facCheckApplies(d)).toBe(false)
    }
    // Recovered groups B and C, and 08-31 (group C) are not exempt.
    for (const d of ['2026-06-10', '2026-06-29', '2026-07-31', '2026-08-31']) {
      expect(facCheckApplies(d)).toBe(true)
    }
    expect(facCheckApplies('2026-09-12')).toBe(true)
    expect(facCheckApplies('2026-10-08')).toBe(true)
    for (const d of FAC_KNOWN_UNENRICHED_DATES) {
      expect(d >= FAC_ENRICHED_SINCE).toBe(true)
    }
  })

  it('takes the 3 nearest earlier prod dates, skipping exempt and pre-FAC ones', () => {
    const prod = [
      '2026-10-24',
      '2026-07-31',
      '2026-06-29',
      '2026-06-30',
      '2026-07-26',
      '2026-07-27',
      '2026-06-28',
      '2026-06-27',
      '2026-05-31',
      '2026-04-30',
    ]
    expect(facBaselineDates(prod, '2026-07-31')).toEqual([
      '2026-06-29',
      '2026-06-28',
      '2026-06-27',
    ])
    expect(facBaselineDates(prod, '2026-06-10')).toEqual([])
    expect(facBaselineDates(prod, '2026-10-24', 1)).toEqual(['2026-07-31'])
  })
})

describe('compareFacContinuity', () => {
  const DATE = '2026-10-24'
  const base = (date: string, coverage: FacCoverage | null): FacBaseline => ({
    date,
    coverage,
  })
  const all = (r: FacFindings) => [...r.holds, ...r.warnings]
  const none = (r: FacFindings) => {
    expect(r.holds).toEqual([])
    expect(r.warnings).toEqual([])
  }

  /** `n` merged districts 01..n on DATE and on the day before. */
  const districts = (n: number, lost: number) => {
    const ids = Array.from({ length: n }, (_, i) =>
      String(i + 1).padStart(2, '0')
    )
    return {
      staging: Object.fromEntries(
        ids.map((id, i) => [id, i < lost ? cov(162, 0, false) : cov(162, 158)])
      ),
      baselines: Object.fromEntries(
        ids.map(id => [id, [base('2026-10-23', cov(162, 158))]])
      ),
    }
  }

  it('warns, and does not hold, on one district losing its FAC merge', () => {
    const r = compareFacContinuity(
      DATE,
      { '61': cov(162, 0, false), '02': cov(204, 196) },
      {
        '61': [base('2026-10-23', cov(162, 158))],
        '02': [base('2026-10-23', cov(204, 196))],
      }
    )
    expect(r.holds).toEqual([])
    expect(r.warnings.map(x => x.path)).toEqual([
      `snapshots/${DATE}/district_61.json`,
    ])
    expect(r.warnings[0]!.reason).toMatch(/prospectiveClubs/)
    expect(r.warnings[0]!.reason).toContain('2026-10-23')
  })

  it('warns on a significant coverage drop on one still-merged district', () => {
    const r = compareFacContinuity(
      DATE,
      { '61': cov(162, 158, true, { coordinates: 20 }) },
      { '61': [base('2026-10-23', cov(162, 158))] }
    )
    expect(r.holds).toEqual([])
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]!.reason).toMatch(
      /coordinates.*158\/162.*2026-10-23.*20\/162/
    )
  })

  it('warn on few, hold on many: the cut-off is 3 districts', () => {
    expect(FAC_HOLD_MIN_DISTRICTS).toBe(3)
    const at = (lost: number) => {
      const d = districts(10, lost)
      return compareFacContinuity(DATE, d.staging, d.baselines)
    }
    const one = at(1)
    expect(one.holds).toEqual([])
    expect(one.warnings).toHaveLength(1)
    const two = at(2)
    expect(two.holds).toEqual([])
    expect(two.warnings).toHaveLength(2)
    const three = at(3)
    expect(three.warnings).toEqual([])
    expect(three.holds.map(x => x.path)).toEqual([
      `snapshots/${DATE}/district_01.json`,
      `snapshots/${DATE}/district_02.json`,
      `snapshots/${DATE}/district_03.json`,
    ])
  })

  it('passes day-to-day FAC churn (a few clubs)', () => {
    none(
      compareFacContinuity(
        DATE,
        { '61': cov(162, 155) },
        { '61': [base('2026-10-23', cov(162, 158))] }
      )
    )
  })

  it('passes a small district losing fewer than 3 clubs', () => {
    none(
      compareFacContinuity(
        DATE,
        { '61': cov(10, 7) },
        { '61': [base('2026-10-23', cov(10, 9))] }
      )
    )
  })

  it('takes the best of the baseline dates, so one stripped neighbour cannot satisfy it', () => {
    const r = compareFacContinuity(
      DATE,
      { '61': cov(162, 0, false) },
      {
        '61': [
          base('2026-10-23', cov(162, 0, false)),
          base('2026-10-22', cov(162, 158)),
        ],
      }
    )
    expect(all(r).length).toBeGreaterThan(0)
    expect(
      all(r)
        .map(x => x.reason)
        .join('\n')
    ).toContain('2026-10-22')
  })

  it('holds a date whose sampled districts are mostly unmerged, even against stripped baselines (#2237)', () => {
    const r = compareFacContinuity(
      '2026-06-15',
      { '61': cov(162, 0, false), '02': cov(204, 0, false) },
      {
        '61': [base('2026-06-14', cov(162, 0, false))],
        '02': [base('2026-06-14', cov(204, 0, false))],
      }
    )
    expect(r.warnings).toEqual([])
    expect(r.holds).toHaveLength(1)
    expect(r.holds[0]!.path).toBe('snapshots/2026-06-15/')
    expect(r.holds[0]!.reason).toMatch(/0 of 2 sampled district\(s\).*merged/)
  })

  it('the floor turns a per-district warning into a hold', () => {
    const r = compareFacContinuity(
      DATE,
      { '61': cov(162, 0, false), '02': cov(204, 0, false) },
      {
        '61': [base('2026-10-23', cov(162, 158))],
        '02': [base('2026-10-23', cov(204, 196))],
      }
    )
    expect(r.warnings).toEqual([])
    expect(r.holds.map(x => x.path)).toEqual([
      `snapshots/${DATE}/district_02.json`,
      `snapshots/${DATE}/district_61.json`,
      `snapshots/${DATE}/`,
    ])
  })

  it('a legitimately new district (no baseline) does not hold its date', () => {
    none(
      compareFacContinuity(
        DATE,
        { '02': cov(204, 196), '61': cov(162, 158), '130': cov(20, 0, false) },
        {
          '02': [base('2026-10-23', cov(204, 196))],
          '61': [base('2026-10-23', cov(162, 158))],
          '130': [base('2026-10-23', null)],
        }
      )
    )
  })

  it('a removed district (baseline only) is not a FAC loss', () => {
    none(
      compareFacContinuity(
        DATE,
        { '02': cov(204, 196) },
        {
          '02': [base('2026-10-23', cov(204, 196))],
          '61': [base('2026-10-23', cov(162, 158))],
        }
      )
    )
  })

  it('ignores a 0-club district (a #1671 gap file)', () => {
    none(
      compareFacContinuity(
        DATE,
        { '02': cov(204, 196), U: cov(0, 0, false) },
        {
          '02': [base('2026-10-23', cov(204, 196))],
          U: [base('2026-10-23', cov(0, 0, true))],
        }
      )
    )
  })

  it('the first date of a program year compares with the prior year’s last date', () => {
    // At rollover the club list changes (new charters join); coverage is a
    // share of the clubs listed, so it carries over.
    none(
      compareFacContinuity(
        '2026-07-01',
        { '61': cov(150, 146) },
        { '61': [base('2026-06-29', cov(162, 158))] }
      )
    )
  })

  it('does nothing on a known-unenriched date or before the FAC era', () => {
    const lost = { '61': cov(162, 0, false) }
    const had = { '61': [base('2026-06-29', cov(162, 158))] }
    none(compareFacContinuity('2026-06-30', lost, had))
    none(compareFacContinuity('2026-05-14', lost, had))
  })
})

describe('suspended clubs (FAC hides them, #490)', () => {
  /** A 28-club district, 26 with FAC; `suspended` of the matched ones suspended and hidden. */
  const small = (suspended: number) => {
    const f = district({ clubs: 28, fac: 26 })
    clubsOf(f).forEach((row, i) => {
      if (i < suspended) {
        // TI hides a suspended club from Find-A-Club: no FAC fields on it.
        for (const k of [
          'coordinates',
          'address',
          'meetingDay',
          'meetingTime',
        ]) {
          delete row[k]
        }
        row.clubStatus = 'Suspended'
      }
    })
    return f
  }

  it('leaves Suspended clubs out of the numerator and the denominator', () => {
    expect(facCoverage(small(3))).toEqual({
      clubs: 25,
      merged: true,
      coordinates: 23,
      address: 23,
      meeting: 23,
    })
  })

  it('3 suspensions in a 28-club district neither hold nor warn (26/28 → 23/28)', () => {
    const r = compareFacContinuity(
      '2026-11-02',
      { '41': facCoverage(small(3)) },
      { '41': [{ date: '2026-11-01', coverage: facCoverage(small(0)) }] }
    )
    expect(r.holds).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('a FAC loss on the clubs that are not suspended still counts', () => {
    const f = small(3)
    clubsOf(f).forEach((row, i) => {
      if (i >= 3) delete row.coordinates
    })
    const r = compareFacContinuity(
      '2026-11-02',
      { '41': facCoverage(f) },
      { '41': [{ date: '2026-11-01', coverage: facCoverage(small(0)) }] }
    )
    expect(r.warnings.map(x => x.reason).join('\n')).toMatch(/coordinates/)
  })
})

// ── End to end through the gate ─────────────────────────────────────────────

describe('#2237 replay: a rebuild over dates prod already lost', () => {
  // Prod as it stood on 2026-10-14: 05-30..06-29 stripped (06-06..06-09 are
  // exempt group-A dates). The rebuild re-writes 06-15 stripped again.
  const prodDates = [
    '2026-05-30',
    '2026-05-31',
    '2026-06-06',
    '2026-06-07',
    '2026-06-08',
    '2026-06-09',
    '2026-06-10',
    '2026-06-11',
    '2026-06-12',
    '2026-06-13',
    '2026-06-14',
    '2026-06-15',
  ]
  const strippedProd = () => ({
    ...datesIndex(prodDates),
    ...Object.assign(
      {},
      ...prodDates.map(d =>
        day(d, { '02': D02_STRIPPED(), '61': D61_STRIPPED() })
      )
    ),
  })

  it('HOLDS 06-15 although staging matches the stripped prod copy', async () => {
    const staging = day('2026-06-15', {
      '02': D02_STRIPPED(),
      '61': D61_STRIPPED(),
    })
    const r = await gate(staging, strippedProd(), ['2026-06-15'])
    expect(r.promote).toBe(false)
    expect(r.heldDates).toEqual(['2026-06-15'])
    expect(text(r)).toMatch(/2026-06-15.*Find-A-Club/)
  })

  it('passes the same rebuild once it carries the FAC fields (#2238)', async () => {
    const staging = day('2026-06-15', {
      '02': D02_ENRICHED(),
      '61': D61_ENRICHED(),
    })
    const r = await gate(staging, strippedProd(), ['2026-06-15'])
    expect(r.failures).toEqual([])
    expect(r.promote).toBe(true)
  })

  it('HOLDS the original strip (10-07 shape: prod still enriched)', async () => {
    const enrichedDays = ['2026-06-13', '2026-06-14', '2026-06-15']
    const prod = {
      ...datesIndex(enrichedDays),
      ...Object.assign(
        {},
        ...enrichedDays.map(d =>
          day(d, { '02': D02_ENRICHED(), '61': D61_ENRICHED() })
        )
      ),
    }
    const staging = day('2026-06-15', {
      '02': D02_STRIPPED(),
      '61': D61_STRIPPED(),
    })
    const r = await gate(staging, prod, ['2026-06-15'])
    expect(r.promote).toBe(false)
    expect(text(r)).toMatch(/district_61\.json.*prospectiveClubs/)
  })

  it('allow_value_changes overrides it, still listing the failures', async () => {
    const staging = day('2026-06-15', {
      '02': D02_STRIPPED(),
      '61': D61_STRIPPED(),
    })
    const r = await gate(staging, strippedProd(), ['2026-06-15'], true)
    expect(r.promote).toBe(true)
    expect(r.failures.length).toBeGreaterThan(0)
  })
})

describe('a daily on a new date (no prod copy to compare against)', () => {
  const IDS = ['02', '03', '04', '05', '06', '61']
  const enrichedDay = () =>
    Object.fromEntries(
      IDS.map(id => [id, district({ clubs: 162, fac: 158, id })])
    )
  const prod = () => ({
    ...datesIndex(['2026-10-21', '2026-10-22', '2026-10-23']),
    ...day('2026-10-21', enrichedDay()),
    ...day('2026-10-22', enrichedDay()),
    ...day('2026-10-23', enrichedDay()),
  })
  /** The daily's staging copy with `lost` districts' FAC gone. */
  const daily = (lost: string[]) =>
    day(
      '2026-10-24',
      Object.fromEntries(
        IDS.map(id => [
          id,
          lost.includes(id)
            ? district({ clubs: 162, fac: 0, merged: false, id })
            : district({ clubs: 162, fac: 158, id }),
        ])
      )
    )

  it('1 district losing its FAC warns and the date still promotes', async () => {
    const r = await gate(daily(['61']), prod(), ['2026-10-24'])
    expect(r.newDates).toEqual(['2026-10-24'])
    expect(r.promote).toBe(true)
    expect(r.heldDates).toEqual([])
    expect(r.failures).toEqual([])
    expect(r.warnings.map(f => f.path)).toEqual([
      'snapshots/2026-10-24/district_61.json',
    ])
    expect(buildCompletenessGateSummary(r)).toMatch(
      /Find-A-Club warning[\s\S]*district_61\.json/
    )
    const body = buildFacWarningBody(r)
    expect(body).toContain('2026-10-24')
    expect(body).toContain('district_61.json')
    // fac_prior_root only accepts the #2239 recovery bucket: never advise it.
    expect(body).not.toContain('fac_prior_root')
    expect(body).toMatch(/next daily/i)
    expect(body).toMatch(/district 61/)
  })

  it('2 districts warn and promote', async () => {
    const r = await gate(daily(['05', '61']), prod(), ['2026-10-24'])
    expect(r.promote).toBe(true)
    expect(r.warnings).toHaveLength(2)
  })

  it('3 districts hold the date', async () => {
    const r = await gate(daily(['04', '05', '61']), prod(), ['2026-10-24'])
    expect(r.promote).toBe(false)
    expect(r.heldDates).toEqual(['2026-10-24'])
    expect(r.warnings).toEqual([])
    expect(r.failures.map(f => f.path)).toEqual([
      'snapshots/2026-10-24/district_04.json',
      'snapshots/2026-10-24/district_05.json',
      'snapshots/2026-10-24/district_61.json',
    ])
  })

  it('a merged district whose coordinates collapsed warns', async () => {
    const staging = {
      ...daily([]),
      ...day('2026-10-24', {
        '61': district({
          clubs: 162,
          fac: 158,
          drop: ['coordinates'],
          id: '61',
        }),
      }),
    }
    const r = await gate(staging, prod(), ['2026-10-24'])
    expect(r.promote).toBe(true)
    expect(r.warnings.map(f => `${f.path}: ${f.reason}`).join('\n')).toMatch(
      /district_61\.json.*coordinates.*0\/162/
    )
  })

  it('no warning body when nothing warned', async () => {
    const r = await gate(daily([]), prod(), ['2026-10-24'])
    expect(r.warnings).toEqual([])
    expect(buildFacWarningBody(r)).toBeNull()
  })

  it('passes an enriched daily, reading only the 3 prior dates it needs', async () => {
    const staging = fakeBucket(
      day('2026-10-24', { '02': D02_ENRICHED(), '61': D61_ENRICHED() })
    )
    const prodBucket = fakeBucket({
      ...prod(),
      ...day('2026-10-20', { '02': D02_ENRICHED() }),
    })
    const r = await runCompletenessGate(staging, prodBucket, ['2026-10-24'], {
      allowValueChanges: false,
    })
    expect(r.failures).toEqual([])
    expect(r.promote).toBe(true)
    expect(staging.queries.map(q => q.prefix)).toEqual([
      'snapshots/2026-10-24/',
    ])
    expect(prodBucket.downloads.some(d => d.includes('2026-10-20'))).toBe(false)
  })

  it('fails closed when prod’s v1/dates.json cannot be read', async () => {
    const { ['v1/dates.json']: _omit, ...noIndex } = prod()
    const staging = day('2026-10-24', {
      '02': D02_ENRICHED(),
      '61': D61_ENRICHED(),
    })
    await expect(gate(staging, noIndex, ['2026-10-24'])).rejects.toThrow(
      /v1\/dates\.json/
    )
  })
})

describe('outside the FAC era', () => {
  it('a historical date reads no earlier dates and no dates index', async () => {
    const prodBucket = fakeBucket(day('2019-06-30', { '02': D02_STRIPPED() }))
    const staging = fakeBucket(day('2019-06-30', { '02': D02_STRIPPED() }))
    const r = await runCompletenessGate(staging, prodBucket, ['2019-06-30'], {
      allowValueChanges: false,
    })
    expect(r.promote).toBe(true)
    expect(prodBucket.downloads).not.toContain('v1/dates.json')
    expect(prodBucket.queries.map(q => q.prefix)).toEqual([
      'snapshots/2019-06-30/',
    ])
  })
})
