/**
 * ClubTrendsStore — Incremental per-district club trend accumulation
 *
 * Persists club membership and DCP goal trend arrays across pipeline runs so
 * that only today's snapshot is needed at compute time. Each run loads the
 * existing store, upserts today's data point per club, and saves it back.
 *
 * This mirrors the TimeSeriesIndexWriter pattern: a small JSON file in GCS
 * is downloaded before analytics, updated with the latest scrape, and re-uploaded.
 *
 * Store path: CACHE_DIR/club-trends/{programYear}/district_{id}.json
 *
 * Fixes: #144 — replace all-snapshot loading with incremental aggregation
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { DistrictStatistics } from '@taverns-red/analytics-core'
import type {
  ClubTrend,
  MembershipTrendPoint,
  DcpGoalsTrendPoint,
} from '@taverns-red/analytics-core'
import { calculateProgramYear } from '../utils/CachePaths.js'
import { readStoreFileText } from '../utils/gzipLayers.js'

/**
 * Persisted store for a single district's club trends.
 * Structurally equivalent to ClubTrendsIndex but explicitly versioned and
 * carrying the programYear for correctness checks.
 */
export interface ClubTrendsStoreData {
  districtId: string
  programYear: string
  updatedAt: string
  /**
   * Map of clubId → partial ClubTrend containing only the accumulated
   * trend arrays (membershipTrend, dcpGoalsTrend) plus immutable identity
   * fields (clubName, divisionId, etc.).
   * Health assessment fields (currentStatus, healthScore, riskFactors, …)
   * are NOT stored here — they are recomputed from today's snapshot each run.
   */
  clubs: Record<
    string,
    {
      clubId: string
      clubName: string
      divisionId: string
      divisionName: string
      areaId: string
      areaName: string
      membershipBase?: number
      membershipTrend: MembershipTrendPoint[]
      dcpGoalsTrend: DcpGoalsTrendPoint[]
    }
  >
}

export class ClubTrendsStore {
  private data: ClubTrendsStoreData

  private constructor(data: ClubTrendsStoreData) {
    this.data = data
  }

  // ── Factory methods ───────────────────────────────────────────────────────

  /**
   * Load an existing store from disk, or return null if it doesn't exist yet.
   */
  static async load(
    cacheDir: string,
    programYear: string,
    districtId: string
  ): Promise<ClubTrendsStore | null> {
    const filePath = ClubTrendsStore.getPath(cacheDir, programYear, districtId)
    try {
      // Peels any gzip layers a non-decompressing download left on (#1702).
      const content = await readStoreFileText(filePath)
      const data = JSON.parse(content) as ClubTrendsStoreData
      return new ClubTrendsStore(data)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'ENOENT') return null
      throw err
    }
  }

  /**
   * Create a brand-new empty store for a district.
   */
  static create(districtId: string, programYear: string): ClubTrendsStore {
    return new ClubTrendsStore({
      districtId,
      programYear,
      updatedAt: new Date().toISOString(),
      clubs: {},
    })
  }

  // ── Path helper ───────────────────────────────────────────────────────────

  static getPath(
    cacheDir: string,
    programYear: string,
    districtId: string
  ): string {
    return path.join(
      cacheDir,
      'club-trends',
      programYear,
      `district_${districtId}.json`
    )
  }

  // ── Mutation ──────────────────────────────────────────────────────────────

  /**
   * Upsert today's data point for every club in the snapshot.
   * If the date already exists, the entry is overwritten (idempotent re-runs).
   * Clubs that disappear from the district roster are preserved in the store
   * so historical trend lines remain intact.
   *
   * Order-independent (#1741): a rebuild may walk dates in any order, so the
   * identity fields come from the LATEST date seen for the club, never from
   * whichever date was processed last. An older date only fills a field the
   * latest left at its 'Unknown…' placeholder, which is what an in-order run
   * keeps through its `|| existing` fallback.
   */
  upsertFromSnapshot(date: string, snapshot: DistrictStatistics): void {
    for (const club of snapshot.clubs) {
      const existing = this.data.clubs[club.clubId]

      if (existing && date < latestDate(existing)) {
        fillPlaceholders(existing, club)
        upsertTrendPoints(existing, date, club)
      } else if (!existing) {
        // First time we've seen this club
        this.data.clubs[club.clubId] = {
          clubId: club.clubId,
          clubName: club.clubName,
          divisionId: club.divisionId || 'Unknown',
          divisionName: club.divisionName || 'Unknown Division',
          areaId: club.areaId || 'Unknown',
          areaName: club.areaName || 'Unknown Area',
          membershipBase: club.membershipBase,
          membershipTrend: [{ date, count: club.membershipCount }],
          dcpGoalsTrend: [{ date, goalsAchieved: club.dcpGoals }],
        }
      } else {
        // Update identity fields in case club moved divisions/areas
        existing.clubName = club.clubName
        existing.divisionId = club.divisionId || existing.divisionId
        existing.divisionName = club.divisionName || existing.divisionName
        existing.areaId = club.areaId || existing.areaId
        existing.areaName = club.areaName || existing.areaName
        existing.membershipBase = club.membershipBase
        upsertTrendPoints(existing, date, club)
      }
    }

    this.data.updatedAt = new Date().toISOString()
  }

  // ── Readers ───────────────────────────────────────────────────────────────

  /**
   * Retrieve the accumulated trend data for a club, or null if not found.
   */
  getClub(clubId: string): ClubTrendsStoreData['clubs'][string] | null {
    return this.data.clubs[clubId] ?? null
  }

  /**
   * Return the full clubs map (read-only view).
   */
  get clubs(): ClubTrendsStoreData['clubs'] {
    return this.data.clubs
  }

  get districtId(): string {
    return this.data.districtId
  }

  get programYear(): string {
    return this.data.programYear
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  async save(cacheDir: string): Promise<void> {
    const filePath = ClubTrendsStore.getPath(
      cacheDir,
      this.data.programYear,
      this.data.districtId
    )
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    // Clubs keyed in sorted order, so the bytes do not depend on which date
    // first introduced each club (#1741).
    const clubs: ClubTrendsStoreData['clubs'] = {}
    for (const clubId of Object.keys(this.data.clubs).sort()) {
      clubs[clubId] = this.data.clubs[clubId]!
    }
    await fs.writeFile(
      filePath,
      JSON.stringify({ ...this.data, clubs }, null, 2),
      'utf-8'
    )
  }
}

type StoredClub = ClubTrendsStoreData['clubs'][string]
type ClubSnapshot = DistrictStatistics['clubs'][number]

/** The latest date already in the club's trend (arrays are kept sorted). */
function latestDate(entry: StoredClub): string {
  return entry.membershipTrend[entry.membershipTrend.length - 1]?.date ?? ''
}

/** An older date only fills fields the latest date left as placeholders. */
function fillPlaceholders(entry: StoredClub, club: ClubSnapshot): void {
  if (entry.divisionId === 'Unknown' && club.divisionId) {
    entry.divisionId = club.divisionId
  }
  if (entry.divisionName === 'Unknown Division' && club.divisionName) {
    entry.divisionName = club.divisionName
  }
  if (entry.areaId === 'Unknown' && club.areaId) entry.areaId = club.areaId
  if (entry.areaName === 'Unknown Area' && club.areaName) {
    entry.areaName = club.areaName
  }
}

/** Upsert the date's membership and DCP points, keeping both sorted. */
function upsertTrendPoints(
  entry: StoredClub,
  date: string,
  club: ClubSnapshot
): void {
  const mIdx = entry.membershipTrend.findIndex(p => p.date === date)
  if (mIdx >= 0) {
    entry.membershipTrend[mIdx]!.count = club.membershipCount
  } else {
    entry.membershipTrend.push({ date, count: club.membershipCount })
  }

  const dIdx = entry.dcpGoalsTrend.findIndex(p => p.date === date)
  if (dIdx >= 0) {
    entry.dcpGoalsTrend[dIdx]!.goalsAchieved = club.dcpGoals
  } else {
    entry.dcpGoalsTrend.push({ date, goalsAchieved: club.dcpGoals })
  }

  entry.membershipTrend.sort((a, b) => a.date.localeCompare(b.date))
  entry.dcpGoalsTrend.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Load or create a ClubTrendsStore for the given district and date.
 * Updates the store with today's snapshot data and saves it to disk.
 *
 * @returns The updated ClubTrendsStore (after upsert + save)
 */
export async function updateClubTrendsStore(
  cacheDir: string,
  date: string,
  districtId: string,
  snapshot: DistrictStatistics
): Promise<ClubTrendsStore> {
  const programYear = calculateProgramYear(date)

  let store = await ClubTrendsStore.load(cacheDir, programYear, districtId)
  if (!store) {
    store = ClubTrendsStore.create(districtId, programYear)
  }

  store.upsertFromSnapshot(date, snapshot)
  await store.save(cacheDir)

  return store
}

/**
 * Convert a ClubTrendsStore entry into a partial ClubTrend with the
 * accumulated trend arrays pre-populated. Health assessment fields are
 * intentionally left at defaults — they are filled in by
 * ClubHealthAnalyticsModule.assessClubHealth() from today's snapshot.
 */
export function storeTrendToClubTrend(
  entry: ClubTrendsStoreData['clubs'][string]
): Partial<ClubTrend> {
  return {
    clubId: entry.clubId,
    clubName: entry.clubName,
    divisionId: entry.divisionId,
    divisionName: entry.divisionName,
    areaId: entry.areaId,
    areaName: entry.areaName,
    membershipBase: entry.membershipBase ?? 0,
    membershipTrend: entry.membershipTrend,
    dcpGoalsTrend: entry.dcpGoalsTrend,
  }
}
