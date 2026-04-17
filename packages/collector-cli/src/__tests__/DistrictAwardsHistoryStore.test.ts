/**
 * Tests for DistrictAwardsHistoryStore (#333)
 *
 * GCS-backed persistent store for district year-end summaries.
 * Follows the R9 pattern: sync → upsert → save → push.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { DistrictAwardsHistoryStore } from '../services/DistrictAwardsHistoryStore.js'
import type { DistrictYearSummary } from '../services/DistrictAwardsHistoryStore.js'

describe('DistrictAwardsHistoryStore (#333)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'awards-history-test-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  const summary = (
    programYear: string,
    tier: string = 'Distinguished'
  ): DistrictYearSummary => ({
    programYear,
    distinguishedTier: tier,
    avgClubSize: 20,
    totalMembership: 2000,
    activeClubs: 100,
    snapshotDate: `${programYear.split('-')[1]}-06-30`,
  })

  it('should create an empty store', () => {
    const store = DistrictAwardsHistoryStore.create()
    expect(store.getHistory('61')).toEqual([])
  })

  it('should return null when loading non-existent file', async () => {
    const store = await DistrictAwardsHistoryStore.load(tempDir)
    expect(store).toBeNull()
  })

  it('should upsert a new year summary', () => {
    const store = DistrictAwardsHistoryStore.create()
    store.upsertYearSummary('61', summary('2024-2025'))

    const history = store.getHistory('61')
    expect(history).toHaveLength(1)
    expect(history[0]?.programYear).toBe('2024-2025')
  })

  it('should replace existing entry for same programYear (idempotent)', () => {
    const store = DistrictAwardsHistoryStore.create()
    store.upsertYearSummary('61', summary('2024-2025', 'Distinguished'))
    store.upsertYearSummary('61', summary('2024-2025', 'Presidents'))

    const history = store.getHistory('61')
    expect(history).toHaveLength(1)
    expect(history[0]?.distinguishedTier).toBe('Presidents')
  })

  it('should return history sorted ascending by programYear', () => {
    const store = DistrictAwardsHistoryStore.create()
    store.upsertYearSummary('61', summary('2024-2025'))
    store.upsertYearSummary('61', summary('2022-2023'))
    store.upsertYearSummary('61', summary('2023-2024'))

    const history = store.getHistory('61')
    expect(history.map(h => h.programYear)).toEqual([
      '2022-2023',
      '2023-2024',
      '2024-2025',
    ])
  })

  it('should get a specific year summary', () => {
    const store = DistrictAwardsHistoryStore.create()
    store.upsertYearSummary('61', summary('2024-2025', 'Select'))

    expect(store.getYearSummary('61', '2024-2025')?.distinguishedTier).toBe(
      'Select'
    )
    expect(store.getYearSummary('61', '2023-2024')).toBeNull()
  })

  it('should get completed year tiers excluding current year', () => {
    const store = DistrictAwardsHistoryStore.create()
    store.upsertYearSummary('61', summary('2022-2023', 'Distinguished'))
    store.upsertYearSummary('61', summary('2023-2024', 'Select'))
    store.upsertYearSummary('61', summary('2024-2025', 'Presidents'))
    store.upsertYearSummary('61', summary('2025-2026', 'Smedley'))

    // Current year = 2025-2026, should be excluded
    const tiers = store.getCompletedYearTiers('61', '2025-2026')
    expect(tiers).toHaveLength(3)
    expect(tiers.map(t => t.programYear)).toEqual([
      '2022-2023',
      '2023-2024',
      '2024-2025',
    ])
  })

  it('should save and load round-trip correctly', async () => {
    const store = DistrictAwardsHistoryStore.create()
    store.upsertYearSummary('61', summary('2023-2024', 'Select'))
    store.upsertYearSummary('42', summary('2023-2024', 'Presidents'))

    await store.save(tempDir)

    const loaded = await DistrictAwardsHistoryStore.load(tempDir)
    expect(loaded).not.toBeNull()
    expect(loaded!.getHistory('61')).toHaveLength(1)
    expect(loaded!.getHistory('42')).toHaveLength(1)
    expect(loaded!.getYearSummary('61', '2023-2024')?.distinguishedTier).toBe(
      'Select'
    )
  })
})
