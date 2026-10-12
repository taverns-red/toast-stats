/**
 * Club-district history fold (#1782, epic #1781).
 *
 * Fixtures are RECORDED: three real `club-race/{PY}/first-reached.json`
 * stores read once each from staging on 2026-10-11 (envelope, observedDates
 * and club entries verbatim), trimmed to six clubs:
 *   977  District 01 → District 201 in the 2026 reformation
 *   3045 District 61 throughout (control)
 *   368  District 60 → District 123, then closed (absent from 2026-27)
 *   699  District 05, a district retired in 2026; the club is gone with it
 *   7    District 05 → District F
 *   2    renamed ("Anaheim Club" → "Anaheim Club 2"); District 100 → F
 * The only hand-made inputs are mutations of those recorded entries (a
 * duplicate key, a removed sighting), named where they are made.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  ClubDistrictHistoryIndexSchema,
  ClubDistrictHistoryShardSchema,
  ClubRaceStoreSchema,
  type ClubRaceStoreData,
} from '@taverns-red/shared-contracts'
import {
  foldClubDistrictHistory,
  type ClubDistrictHistoryArtifact,
} from '../clubDistrictHistory.js'

const FIXTURES = path.resolve(__dirname, 'fixtures/identity-history/club-race')
const PYS = ['2017-2018', '2025-2026', '2026-2027']

function loadStores(): ClubRaceStoreData[] {
  return PYS.map(py =>
    ClubRaceStoreSchema.parse(
      JSON.parse(
        fs.readFileSync(path.join(FIXTURES, py, 'first-reached.json'), 'utf-8')
      )
    )
  )
}

function club(artifact: ClubDistrictHistoryArtifact, id: string) {
  for (const shard of Object.values(artifact.shards)) {
    if (shard.clubs[id]) return shard.clubs[id]
  }
  return undefined
}

describe('foldClubDistrictHistory — recorded club-race stores', () => {
  let artifact: ClubDistrictHistoryArtifact
  beforeAll(() => {
    artifact = foldClubDistrictHistory(loadStores())
  })

  it('produces an index and shards that satisfy the shared contract', () => {
    expect(() =>
      ClubDistrictHistoryIndexSchema.parse(artifact.index)
    ).not.toThrow()
    for (const shard of Object.values(artifact.shards)) {
      expect(() => ClubDistrictHistoryShardSchema.parse(shard)).not.toThrow()
    }
  })

  it('stamps asOf, program years and sources from the stores, not wall time', () => {
    expect(artifact.index.asOf).toBe('2026-10-10')
    expect(artifact.index.programYears).toEqual(PYS)
    expect(artifact.index.sourcesUpdatedAt).toBe('2026-10-11T15:49:53.551Z')
    expect(artifact.index.granularity).toBe('program-year')
    expect(artifact.index.totalClubs).toBe(6)
  })

  it('club 977: District 01 through 2025-26, District 201 in 2026-27', () => {
    expect(club(artifact, '977')).toEqual({
      name: 'Professional Women Toastmasters',
      formerNames: [],
      firstSeen: '2018-06-30',
      lastSeen: '2026-10-10',
      spans: [
        { from: '2018-06-30', to: '2026-06-30', districtId: '01' },
        { from: '2026-07-26', to: null, districtId: '201' },
      ],
      byProgramYear: {
        '2017-2018': '01',
        '2025-2026': '01',
        '2026-2027': '201',
      },
    })
  })

  it('a club that never moved has one open span (control)', () => {
    expect(club(artifact, '3045')?.spans).toEqual([
      { from: '2018-06-30', to: null, districtId: '61' },
    ])
  })

  it('a closed club is kept, with to and lastSeen set', () => {
    const c = club(artifact, '368')
    expect(c?.lastSeen).toBe('2026-04-29')
    expect(c?.spans).toEqual([
      { from: '2018-06-30', to: '2018-06-30', districtId: '60' },
      { from: '2025-07-31', to: '2026-04-29', districtId: '123' },
    ])
    expect(c?.byProgramYear['2026-2027']).toBeUndefined()
  })

  it('a club of a retired district keeps that district, closed at its last sighting', () => {
    expect(club(artifact, '699')?.spans).toEqual([
      { from: '2018-06-30', to: '2026-06-30', districtId: '05' },
    ])
    expect(club(artifact, '7')?.spans).toEqual([
      { from: '2018-06-30', to: '2026-06-30', districtId: '05' },
      { from: '2026-07-26', to: null, districtId: 'F' },
    ])
  })

  it('keeps the latest name and lists earlier ones as formerNames', () => {
    expect(club(artifact, '2')?.name).toBe('Anaheim Club 2')
    expect(club(artifact, '2')?.formerNames).toEqual(['Anaheim Club'])
    expect(club(artifact, '368')?.formerNames).toEqual(['First Speakers'])
  })

  it('shards by the last two digits of the club id', () => {
    expect(Object.keys(artifact.shards).sort()).toEqual(artifact.index.shards)
    expect(artifact.shards['77']?.clubs['977']).toBeDefined()
    expect(artifact.shards['45']?.clubs['3045']).toBeDefined()
    expect(artifact.shards['02']?.clubs['2']).toBeDefined()
    expect(artifact.shards['07']?.clubs['7']).toBeDefined()
  })

  it('reports no duplicates when every store lists each club once', () => {
    expect(artifact.index.duplicates).toEqual([])
  })
})

describe('foldClubDistrictHistory — determinism', () => {
  it('is order-independent: 2026-27 before 2025-26 gives identical bytes', () => {
    const stores = loadStores()
    const forward = foldClubDistrictHistory(stores)
    const reversed = foldClubDistrictHistory([...stores].reverse())
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward))
  })
})

describe('foldClubDistrictHistory — edge cases on recorded entries', () => {
  it('a club listed under two districts in one PY is reported, never silently chosen', () => {
    const stores = loadStores()
    const py2627 = stores[2]!
    // Mutation: the recorded 2025-26 entry for 977 re-keyed zero-padded
    // ("0977" normalises to "977") into the 2026-27 store, as a second
    // sighting in District 01 on 2026-07-30.
    py2627.clubs['0977'] = {
      ...stores[1]!.clubs['977']!,
      clubId: '0977',
      lastSeen: '2026-07-30',
    }
    const artifact = foldClubDistrictHistory(stores)
    expect(artifact.index.duplicates).toEqual([
      {
        clubId: '977',
        programYear: '2026-2027',
        sightings: [
          {
            districtId: '01',
            clubName: 'Professional Women Toastmasters',
            lastSeen: '2026-07-30',
          },
          {
            districtId: '201',
            clubName: 'Professional Women Toastmasters',
            lastSeen: '2026-10-10',
          },
        ],
      },
    ])
    // Deterministic pick (latest lastSeen), and the count is not doubled.
    expect(club(artifact, '977')?.byProgramYear['2026-2027']).toBe('201')
    expect(artifact.index.totalClubs).toBe(6)
  })

  it('a program year the club is absent from splits the span, even in the same district', () => {
    const stores = loadStores()
    // Mutation: 3045 removed from the recorded 2025-26 store.
    delete stores[1]!.clubs['3045']
    const artifact = foldClubDistrictHistory(stores)
    expect(club(artifact, '3045')?.spans).toEqual([
      { from: '2018-06-30', to: '2018-06-30', districtId: '61' },
      { from: '2026-07-26', to: null, districtId: '61' },
    ])
  })

  it('refuses an empty input: no stores means a failed sync, not an empty history', () => {
    expect(() => foldClubDistrictHistory([])).toThrow(/no club-race stores/)
  })

  it('refuses two stores for one program year', () => {
    const stores = loadStores()
    expect(() => foldClubDistrictHistory([...stores, stores[0]!])).toThrow(
      /2017-2018/
    )
  })
})
