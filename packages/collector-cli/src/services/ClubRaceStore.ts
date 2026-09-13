/**
 * ClubRaceStore — the crossing-date store behind the worldwide "race to
 * Distinguished" (#1556, spec `docs/specs/global-club-rankings.md` §3.1–3.2).
 *
 * Records, for every club and every Distinguished tier, the FIRST snapshot
 * date on which the club met that tier's requirements, plus the previous
 * observed date so a consumer can say "between 17 Aug and 19 Aug" honestly.
 *
 * Why a store and not a re-scan (R9): the prune policy keeps two snapshots a
 * month, so a crossing date derived after the fact degrades from "the day it
 * happened" to "sometime in a two-week window". Capturing it at collection
 * time is the only way the day survives. Same shape as `ClubTrendsStore`:
 * synced from GCS before compute, upserted with today's snapshot, saved,
 * pushed back — one file per program year:
 *
 *   CACHE_DIR/club-race/{programYear}/first-reached.json
 *
 * Three rules, each pinned by a test:
 *
 * 1. **Sticky.** `reached[tier].on` is written once. A later snapshot where
 *    the club falls below the requirement, or is missing from its district's
 *    roster, never revises it (ruling R-A2). Current standing is not this
 *    file's business — the artifact reads it from the day's snapshot.
 * 2. **Min on rebuild.** Rebuild and rescrape modes may walk dates out of
 *    order. The upsert keeps the EARLIER of the stored date and the
 *    observed one, so re-running any date is idempotent and an earlier
 *    backfill can only sharpen a crossing, never blur it.
 * 3. **Ruling R-A basis.** The tier a club holds at a snapshot is
 *    `determineDistinguishedLevelAtSnapshot` from analytics-core — the
 *    existing ladder read against confirmed April renewals before April 1
 *    and active members from April 1 — never a second copy of the tier table.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  classifyDistinguishedTier,
  determineDistinguishedLevelAtSnapshot,
  programYearForSnapshotDate,
  type ClubStatistics,
  type DistinguishedLevel,
  type DistinguishedTierCode,
} from '@taverns-red/analytics-core'
import { normalizeClubId } from '@taverns-red/shared-contracts'

/** The Distinguished tiers a club can cross, lowest first. */
export const CLUB_RACE_TIERS = [
  'Distinguished',
  'Select',
  'President',
  'Smedley',
] as const

export type ClubRaceTier = (typeof CLUB_RACE_TIERS)[number]

/** Format envelope stamped on the file, versioned like the published artifacts. */
export const CLUB_RACE_STORE_FORMAT = {
  version: '1.0.0',
  type: 'club-race-store',
} as const

/** A dated crossing: the first snapshot it was seen on, and the one before. */
export interface ClubRaceCrossing {
  /** First snapshot date (YYYY-MM-DD) the requirements were met. */
  on: string
  /**
   * The observed snapshot date immediately before `on`, or `null` when `on`
   * is the earliest date this store has ever seen — the club was already
   * over the line when we started looking.
   */
  after: string | null
}

export interface ClubRaceStoreClub {
  /** Canonical club id (`normalizeClubId`), never the zero-padded form. */
  clubId: string
  clubName: string
  /** District at the club's latest sighting; a transfer never resets crossings. */
  districtId: string
  /** Latest snapshot date this club appeared in a district roster. */
  lastSeen: string
  reached: Partial<Record<ClubRaceTier, ClubRaceCrossing>>
  /** First snapshot date TI's official code (D/S/P/M) was seen, and which. */
  official?: ClubRaceCrossing & { code: DistinguishedTierCode }
}

export interface ClubRaceStoreData {
  _format: typeof CLUB_RACE_STORE_FORMAT
  programYear: string
  updatedAt: string
  /** Every snapshot date ever upserted, ascending and unique. */
  observedDates: string[]
  clubs: Record<string, ClubRaceStoreClub>
}

/** One district's clubs at one snapshot date — `district_{id}.json` `data.clubs`. */
export interface ClubRaceDistrictObservation {
  readonly districtId: string
  readonly clubs: readonly ClubStatistics[]
}

/** What one upsert added, for the compute log. */
export interface ClubRaceUpsertSummary {
  date: string
  clubsObserved: number
  newCrossings: Record<ClubRaceTier, number>
}

const TIER_INDEX: Record<ClubRaceTier, number> = {
  Distinguished: 0,
  Select: 1,
  President: 2,
  Smedley: 3,
}

/** Every tier at or below the level held — Select implies Distinguished. */
function tiersReachedAt(level: DistinguishedLevel): readonly ClubRaceTier[] {
  if (level === 'NotDistinguished') return []
  return CLUB_RACE_TIERS.slice(0, TIER_INDEX[level] + 1)
}

const emptyCounts = (): Record<ClubRaceTier, number> => ({
  Distinguished: 0,
  Select: 0,
  President: 0,
  Smedley: 0,
})

export class ClubRaceStore {
  private data: ClubRaceStoreData

  private constructor(data: ClubRaceStoreData) {
    this.data = data
  }

  // ── Factory methods ───────────────────────────────────────────────────────

  static async load(
    cacheDir: string,
    programYear: string
  ): Promise<ClubRaceStore | null> {
    const filePath = ClubRaceStore.getPath(cacheDir, programYear)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return new ClubRaceStore(JSON.parse(content) as ClubRaceStoreData)
    } catch (err) {
      if ((err as { code?: string }).code === 'ENOENT') return null
      throw err
    }
  }

  static create(programYear: string): ClubRaceStore {
    return new ClubRaceStore({
      _format: CLUB_RACE_STORE_FORMAT,
      programYear,
      updatedAt: new Date().toISOString(),
      observedDates: [],
      clubs: {},
    })
  }

  static getPath(cacheDir: string, programYear: string): string {
    return path.join(cacheDir, 'club-race', programYear, 'first-reached.json')
  }

  // ── Mutation ──────────────────────────────────────────────────────────────

  /**
   * Fold one snapshot date into the store.
   *
   * Only the districts supplied are read: a district whose file did not
   * arrive on a date leaves its clubs exactly as they were (no false "lost",
   * no false crossing). The date is recorded as observed regardless, so a
   * later crossing's `after` still points at it.
   */
  upsertSnapshot(
    date: string,
    districts: readonly ClubRaceDistrictObservation[]
  ): ClubRaceUpsertSummary {
    const dateProgramYear = programYearForSnapshotDate(date)
    if (dateProgramYear !== this.data.programYear) {
      throw new Error(
        `ClubRaceStore for ${this.data.programYear} refuses snapshot date ` +
          `${date}, which belongs to ${dateProgramYear}`
      )
    }

    this.recordObservedDate(date)

    const newCrossings = emptyCounts()
    let clubsObserved = 0

    for (const district of districts) {
      for (const club of district.clubs) {
        const clubId = normalizeClubId(club.clubId)
        if (clubId === '') continue
        clubsObserved += 1

        const entry = this.entryFor(clubId, club, district.districtId, date)

        const level = determineDistinguishedLevelAtSnapshot(
          club,
          date,
          this.data.programYear
        )
        for (const tier of tiersReachedAt(level)) {
          const existing = entry.reached[tier]
          if (existing === undefined) {
            entry.reached[tier] = { on: date, after: null }
            newCrossings[tier] += 1
          } else if (date < existing.on) {
            existing.on = date
          }
        }

        const code = classifyDistinguishedTier(club.distinguishedStatus)
        if (code !== null) {
          const existing = entry.official
          if (existing === undefined || date < existing.on) {
            entry.official = { code, on: date, after: null }
          } else if (date === existing.on) {
            existing.code = code
          }
        }
      }
    }

    this.refreshObservedAfter()
    this.data.updatedAt = new Date().toISOString()

    return { date, clubsObserved, newCrossings }
  }

  private entryFor(
    clubId: string,
    club: ClubStatistics,
    districtId: string,
    date: string
  ): ClubRaceStoreClub {
    const existing = this.data.clubs[clubId]
    if (existing === undefined) {
      const created: ClubRaceStoreClub = {
        clubId,
        clubName: club.clubName,
        districtId,
        lastSeen: date,
        reached: {},
      }
      this.data.clubs[clubId] = created
      return created
    }
    // Identity follows the LATEST sighting by date, so an out-of-order
    // rebuild date cannot drag a transferred club back to its old district.
    if (date >= existing.lastSeen) {
      existing.clubName = club.clubName
      existing.districtId = districtId
      existing.lastSeen = date
    }
    return existing
  }

  private recordObservedDate(date: string): void {
    const dates = this.data.observedDates
    if (dates.includes(date)) return
    dates.push(date)
    dates.sort()
  }

  /**
   * `after` is a projection of `observedDates`, recomputed on every upsert
   * rather than trusted from write time: a backfill that supplies an EARLIER
   * date than a stored crossing changes what "the snapshot before" means for
   * every club, not just the ones on that date.
   */
  private refreshObservedAfter(): void {
    for (const entry of Object.values(this.data.clubs)) {
      for (const crossing of Object.values(entry.reached)) {
        crossing.after = this.previousObservedDate(crossing.on)
      }
      if (entry.official) {
        entry.official.after = this.previousObservedDate(entry.official.on)
      }
    }
  }

  // ── Readers ───────────────────────────────────────────────────────────────

  /** The observed snapshot date immediately before `date`, or null. */
  previousObservedDate(date: string): string | null {
    let previous: string | null = null
    for (const observed of this.data.observedDates) {
      if (observed >= date) break
      previous = observed
    }
    return previous
  }

  getClub(clubId: string): ClubRaceStoreClub | null {
    return this.data.clubs[normalizeClubId(clubId)] ?? null
  }

  get clubs(): Readonly<Record<string, ClubRaceStoreClub>> {
    return this.data.clubs
  }

  get observedDates(): readonly string[] {
    return this.data.observedDates
  }

  get programYear(): string {
    return this.data.programYear
  }

  toJSON(): ClubRaceStoreData {
    return this.data
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  async save(cacheDir: string): Promise<void> {
    const filePath = ClubRaceStore.getPath(cacheDir, this.data.programYear)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(this.data, null, 2), 'utf-8')
  }
}

/**
 * Load-or-create the program year's store, fold in one snapshot date, save.
 *
 * `programYear` is passed in rather than re-derived so the caller resolves
 * it once per run and threads it (#1284); the store still refuses a date
 * that does not belong to it.
 */
export async function updateClubRaceStore(
  cacheDir: string,
  snapshotDate: string,
  programYear: string,
  districts: readonly ClubRaceDistrictObservation[]
): Promise<{ store: ClubRaceStore; summary: ClubRaceUpsertSummary }> {
  const store =
    (await ClubRaceStore.load(cacheDir, programYear)) ??
    ClubRaceStore.create(programYear)

  const summary = store.upsertSnapshot(snapshotDate, districts)
  await store.save(cacheDir)

  return { store, summary }
}
