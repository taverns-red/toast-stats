/**
 * DistrictAwardsHistoryStore (#333)
 *
 * GCS-backed persistent store for district year-end summaries.
 * Follows the R9 pattern: sync from GCS → upsert → save → push back.
 *
 * Stores per-district year-end data needed for:
 * - Leadership Excellence Award (3+ consecutive Distinguished years)
 * - Club Strength Award (prior year avg club size for YoY comparison)
 *
 * Single global file: CACHE_DIR/district-awards-history.json
 * (~5 KB for 130 districts x 10 years of small summary objects)
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { readStoreFileText } from '../utils/gzipLayers.js'

export interface DistrictYearSummary {
  programYear: string
  distinguishedTier: string
  avgClubSize: number
  totalMembership: number
  activeClubs: number
  snapshotDate: string
}

interface DistrictAwardsHistoryData {
  version: 1
  updatedAt: string
  districts: Record<string, DistrictYearSummary[]>
}

const FILENAME = 'district-awards-history.json'

export class DistrictAwardsHistoryStore {
  private data: DistrictAwardsHistoryData

  private constructor(data: DistrictAwardsHistoryData) {
    this.data = data
  }

  static async load(
    cacheDir: string
  ): Promise<DistrictAwardsHistoryStore | null> {
    const filePath = path.join(cacheDir, FILENAME)
    try {
      // Peels any gzip layers a non-decompressing download left on (#1702).
      const content = await readStoreFileText(filePath)
      const data = JSON.parse(content) as DistrictAwardsHistoryData
      return new DistrictAwardsHistoryStore(data)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'ENOENT') return null
      throw err
    }
  }

  static create(): DistrictAwardsHistoryStore {
    return new DistrictAwardsHistoryStore({
      version: 1,
      updatedAt: new Date().toISOString(),
      districts: {},
    })
  }

  /**
   * Store `summary` as its program year's entry, unless the stored entry
   * comes from a later snapshot (ADR-015 P4, #1764). A rebuild of a
   * mid-year past date must not regress that year's year-end summary; the
   * in-progress year still updates on every newer date (#1609).
   * `snapshotDate` is the logical date (YYYY-MM-DD), so string order is
   * date order.
   *
   * @returns false when the summary was older than the stored one and was
   *   dropped; true when it was stored.
   */
  upsertYearSummary(districtId: string, summary: DistrictYearSummary): boolean {
    if (!this.data.districts[districtId]) {
      this.data.districts[districtId] = []
    }
    const entries = this.data.districts[districtId]!
    const idx = entries.findIndex(e => e.programYear === summary.programYear)
    if (idx >= 0) {
      if (summary.snapshotDate < entries[idx]!.snapshotDate) return false
      entries[idx] = summary
    } else {
      entries.push(summary)
    }
    entries.sort((a, b) => a.programYear.localeCompare(b.programYear))
    this.data.updatedAt = new Date().toISOString()
    return true
  }

  getHistory(districtId: string): DistrictYearSummary[] {
    return this.data.districts[districtId] ?? []
  }

  getYearSummary(
    districtId: string,
    programYear: string
  ): DistrictYearSummary | null {
    const entries = this.data.districts[districtId]
    if (!entries) return null
    return entries.find(e => e.programYear === programYear) ?? null
  }

  /**
   * Get completed year tiers for Leadership Excellence calculation.
   * Returns only years BEFORE `currentProgramYear`: the current year is
   * excluded, and so is any later year already in the store, which happens
   * when a past snapshot is rebuilt (#1609). "YYYY-YYYY" labels sort
   * lexically in chronological order.
   */
  getCompletedYearTiers(
    districtId: string,
    currentProgramYear: string
  ): Array<{ programYear: string; tier: string }> {
    const entries = this.data.districts[districtId] ?? []
    return entries
      .filter(e => e.programYear < currentProgramYear)
      .map(e => ({ programYear: e.programYear, tier: e.distinguishedTier }))
  }

  async save(cacheDir: string): Promise<void> {
    const filePath = path.join(cacheDir, FILENAME)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const tempPath = `${filePath}.tmp.${Date.now()}`
    await fs.writeFile(tempPath, JSON.stringify(this.data, null, 2), 'utf-8')
    await fs.rename(tempPath, filePath)
  }
}
