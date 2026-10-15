/**
 * The worldwide scoreboard, pinned to the frozen 2026-06-30 capture
 * (#1498, epic #1496).
 *
 * Every number below was live-verified against
 * `gs://toast-stats-data-ca/snapshots/2026-06-30/` on 2026-08-31 and written
 * into the sibling fixture, so the assertions are a REGRESSION guard on our
 * own definitions — not a fit to TI's published figures.
 *
 * Four of them are also externally corroborated: TI's CEO Report publishes
 * 548,483 membership payments and the exact 2025-26 club-tier split
 * (6,587 / 1,037 / 1,289 / 1,912 → base 2,349). TI's 932 new clubs,
 * 733 suspensions and 265,512 Mar-31 membership are DIFFERENT bases and are
 * deliberately not asserted here: the epic's ruling is publish ours, state
 * our basis, never calibrate toward theirs (#1426, 2026-08-31).
 *
 * 2026-06-30 is the hard case on purpose. Its directory holds the 128
 * districts that existed at the 2025-26 close PLUS 30 renumbered PY 2026-27
 * districts (#1465), and 4,673 clubs appear under two districts. Everything
 * here therefore goes through `rollUpGlobal`, scoped to the date's own
 * `all-districts-rankings.json` district set.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DistrictRanking } from '@taverns-red/shared-contracts'
import { buildGlobalTotals } from '../../../packages/analytics-core/src/rollup/globalTotals.js'
import type { DistrictClubPayments } from '../../../packages/analytics-core/src/rollup/globalRollup.js'
import { CEO_REPORT_MEMBERSHIP_PAYMENTS } from '../ceoReportOracle'

const FIXTURE = join(
  __dirname,
  'fixtures',
  'global-rollup',
  '2026-06-30-global-rollup.json'
)

/**
 * `[club id VERBATIM, Total to Date, Active Members, Charter Date/Suspend
 * Date, index into `countries` (-1 = Find-A-Club never matched it)]`.
 */
type FixtureClub = [string, number, number, string, number]

interface Fixture {
  snapshotDate: string
  countries: string[]
  rankings: DistrictRanking[]
  districts: Array<{ districtId: string; clubs: FixtureClub[] }>
}

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf-8')) as Fixture

const districts: DistrictClubPayments[] = fixture.districts.map(d => ({
  districtId: d.districtId,
  clubs: d.clubs.map(([clubId, payments, activeMembers, status, country]) => ({
    clubId,
    payments,
    activeMembers,
    clubStatusField: status,
    country: country < 0 ? undefined : fixture.countries[country],
  })),
}))

/** Built once, lazily, so a throw surfaces per-test rather than at import. */
let built: ReturnType<typeof buildGlobalTotals> | undefined
const totals = () =>
  (built ??= buildGlobalTotals({
    snapshotDate: fixture.snapshotDate,
    districts,
    rankings: fixture.rankings,
  }))

describe('buildGlobalTotals — 2026-06-30 (#1498)', () => {
  it('scopes to the date’s own 128-district set and reports the 30 strays', () => {
    expect(totals().date).toBe('2026-06-30')
    expect(totals().programYear).toBe('2025-2026')
    expect(totals().districts.total).toBe(128)
    // TI's own "N districts" basis — every row except the undistricted bucket.
    expect(totals().districts.numbered).toBe(127)
    expect(totals().districts.includesUndistricted).toBe(true)
    expect(totals().districts.excludedDistricts).toHaveLength(30)
    expect(totals().districts.missingDistricts).toEqual([])
    // Scoping alone removes every double-filed club: nothing left to dedup.
    expect(totals().districts.duplicateClubs).toEqual([])
  })

  it('sums membership and payments over each club counted once', () => {
    expect(totals().membership.totalPayments).toBe(
      CEO_REPORT_MEMBERSHIP_PAYMENTS['2025-2026']
    )
    expect(totals().membership.totalPayments).toBe(548483)
    expect(totals().membership.totalMembership).toBe(257398)
    expect(totals().membership.clubsCounted).toBe(15016)
    expect(totals().membership.paidClubs).toBe(13708)
    expect(totals().membership.activeClubs).toBe(14282)
    // June-30 membership ÷ paid clubs — the basis ruled on #1426 (2026-08-19).
    expect(totals().membership.avgClubSize).toBeCloseTo(257398 / 13708, 5)
  })

  it('sums the RANKINGS tier fields, where they are or-better + subsets', () => {
    // #1124 / epic F4: `district_{id}.json` totals are DISJOINT per-tier
    // counts; the rankings fields are or-better plus subsets. Mixing the two
    // surfaces produces a plausible wrong number.
    expect(totals().distinguishedClubs.distinguishedOrBetter).toBe(6587)
    expect(totals().distinguishedClubs.select).toBe(1037)
    expect(totals().distinguishedClubs.presidents).toBe(1289)
    expect(totals().distinguishedClubs.smedley).toBe(1912)
    expect(totals().distinguishedClubs.base).toBe(2349)
    expect(totals().distinguishedClubs.percentOfPaidClubs).toBeCloseTo(
      (6587 / 13708) * 100,
      5
    )
  })

  it('scores distinguished districts under the snapshot’s own program year', () => {
    expect(totals().distinguishedDistricts.byTier).toEqual({
      Distinguished: 21,
      Select: 5,
      Presidents: 5,
      Smedley: 11,
      // 85, not 86: the undistricted `U` row is a bucket of clubs belonging to
      // no district and cannot earn Distinguished District recognition, so it
      // is not scored. It IS counted in every club-level sum above.
      NotDistinguished: 85,
      Unknown: 0,
    })
    expect(totals().distinguishedDistricts.distinguishedOrBetter).toBe(42)
    // One district basis, not two: every scored row is a numbered district.
    const scored = Object.values(totals().distinguishedDistricts.byTier).reduce(
      (sum, n) => sum + n,
      0
    )
    expect(scored).toBe(totals().districts.numbered)
    expect(scored).toBe(127)
    // #1116 item 5 — an undefined verdict is its own bucket, never a failure.
    expect(totals().distinguishedDistricts.undefinedVerdictDistricts).toEqual(
      []
    )
  })

  it('counts charters and suspensions inside the snapshot date’s program year', () => {
    // Ruling #5 (#1426, 2026-08-19): never labelled plain "new clubs" — this
    // counts only charters still paid at the snapshot date.
    //
    // 932/733, not 913/716 (#1540). The frozen capture is unchanged; the
    // earlier pair lost the 19 rows whose single cell carries BOTH branches
    // (`Charter 09/30/25 Susp 03/31/26`) to two `^`-anchored parsers. That
    // these land exactly on TI's published 932 and 733 is corroboration read
    // after the fact, never the target — ruling #1426 stands: publish ours,
    // state our basis, never calibrate.
    expect(totals().clubMovement.newClubsStillActive).toBe(932)
    expect(totals().clubMovement.suspendedClubs).toBe(733)
  })

  it('publishes the unknown-country bucket rather than dropping it', () => {
    const { countries, unknown } = totals().clubsByCountry
    expect(unknown).toBe(6786)
    expect(countries).toHaveLength(94)
    expect(countries[0]).toEqual({ country: 'United States', clubs: 2085 })
    // Descending, and no club escapes the breakdown (epic finding F2).
    const listed = countries.reduce((sum, row) => sum + row.clubs, 0)
    expect(listed + unknown).toBe(totals().membership.clubsCounted)
    for (let i = 1; i < countries.length; i++) {
      expect(countries[i]!.clubs).toBeLessThanOrEqual(countries[i - 1]!.clubs)
    }
  })
})

describe('buildGlobalTotals — a listed district whose clubs were not read (#2042)', () => {
  // The 2026-06-30 capture minus one real district's file: the rankings row
  // stays (all-districts.csv is real), its club report does not.
  const dropped = fixture.rankings.find(row => row.districtId !== 'U')!
  const withoutDropped = districts.filter(
    d => d.districtId !== dropped.districtId
  )
  const build = (reasons?: Readonly<Record<string, string>>) =>
    buildGlobalTotals({
      snapshotDate: fixture.snapshotDate,
      districts: withoutDropped,
      rankings: fixture.rankings,
      uncountedReasons: reasons,
    })

  it('names it with the recorded reason and its rankings-row size', () => {
    const reason = 'club-performance.csv is not a CSV (#1671)'
    const built = build({ [dropped.districtId]: reason })
    expect(built.districts.missingDistricts).toEqual([dropped.districtId])
    expect(built.districts.uncountedDistricts).toEqual([
      {
        districtId: dropped.districtId,
        reason,
        paidClubs: dropped.paidClubs,
        activeClubs: dropped.activeClubs,
      },
    ])
  })

  it('says "no district file" when no reason was recorded, never omits it', () => {
    const [entry] = build().districts.uncountedDistricts ?? []
    expect(entry?.districtId).toBe(dropped.districtId)
    expect(entry?.reason).toMatch(/no district file/)
  })

  it('divides membership by the COUNTED districts’ paid clubs only', () => {
    const built = build()
    expect(built.membership.paidClubs).toBe(13708)
    expect(built.membership.avgClubSize).toBeCloseTo(
      built.membership.totalMembership / (13708 - dropped.paidClubs),
      10
    )
  })

  it('emits an empty list when every listed district was counted', () => {
    expect(totals().districts.uncountedDistricts).toEqual([])
  })
})
