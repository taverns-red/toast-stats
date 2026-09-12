/**
 * ClubRaceStore (#1556) — the GCS-backed crossing-date store behind the
 * worldwide "race to Distinguished".
 *
 * R9 pattern (sync → upsert → save → push), one file per program year at
 * `club-race/{PY}/first-reached.json`. The prune policy keeps ~two snapshots
 * a month, so the day a club first met a tier's requirements survives ONLY
 * if it is captured here at collection time — nothing downstream can
 * recover it later.
 *
 * Every rule these tests pin is a place a plausible wrong date could come
 * from: a crossing revised by a later drop (sticky), a re-run moving a date
 * (idempotent), a zero-padded id splitting one club in two, a rebuild that
 * walks dates out of order (min), or the pre-April basis quietly reading
 * active members instead of confirmed renewals (ruling R-A).
 *
 * Real on-disk temp directories, never the network.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ClubStatistics } from '@taverns-red/analytics-core'
import {
  CLUB_RACE_STORE_FORMAT,
  ClubRaceStore,
  updateClubRaceStore,
} from '../services/ClubRaceStore.js'

const PY = '2026-2027'

/** A club that meets Distinguished on either basis unless overridden. */
function club(overrides: Partial<ClubStatistics> = {}): ClubStatistics {
  return {
    clubId: '3045',
    clubName: 'Limestone City Club',
    divisionId: 'A',
    areaId: '01',
    membershipCount: 22,
    paymentsCount: 40,
    dcpGoals: 5,
    status: 'Active',
    divisionName: 'Division A',
    areaName: 'Area 01',
    octoberRenewals: 20,
    aprilRenewals: 22,
    newMembers: 2,
    membershipBase: 20,
    cspSubmitted: true,
    ...overrides,
  }
}

const district = (districtId: string, clubs: ClubStatistics[]) => ({
  districtId,
  clubs,
})

describe('ClubRaceStore — factory and path (#1556)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'club-race-store-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('creates an empty store stamped with the format envelope and program year', () => {
    const store = ClubRaceStore.create(PY)
    expect(store.programYear).toBe(PY)
    expect(store.observedDates).toEqual([])
    expect(store.clubs).toEqual({})
    expect(store.toJSON()._format).toEqual(CLUB_RACE_STORE_FORMAT)
  })

  it('keys the file on the program year under club-race/', () => {
    expect(ClubRaceStore.getPath('/cache', PY)).toBe(
      path.join('/cache', 'club-race', PY, 'first-reached.json')
    )
  })

  it('returns null when no store exists yet', async () => {
    expect(await ClubRaceStore.load(tempDir, PY)).toBeNull()
  })

  it('round-trips through save and load', async () => {
    const store = ClubRaceStore.create(PY)
    store.upsertSnapshot('2026-07-26', [district('61', [club()])])
    await store.save(tempDir)

    const loaded = await ClubRaceStore.load(tempDir, PY)
    expect(loaded).not.toBeNull()
    expect(loaded!.toJSON()).toEqual(store.toJSON())
  })
})

describe('ClubRaceStore.upsertSnapshot — crossings (#1556)', () => {
  it('records a crossing for the tier reached AND every tier below it', () => {
    const store = ClubRaceStore.create(PY)
    // 7 goals with 22 confirmed renewals → Select, which implies Distinguished.
    store.upsertSnapshot('2026-08-12', [
      district('61', [club({ dcpGoals: 7 })]),
    ])

    const entry = store.getClub('3045')
    expect(entry?.reached).toEqual({
      Distinguished: { on: '2026-08-12', after: null },
      Select: { on: '2026-08-12', after: null },
    })
    expect(entry?.districtId).toBe('61')
    expect(entry?.clubName).toBe('Limestone City Club')
  })

  it('records nothing for a club below Distinguished', () => {
    const store = ClubRaceStore.create(PY)
    store.upsertSnapshot('2026-08-12', [
      district('61', [club({ dcpGoals: 4 })]),
    ])

    expect(store.getClub('3045')?.reached).toEqual({})
    expect(store.observedDates).toEqual(['2026-08-12'])
  })

  it('reads the ruling R-A basis: before April, active members alone do not cross', () => {
    const store = ClubRaceStore.create(PY)
    // 25 active members but only 15 confirmed renewals (base 20): no crossing
    // in September ...
    const unconfirmed = club({
      membershipCount: 25,
      aprilRenewals: 15,
      membershipBase: 20,
    })
    store.upsertSnapshot('2026-09-11', [district('61', [unconfirmed])])
    expect(store.getClub('3045')?.reached).toEqual({})

    // ... and a crossing once the April data month reads active members.
    store.upsertSnapshot('2027-04-30', [district('61', [unconfirmed])])
    expect(store.getClub('3045')?.reached).toEqual({
      Distinguished: { on: '2027-04-30', after: '2026-09-11' },
    })
  })

  it('is sticky: a later drop below the requirement never revises the crossing', () => {
    const store = ClubRaceStore.create(PY)
    store.upsertSnapshot('2026-08-12', [district('61', [club()])])
    store.upsertSnapshot('2026-08-19', [
      district('61', [club({ dcpGoals: 3, aprilRenewals: 10 })]),
    ])

    expect(store.getClub('3045')?.reached).toEqual({
      Distinguished: { on: '2026-08-12', after: null },
    })
  })

  it('is sticky: a club that vanishes from the roster keeps its crossing', () => {
    const store = ClubRaceStore.create(PY)
    store.upsertSnapshot('2026-08-12', [district('61', [club()])])
    store.upsertSnapshot('2026-08-19', [district('61', [])])

    expect(store.getClub('3045')?.reached).toEqual({
      Distinguished: { on: '2026-08-12', after: null },
    })
    expect(store.observedDates).toEqual(['2026-08-12', '2026-08-19'])
  })

  it('is idempotent: re-applying an already-stored date changes no reachedOn', () => {
    const store = ClubRaceStore.create(PY)
    store.upsertSnapshot('2026-08-12', [district('61', [club()])])
    store.upsertSnapshot('2026-08-19', [
      district('61', [club({ dcpGoals: 7 })]),
    ])
    const before = JSON.stringify({ ...store.toJSON(), updatedAt: null })

    store.upsertSnapshot('2026-08-12', [district('61', [club()])])
    store.upsertSnapshot('2026-08-19', [
      district('61', [club({ dcpGoals: 7 })]),
    ])

    expect(JSON.stringify({ ...store.toJSON(), updatedAt: null })).toBe(before)
  })

  it('takes the EARLIER date when a rebuild walks dates out of order (min)', () => {
    const store = ClubRaceStore.create(PY)
    store.upsertSnapshot('2026-08-31', [district('61', [club()])])
    expect(store.getClub('3045')?.reached.Distinguished).toEqual({
      on: '2026-08-31',
      after: null,
    })

    store.upsertSnapshot('2026-07-31', [district('61', [club()])])
    expect(store.getClub('3045')?.reached.Distinguished).toEqual({
      on: '2026-07-31',
      after: null,
    })
  })

  it('refreshes observedAfter when an earlier date is observed later', () => {
    const store = ClubRaceStore.create(PY)
    // First sighting on 08-31 with nothing earlier known → after: null.
    store.upsertSnapshot('2026-08-31', [district('61', [club()])])
    // A backfill then supplies 07-31, on which this club had NOT crossed.
    store.upsertSnapshot('2026-07-31', [
      district('61', [club({ dcpGoals: 2 })]),
    ])

    expect(store.getClub('3045')?.reached.Distinguished).toEqual({
      on: '2026-08-31',
      after: '2026-07-31',
    })
  })

  it('observedAfter is the previous OBSERVED date, gaps and all', () => {
    const store = ClubRaceStore.create(PY)
    store.upsertSnapshot('2026-08-17', [
      district('61', [club({ dcpGoals: 2 })]),
    ])
    // No snapshot on 08-18.
    store.upsertSnapshot('2026-08-19', [district('61', [club()])])

    expect(store.getClub('3045')?.reached.Distinguished).toEqual({
      on: '2026-08-19',
      after: '2026-08-17',
    })
  })

  it('normalises zero-padded ids so 00003045 and 3045 are one club', () => {
    const store = ClubRaceStore.create(PY)
    store.upsertSnapshot('2026-08-12', [
      district('61', [club({ clubId: '00003045' })]),
    ])
    store.upsertSnapshot('2026-08-19', [
      district('61', [club({ clubId: '3045', dcpGoals: 7 })]),
    ])

    expect(Object.keys(store.clubs)).toEqual(['3045'])
    expect(store.getClub('00003045')?.reached).toEqual({
      Distinguished: { on: '2026-08-12', after: null },
      Select: { on: '2026-08-19', after: '2026-08-12' },
    })
  })

  it('follows a club to its latest district without touching its crossings', () => {
    const store = ClubRaceStore.create(PY)
    store.upsertSnapshot('2026-08-12', [district('61', [club()])])
    store.upsertSnapshot('2026-08-19', [district('86', [club()])])

    const entry = store.getClub('3045')
    expect(entry?.districtId).toBe('86')
    expect(entry?.reached).toEqual({
      Distinguished: { on: '2026-08-12', after: null },
    })

    // An out-of-order EARLIER sighting must not win the district.
    store.upsertSnapshot('2026-07-31', [district('61', [club()])])
    expect(store.getClub('3045')?.districtId).toBe('86')
  })

  it('leaves the clubs of a district absent from a date untouched', () => {
    const store = ClubRaceStore.create(PY)
    store.upsertSnapshot('2026-08-12', [
      district('61', [club()]),
      district('86', [club({ clubId: '777', clubName: 'Other' })]),
    ])
    // District 86's file did not arrive on 08-19.
    store.upsertSnapshot('2026-08-19', [
      district('61', [club({ dcpGoals: 7 })]),
    ])

    expect(store.getClub('777')).toEqual({
      clubId: '777',
      clubName: 'Other',
      districtId: '86',
      lastSeen: '2026-08-12',
      reached: { Distinguished: { on: '2026-08-12', after: null } },
    })
  })

  it("records the first sighting of TI's official code separately from the derived crossing", () => {
    const store = ClubRaceStore.create(PY)
    store.upsertSnapshot('2027-03-31', [district('61', [club()])])
    expect(store.getClub('3045')?.official).toBeUndefined()

    store.upsertSnapshot('2027-04-30', [
      district('61', [club({ distinguishedStatus: 'S' })]),
    ])
    expect(store.getClub('3045')?.official).toEqual({
      code: 'S',
      on: '2027-04-30',
      after: '2027-03-31',
    })

    // A later, higher code does not move the first-seen date.
    store.upsertSnapshot('2027-05-31', [
      district('61', [club({ distinguishedStatus: 'P' })]),
    ])
    expect(store.getClub('3045')?.official?.on).toBe('2027-04-30')
  })

  it('refuses a snapshot date from another program year', () => {
    const store = ClubRaceStore.create(PY)
    expect(() =>
      store.upsertSnapshot('2026-06-30', [district('61', [club()])])
    ).toThrow(/2025-2026/)
  })

  it('summarises what the date added', () => {
    const store = ClubRaceStore.create(PY)
    const first = store.upsertSnapshot('2026-08-12', [
      district('61', [club(), club({ clubId: '9', dcpGoals: 7 })]),
    ])
    expect(first).toEqual({
      date: '2026-08-12',
      clubsObserved: 2,
      newCrossings: { Distinguished: 2, Select: 1, President: 0, Smedley: 0 },
    })

    const again = store.upsertSnapshot('2026-08-12', [
      district('61', [club(), club({ clubId: '9', dcpGoals: 7 })]),
    ])
    expect(again.newCrossings).toEqual({
      Distinguished: 0,
      Select: 0,
      President: 0,
      Smedley: 0,
    })
  })
})

describe('updateClubRaceStore (#1556)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'club-race-update-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('creates the store on first use, then accumulates across runs', async () => {
    const day1 = await updateClubRaceStore(tempDir, '2026-08-12', PY, [
      district('61', [club()]),
    ])
    expect(day1.summary.newCrossings.Distinguished).toBe(1)

    const day2 = await updateClubRaceStore(tempDir, '2026-08-19', PY, [
      district('61', [club({ dcpGoals: 7 })]),
    ])
    expect(day2.store.observedDates).toEqual(['2026-08-12', '2026-08-19'])
    expect(day2.store.getClub('3045')?.reached).toEqual({
      Distinguished: { on: '2026-08-12', after: null },
      Select: { on: '2026-08-19', after: '2026-08-12' },
    })

    const onDisk = JSON.parse(
      await fs.readFile(ClubRaceStore.getPath(tempDir, PY), 'utf-8')
    ) as { observedDates: string[] }
    expect(onDisk.observedDates).toEqual(['2026-08-12', '2026-08-19'])
  })
})
