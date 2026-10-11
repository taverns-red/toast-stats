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

  it('excludes LATER program years when rebuilding a past year (#1609)', () => {
    // The live history already carries 2026-2027 rows. Rebuilding a 2025-26
    // snapshot must not see them, or every streak counted back from the
    // newest year starts at a NotDistinguished future year and reads 0.
    const store = DistrictAwardsHistoryStore.create()
    store.upsertYearSummary('104', summary('2023-2024', 'Select'))
    store.upsertYearSummary('104', summary('2024-2025', 'Smedley'))
    store.upsertYearSummary('104', summary('2025-2026', 'Smedley'))
    store.upsertYearSummary('104', summary('2026-2027', 'NotDistinguished'))

    const tiers = store.getCompletedYearTiers('104', '2025-2026')
    expect(tiers.map(t => t.programYear)).toEqual(['2023-2024', '2024-2025'])
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

describe('DistrictAwardsHistoryStore date guard (#1764, ADR-015 P4)', () => {
  // Real shape: district 61's 2023-2024 entry from the staging store
  // (gs://toast-stats-data-staging/district-awards-history.json, 2026-10-11).
  const yearEnd2324: DistrictYearSummary = {
    programYear: '2023-2024',
    distinguishedTier: 'NotDistinguished',
    avgClubSize: 16.162650602409638,
    totalMembership: 2683,
    activeClubs: 166,
    snapshotDate: '2024-06-30',
  }
  const midYear2324: DistrictYearSummary = {
    programYear: '2023-2024',
    distinguishedTier: 'Distinguished',
    avgClubSize: 15.1,
    totalMembership: 2500,
    activeClubs: 165,
    snapshotDate: '2024-01-31',
  }

  it('rebuilding a mid-year past date leaves the year-end summary unchanged', () => {
    const store = DistrictAwardsHistoryStore.create()
    store.upsertYearSummary('61', yearEnd2324)

    const accepted = store.upsertYearSummary('61', midYear2324)

    expect(store.getYearSummary('61', '2023-2024')).toEqual(yearEnd2324)
    expect(accepted).toBe(false)
  })

  it('a later snapshot of the in-progress PY replaces the stored one (#1609)', () => {
    const store = DistrictAwardsHistoryStore.create()
    store.upsertYearSummary('61', {
      ...midYear2324,
      programYear: '2026-2027',
      snapshotDate: '2026-10-09',
    })
    const later: DistrictYearSummary = {
      ...midYear2324,
      programYear: '2026-2027',
      snapshotDate: '2026-10-10',
      distinguishedTier: 'Select',
    }

    expect(store.upsertYearSummary('61', later)).toBe(true)
    expect(store.getYearSummary('61', '2026-2027')).toEqual(later)
  })

  it('re-deriving the same date replaces the entry (idempotent re-run)', () => {
    const store = DistrictAwardsHistoryStore.create()
    store.upsertYearSummary('61', yearEnd2324)
    const rederived = { ...yearEnd2324, totalMembership: 2690 }

    expect(store.upsertYearSummary('61', rederived)).toBe(true)
    expect(store.getYearSummary('61', '2023-2024')).toEqual(rederived)
  })

  it('a mid-year summary for a PY with no entry is accepted', () => {
    const store = DistrictAwardsHistoryStore.create()
    expect(store.upsertYearSummary('61', midYear2324)).toBe(true)
    expect(store.getYearSummary('61', '2023-2024')).toEqual(midYear2324)
  })
})
