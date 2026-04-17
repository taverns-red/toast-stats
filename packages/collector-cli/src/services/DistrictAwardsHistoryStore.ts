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
      const content = await fs.readFile(filePath, 'utf-8')
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

  upsertYearSummary(districtId: string, summary: DistrictYearSummary): void {
    if (!this.data.districts[districtId]) {
      this.data.districts[districtId] = []
    }
    const entries = this.data.districts[districtId]!
    const idx = entries.findIndex(e => e.programYear === summary.programYear)
    if (idx >= 0) {
      entries[idx] = summary
    } else {
      entries.push(summary)
    }
    entries.sort((a, b) => a.programYear.localeCompare(b.programYear))
    this.data.updatedAt = new Date().toISOString()
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
   * Excludes the current (in-progress) program year.
   */
  getCompletedYearTiers(
    districtId: string,
    currentProgramYear: string
  ): Array<{ programYear: string; tier: string }> {
    const entries = this.data.districts[districtId] ?? []
    return entries
      .filter(e => e.programYear !== currentProgramYear)
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
