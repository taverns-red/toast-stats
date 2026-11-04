import { describe, expect, it } from 'vitest'

import {
  CLUB_RACE_STORE_FORMAT,
  ClubRaceStoreSchema,
  GLOBAL_CLUB_RACE_FILE_NAME,
  GLOBAL_CLUB_RACE_FORMAT,
  GlobalClubRaceSchema,
  type ClubRaceStoreData,
  type GlobalClubRace,
} from '../index.js'
import { GLOBAL_CLUB_RACE } from './__fixtures__/reader-payloads.js'

/**
 * #1556 (phase 2 of 4) — the worldwide "race to Distinguished" contracts:
 * the internal crossing store `club-race/{PY}/first-reached.json` and the
 * published projection `snapshots/{date}/global-club-race.json`.
 *
 * Both shapes exist so a frontend never re-derives a rule from club rows:
 * the ruleset, the observation resolution and every crossing window come
 * pre-stated by the collector.
 */

const STORE: ClubRaceStoreData = {
  _format: { version: '1.0.0', type: 'club-race-store' },
  programYear: '2026-2027',
  updatedAt: '2026-09-11T10:00:00.000Z',
  observedDates: ['2026-07-26', '2026-08-12', '2026-09-11'],
  clubs: {
    '3045': {
      clubId: '3045',
      clubName: 'Limestone City Club',
      districtId: '61',
      lastSeen: '2026-09-11',
      reached: {
        Distinguished: { on: '2026-07-26', after: null },
        Select: { on: '2026-08-12', after: '2026-07-26' },
      },
    },
    '9': {
      clubId: '9',
      clubName: 'Official Only',
      districtId: '61',
      lastSeen: '2026-09-11',
      reached: {},
      official: { code: 'D', on: '2026-09-11', after: '2026-08-12' },
    },
  },
}

const ARTIFACT: GlobalClubRace = GLOBAL_CLUB_RACE

describe('ClubRaceStoreSchema (#1556)', () => {
  it('round-trips the store fixture', () => {
    const parsed = ClubRaceStoreSchema.parse(STORE)
    expect(parsed).toEqual(STORE)
    expect(parsed._format).toEqual(CLUB_RACE_STORE_FORMAT)
  })

  it('rejects an unknown tier key — the store never invents a rung', () => {
    const bad = structuredClone(STORE) as unknown as {
      clubs: Record<string, { reached: Record<string, unknown> }>
    }
    bad.clubs['3045']!.reached['Presidents'] = { on: '2026-08-12', after: null }
    expect(ClubRaceStoreSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a crossing whose date is not YYYY-MM-DD', () => {
    const bad = structuredClone(STORE)
    bad.clubs['3045']!.reached.Distinguished = {
      on: '26 Jul 2026',
      after: null,
    }
    expect(ClubRaceStoreSchema.safeParse(bad).success).toBe(false)
  })
})

describe('GlobalClubRaceSchema (#1556)', () => {
  it('round-trips the artifact fixture', () => {
    expect(GlobalClubRaceSchema.parse(ARTIFACT)).toEqual(ARTIFACT)
    expect(GLOBAL_CLUB_RACE_FORMAT).toEqual({
      version: '1.0.0',
      type: 'global-club-race',
    })
    expect(GLOBAL_CLUB_RACE_FILE_NAME).toBe('global-club-race.json')
  })

  it('rejects the wrong format literal', () => {
    const bad = structuredClone(ARTIFACT) as unknown as {
      _format: { type: string }
    }
    bad._format.type = 'global-totals'
    expect(GlobalClubRaceSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a negative count', () => {
    const bad = structuredClone(ARTIFACT)
    bad.timeline[0]!.Distinguished = -1
    expect(GlobalClubRaceSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a goals histogram that is not exactly 11 buckets', () => {
    const bad = structuredClone(ARTIFACT)
    bad.distribution.goalsMet = [1, 2, 3]
    expect(GlobalClubRaceSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects percentOfBase above 100', () => {
    const bad = structuredClone(ARTIFACT)
    bad.byDistrict[0]!.percentOfBase = 101
    expect(GlobalClubRaceSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a rank below 1 — a club that reached is never unranked', () => {
    const bad = structuredClone(ARTIFACT)
    bad.reached[0]!.tiers.Distinguished!.rank = 0
    expect(GlobalClubRaceSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects an unknown tier key in a reached row', () => {
    const bad = structuredClone(ARTIFACT) as unknown as {
      reached: Array<{ tiers: Record<string, unknown> }>
    }
    bad.reached[0]!.tiers['Gold'] = {
      reachedOn: '2026-08-12',
      observedAfter: null,
      rank: 1,
    }
    expect(GlobalClubRaceSchema.safeParse(bad).success).toBe(false)
  })
})
