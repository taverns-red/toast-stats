/**
 * Per-region club shards + the world file (#1800, epic #1781).
 *
 * Inputs are recorded staging captures (see
 * `__tests__/fixtures/clubs-by-region/README.md`). The health and tier
 * expectations come from the pipeline's own region-rollups.json for the same
 * date (recorded beside the inputs), not from this module; the club counts
 * were taken with jq over the same fixture bytes.
 */

import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CLUBS_BY_REGION_TOP_N,
  ClubsByRegionShardSchema,
  ClubsByRegionWorldSchema,
  DistrictRegionHistorySchema,
  type ClubsByRegionClub,
  type DistrictRegionHistory,
} from '@taverns-red/shared-contracts'
import {
  buildClubsByRegion,
  readClubsByRegionInput,
  type ClubsByRegionDistrictInput,
} from './clubsByRegion.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIX = join(HERE, '__tests__/fixtures/clubs-by-region')
const DATE = '2026-10-16'
const GENERATED_AT = '2026-10-17T00:00:00.000Z'
const RECORDED_OUTPUT = join(
  HERE,
  '../../../shared-contracts/src/__tests__/__fixtures__/recorded-clubs-by-region.json'
)

const history = (): DistrictRegionHistory =>
  DistrictRegionHistorySchema.parse(
    JSON.parse(
      readFileSync(join(FIX, 'config/district-region-history.json'), 'utf-8')
    )
  )

const input = () => readClubsByRegionInput(join(FIX, 'snapshots', DATE))

function build(
  opts: {
    snapshotDate?: string
    regionHistory?: DistrictRegionHistory | null
    districts?: ClubsByRegionDistrictInput[]
  } = {}
) {
  const { rankings, districts } = input()
  return buildClubsByRegion({
    snapshotDate: opts.snapshotDate ?? DATE,
    rankings,
    districts: opts.districts ?? districts,
    regionHistory:
      opts.regionHistory === undefined ? history() : opts.regionHistory,
    generatedAt: GENERATED_AT,
  })
}

/** The pipeline's region-rollups.json district rows for the same date. */
const ROLLUPS = JSON.parse(
  readFileSync(
    join(FIX, 'snapshots', DATE, 'region-rollups.districts.json'),
    'utf-8'
  )
) as {
  districts: Record<
    string,
    {
      clubs: number
      health: {
        thriving: number
        vulnerable: number
        interventionRequired: number
      }
      distinguished: Record<string, number>
    }
  >
}

const shardsByKey = (r: ReturnType<typeof build>) =>
  Object.fromEntries(r.shards.map(s => [s.region, s]))

describe('buildClubsByRegion (#1800)', () => {
  it('writes one shard per region of the logical date’s program year, plus the unassigned districts', () => {
    const r = build()
    expect(r.missingDistricts).toEqual([])
    const shards = shardsByKey(r)
    expect(Object.keys(shards).sort()).toEqual(['01', '05', '12', 'unassigned'])
    expect(shards['05']!.districtIds).toEqual(['61'])
    expect(shards['01']!.districtIds).toEqual(['49'])
    expect(shards['12']!.districtIds).toEqual(['17'])
    expect(shards['unassigned']!.districtIds).toEqual(['U'])
    for (const s of r.shards) {
      expect(ClubsByRegionShardSchema.parse(s)).toEqual(s)
      expect(s.programYear).toBe('2026-2027')
      expect(s.regionMembership.asOf).toBe('2026-10-16')
    }
    expect(ClubsByRegionWorldSchema.parse(r.world)).toEqual(r.world)
  })

  it('counts every club, with or without coordinates (jq over the fixture: 318 clubs, 4 unmapped)', () => {
    const r = build()
    const shards = shardsByKey(r)
    expect(shards['05']!.counts).toEqual({
      clubs: 161,
      mapped: 159,
      unmapped: 2,
    })
    expect(shards['01']!.counts).toEqual({ clubs: 66, mapped: 66, unmapped: 0 })
    expect(shards['12']!.counts).toEqual({ clubs: 63, mapped: 63, unmapped: 0 })
    expect(shards['unassigned']!.counts).toEqual({
      clubs: 28,
      mapped: 26,
      unmapped: 2,
    })
    expect(r.world.totals).toEqual({
      districts: 4,
      clubs: 318,
      mapped: 314,
      unmapped: 4,
    })
    expect(r.world.points).toHaveLength(314)
    const unmapped = r.shards.flatMap(s => s.clubs).filter(c => c.lat === null)
    expect(unmapped.map(c => c.id).sort()).toEqual([
      '28678196',
      '28678336',
      '28678752',
      '7860006',
    ])
  })

  it('classifies health and tier exactly as the pipeline’s region-rollups.json does for the same date', () => {
    const r = build()
    const all = r.shards.flatMap(s => s.clubs)
    for (const [id, row] of Object.entries(ROLLUPS.districts)) {
      const clubs = all.filter(c => c.d === id)
      expect(clubs.length, id).toBe(row.clubs)
      const count = (f: (c: ClubsByRegionClub) => boolean) =>
        clubs.filter(f).length
      expect(
        {
          thriving: count(c => c.h === 't'),
          vulnerable: count(c => c.h === 'v'),
          interventionRequired: count(c => c.h === 'i'),
        },
        id
      ).toEqual(row.health)
      expect(
        count(c => c.t === 'Select'),
        id
      ).toBe(row.distinguished['select'])
      expect(
        count(c => c.t === 'Distinguished'),
        id
      ).toBe(row.distinguished['distinguished'])
      expect(
        count(c => c.t === null),
        id
      ).toBe(row.distinguished['notDistinguished'])
    }
  })

  it('carries per-region health counts in the world file that match its shards', () => {
    const r = build()
    for (const s of r.shards) {
      const entry = r.world.shards![s.region]!
      expect(entry.path).toBe(`clubs-by-region/${s.region}.json`)
      expect(entry.districtIds).toEqual(s.districtIds)
      expect(entry.clubs).toBe(s.counts.clubs)
      expect(entry.mapped).toBe(s.counts.mapped)
      expect(entry.health.interventionRequired).toBe(
        s.clubs.filter(c => c.h === 'i').length
      )
    }
  })

  it('resolves a club’s region for the shard’s program year, not today’s mapping (D61: Region 09 in 2023-24, 05 now)', () => {
    const r = build({ snapshotDate: '2023-10-16' })
    const shards = shardsByKey(r)
    expect(shards['09']!.districtIds).toEqual(['61'])
    expect(shards['05']).toBeUndefined()
    expect(shards['09']!.programYear).toBe('2023-2024')
    expect(shards['09']!.clubs.every(c => c.region === '09')).toBe(true)
  })

  it('takes a June close’s program year from its logical date (2026-06-30 is 2025-26)', () => {
    const r = build({ snapshotDate: '2026-06-30' })
    expect(r.world.programYear).toBe('2025-2026')
    expect(r.world.regionMembership?.programYear).toBe('2025-2026')
  })

  it('returns a listed district with no file as missing, for the writer to refuse (ADR-015 P3)', () => {
    const { districts } = input()
    const r = build({ districts: districts.filter(d => d.districtId !== '49') })
    expect(r.missingDistricts).toEqual(['49'])
  })

  it('excludes a district file the date’s rankings do not list', () => {
    const { districts } = input()
    const stray = { ...districts[0]!, districtId: '999' }
    const r = build({ districts: [...districts, stray] })
    expect(r.world.scope.excludedDistricts).toEqual(['999'])
    expect(r.world.totals.clubs).toBe(318)
  })

  it('counts a club listed by two districts once and reports it', () => {
    const { districts } = input()
    const d17 = districts.find(d => d.districtId === '17')!
    const d49 = districts.find(d => d.districtId === '49')!
    const moved = { ...d49, clubs: [...d49.clubs, d17.clubs[0]!] }
    const r = build({
      districts: districts.map(d => (d.districtId === '49' ? moved : d)),
    })
    expect(r.world.totals.clubs).toBe(318)
    expect(r.world.scope.duplicateClubs).toEqual([
      { clubId: d17.clubs[0]!.clubId, districtIds: ['17', '49'] },
    ])
  })

  it('without a usable history writes no shards, and the world file says why', () => {
    const r = build({ regionHistory: null })
    expect(r.shards).toEqual([])
    expect(r.world.shards).toBeNull()
    expect(r.world.regionMembership).toBeNull()
    expect(r.world.regionMembershipNote).toMatch(/district-region-history/)
    expect(r.world.totals.clubs).toBe(318)
    expect(r.world.points).toHaveLength(314)
  })

  it('has no PY entry in the history → no shards, the reason named', () => {
    const h = history()
    const r = build({
      regionHistory: {
        ...h,
        programYears: h.programYears.filter(py => py !== '2026-2027'),
      },
    })
    expect(r.world.shards).toBeNull()
    expect(r.world.regionMembershipNote).toMatch(/2026-2027/)
  })

  it('carries only the explorer fields: no contact, link or meeting data, and links stripped from names', () => {
    const { districts } = input()
    const d17 = districts.find(d => d.districtId === '17')!
    const linked = {
      ...d17,
      clubs: [
        {
          ...d17.clubs[0]!,
          clubName: 'Speakers https://zoom.us/j/123456 Club',
        },
        ...d17.clubs.slice(1),
      ],
    }
    const r = build({
      districts: districts.map(d => (d.districtId === '17' ? linked : d)),
    })
    const row = shardsByKey(r)['12']!.clubs.find(
      c => c.id === d17.clubs[0]!.clubId
    )!
    expect(row.name).not.toMatch(/zoom|https/)
    expect(Object.keys(row).sort()).toEqual(
      [
        'id',
        'name',
        'd',
        'region',
        'division',
        'area',
        'city',
        'status',
        'h',
        't',
        'tp',
        'members',
        'base',
        'dcpGoals',
        'csp',
        'lat',
        'lng',
      ].sort()
    )
  })

  it('seeds the top-N lists by membership, net growth and DCP goals, highest first, ties by club id', () => {
    const r = build()
    const all = r.shards.flatMap(s => s.clubs)
    const metric = {
      membership: (c: ClubsByRegionClub) => c.members,
      netGrowth: (c: ClubsByRegionClub) => c.members - c.base,
      dcpGoals: (c: ClubsByRegionClub) => c.dcpGoals,
    }
    for (const [key, value] of Object.entries(metric)) {
      const list = r.world.top[key as keyof typeof metric]
      expect(list).toHaveLength(CLUBS_BY_REGION_TOP_N)
      const best = Math.max(...all.map(value))
      expect(value(list[0]!)).toBe(best)
      for (let i = 1; i < list.length; i++) {
        expect(value(list[i - 1]!)).toBeGreaterThanOrEqual(value(list[i]!))
      }
    }
  })

  it('is byte-identical whatever order the district files arrive in (Lesson 158)', () => {
    const { districts } = input()
    const a = JSON.stringify(build({ districts }))
    const b = JSON.stringify(build({ districts: [...districts].reverse() }))
    expect(a).toBe(b)
  })

  it('matches the recorded fixture the shared-contracts schema test reads', () => {
    const r = build()
    const recorded = JSON.parse(readFileSync(RECORDED_OUTPUT, 'utf-8'))
    expect({
      world: r.world,
      shards: Object.fromEntries(r.shards.map(s => [s.region, s])),
    }).toEqual(recorded)
  })
})

describe('clubs-by-region sizes at world scale (#1800)', () => {
  // 14,524 clubs in 94 districts on 2026-10-16 (staging region-rollups.json).
  // The recorded rows are cloned onto every district the real history places
  // for 2026-27, with unique ids, names and coordinates so gzip cannot lean on
  // repeats the real data does not have.
  it('keeps every shard under 150 KB gzip and the world file under the 500 KB budget', () => {
    const h = history()
    const ids = Object.keys(h.districts)
      .filter(id => h.districts[id]!.byProgramYear['2026-2027'])
      .slice(0, 94)
    const real = input().districts.flatMap(d => d.clubs)
    const perDistrict = Math.ceil(14524 / ids.length)
    let n = 0
    let seed = 1
    const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647
    const districts = ids.map(districtId => ({
      districtId,
      clubs: Array.from({ length: perDistrict }, () => {
        const c = real[n++ % real.length]!
        return {
          ...c,
          clubId: String(1000000 + n * 37),
          clubName: `${c.clubName} ${n.toString(36)}`,
          ...(c.coordinates && {
            coordinates: {
              lat: +(rand() * 140 - 60).toFixed(5),
              lng: +(rand() * 360 - 180).toFixed(5),
            },
          }),
        }
      }),
    }))
    const r = buildClubsByRegion({
      snapshotDate: DATE,
      rankings: ids.map(districtId => ({ districtId })),
      districts,
      regionHistory: h,
      generatedAt: GENERATED_AT,
    })
    const gz = (v: unknown) => gzipSync(JSON.stringify(v)).length
    expect(r.world.totals.clubs).toBeGreaterThanOrEqual(14524)
    expect(Math.max(...r.shards.map(gz))).toBeLessThan(150 * 1024)
    expect(gz(r.world)).toBeLessThan(500 * 1024)
  })
})
