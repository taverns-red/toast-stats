/**
 * Club-district history Phase 2 — date-exact change points (#1816).
 *
 * Inputs:
 * - `fixtures/identity-history/club-race/2017-2018` — a RECORDED store
 *   written before change points existed (legacy: PY precision only);
 * - `fixtures/identity-history/change-points/{2025-2026,2026-2027}` — the
 *   stores the real ClubRaceStore writes from RECORDED staging district
 *   files of the 2026 reformation (pinned byte-for-byte by
 *   collector-cli's ClubRaceStore.changePoints.recorded.test.ts), including
 *   the June close listed under BOTH District 01 and District 201 (#2079).
 *
 * The rule under test: a span carries `firstSeenOn` / `lastSeenOn` only when
 * every observed date on both sides of the change was folded with change
 * points; otherwise the reader falls back to PY precision.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  CLUB_DISTRICT_HISTORY_VERSION,
  ClubDistrictHistoryShardSchema,
  ClubRaceStoreSchema,
  type ClubRaceStoreData,
} from '@taverns-red/shared-contracts'
import {
  foldClubDistrictHistory,
  type ClubDistrictHistoryArtifact,
} from '../clubDistrictHistory.js'

const ROOT = path.resolve(__dirname, 'fixtures/identity-history')

function store(dir: string, py: string): ClubRaceStoreData {
  return ClubRaceStoreSchema.parse(
    JSON.parse(
      fs.readFileSync(path.join(ROOT, dir, py, 'first-reached.json'), 'utf-8')
    )
  )
}

const legacy2017 = () => store('club-race', '2017-2018')
const legacy2026 = () => store('club-race', '2026-2027')
const cp2025 = () => store('change-points', '2025-2026')
const cp2026 = () => store('change-points', '2026-2027')

function club(artifact: ClubDistrictHistoryArtifact, id: string) {
  for (const shard of Object.values(artifact.shards)) {
    if (shard.clubs[id]) return shard.clubs[id]
  }
  return undefined
}

/** A one-club store with recorded change points and no gaps. */
function synthetic(
  py: string,
  observedDates: string[],
  runs: Array<{ districtId: string; from: string; to: string }>,
  gaps: string[] = []
): ClubRaceStoreData {
  const last = runs.reduce((m, r) => (r.to > m.to ? r : m), runs[0]!)
  return {
    _format: { version: '1.0.0', type: 'club-race-store' },
    programYear: py,
    updatedAt: '2026-10-17T00:00:00.000Z',
    observedDates,
    districtHistoryGaps: gaps,
    clubs: {
      '42': {
        clubId: '42',
        clubName: 'Mover Club',
        districtId: last.districtId,
        lastSeen: last.to,
        firstSeen: runs[0]!.from,
        districtHistory: runs,
        reached: {},
      },
    },
  }
}

describe('foldClubDistrictHistory — date-exact change points (#1816)', () => {
  it('club 977: District 01 until 30 Jun 2026, District 201 from 26 Jul 2026', () => {
    const artifact = foldClubDistrictHistory([legacy2017(), cp2025(), cp2026()])
    expect(club(artifact, '977')).toEqual({
      name: 'Professional Women Toastmasters',
      formerNames: [],
      firstSeen: '2018-06-30',
      lastSeen: '2026-07-26',
      spans: [
        {
          from: '2018-06-30',
          to: '2026-06-30',
          districtId: '01',
          lastSeenOn: '2026-06-30',
        },
        {
          from: '2026-07-26',
          to: null,
          districtId: '201',
          firstSeenOn: '2026-07-26',
        },
      ],
      // The June close listed 977 under District 201 too (#2079): a shadow
      // listing, so 2025-26 stays District 01.
      byProgramYear: {
        '2017-2018': '01',
        '2025-2026': '01',
        '2026-2027': '201',
      },
    })
  })

  it('the first span of a legacy store has no date-exact start', () => {
    const artifact = foldClubDistrictHistory([legacy2017(), cp2025(), cp2026()])
    expect(club(artifact, '977')!.spans[0]!.firstSeenOn).toBeUndefined()
  })

  it('a legacy store on either side of the change keeps PY precision', () => {
    const artifact = foldClubDistrictHistory([cp2025(), legacy2026()])
    const spans = club(artifact, '977')!.spans
    expect(spans).toEqual([
      // The club's first record in these stores IS dated: nothing before it.
      {
        from: '2026-06-29',
        to: '2026-06-30',
        districtId: '01',
        firstSeenOn: '2026-06-29',
      },
      { from: '2026-07-26', to: null, districtId: '201' },
    ])
  })

  it('a PY-close change point (#2079) is never date-exact', () => {
    // Mutation of the recorded store: 977 missing from District 01's June
    // close, so its only 2026-06-30 listing is District 201's.
    const py2526 = cp2025()
    py2526.clubs['977']!.districtHistory = [
      { districtId: '01', from: '2026-06-29', to: '2026-06-29' },
      { districtId: '201', from: '2026-06-30', to: '2026-06-30' },
    ]
    const spans = club(
      foldClubDistrictHistory([py2526, cp2026()]),
      '977'
    )!.spans
    expect(spans).toEqual([
      {
        from: '2026-06-29',
        to: '2026-06-29',
        districtId: '01',
        firstSeenOn: '2026-06-29',
      },
      { from: '2026-06-30', to: null, districtId: '201' },
    ])
  })

  it('a mid-year move inside one store is dated to the day', () => {
    const artifact = foldClubDistrictHistory([
      synthetic(
        '2025-2026',
        ['2025-07-31', '2025-08-31', '2025-09-03', '2025-09-30'],
        [
          { districtId: '10', from: '2025-07-31', to: '2025-08-31' },
          { districtId: '11', from: '2025-09-03', to: '2025-09-30' },
        ]
      ),
    ])
    expect(club(artifact, '42')!.spans).toEqual([
      {
        from: '2025-07-31',
        to: '2025-08-31',
        districtId: '10',
        firstSeenOn: '2025-07-31',
        lastSeenOn: '2025-08-31',
      },
      {
        from: '2025-09-03',
        to: null,
        districtId: '11',
        firstSeenOn: '2025-09-03',
      },
    ])
    expect(club(artifact, '42')!.byProgramYear).toEqual({ '2025-2026': '11' })
  })

  it('a gap date between the two runs leaves the move undated', () => {
    const artifact = foldClubDistrictHistory([
      synthetic(
        '2025-2026',
        ['2025-07-31', '2025-08-31', '2025-09-01', '2025-09-30'],
        [
          { districtId: '10', from: '2025-07-31', to: '2025-08-31' },
          { districtId: '11', from: '2025-09-03', to: '2025-09-30' },
        ],
        ['2025-09-01']
      ),
    ])
    const spans = club(artifact, '42')!.spans
    expect(spans[0]!.lastSeenOn).toBeUndefined()
    expect(spans[1]!.firstSeenOn).toBeUndefined()
    // The run's own first sighting still bounds the move from above.
    expect(spans[1]!.from).toBe('2025-09-03')
  })

  it('satisfies the shared contract, stamps version 1.1.0, and is order-independent', () => {
    const stores = [legacy2017(), cp2025(), cp2026()]
    const forward = foldClubDistrictHistory(stores)
    expect(forward.index._format.version).toBe(CLUB_DISTRICT_HISTORY_VERSION)
    expect(CLUB_DISTRICT_HISTORY_VERSION).toBe('1.1.0')
    for (const shard of Object.values(forward.shards)) {
      expect(() => ClubDistrictHistoryShardSchema.parse(shard)).not.toThrow()
    }
    const reversed = foldClubDistrictHistory([...stores].reverse())
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward))
  })
})
