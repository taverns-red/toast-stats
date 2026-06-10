/**
 * Unit Tests for PerformanceTargetsData Serialization
 *
 * Verifies JSON round-trip serialization preserves all fields including
 * paidClubsCount, currentProgress, and MetricRankings with nullable values.
 *
 * Converted from property-based tests — PBT generated random objects;
 * replaced with representative fixed test cases covering null values,
 * edge cases, and all field types.
 */

import { describe, it, expect } from 'vitest'
import type { PerformanceTargetsData, MetricRankings } from '../types.js'

function createPerformanceTargetsData(
  overrides: Partial<PerformanceTargetsData> = {}
): PerformanceTargetsData {
  return {
    districtId: 'D42',
    computedAt: '2024-06-15T10:30:00.000Z',
    paidClubsCount: 45,
    currentProgress: {
      membership: 350,
      distinguished: 7,
      clubGrowth: 3,
    },
    paidClubsRankings: {
      worldRank: 25,
      worldPercentile: 85.5,
      regionRank: 3,
      totalDistricts: 150,
      totalInRegion: 20,
      region: 'Region 3',
    },
    membershipPaymentsRankings: {
      worldRank: 30,
      worldPercentile: 80.0,
      regionRank: 5,
      totalDistricts: 150,
      totalInRegion: 20,
      region: 'Region 3',
    },
    distinguishedClubsRankings: {
      worldRank: null,
      worldPercentile: null,
      regionRank: null,
      totalDistricts: 150,
      totalInRegion: 20,
      region: null,
    },
    ...overrides,
  }
}

describe('PerformanceTargetsData Serialization', () => {
  it('should preserve all fields through JSON round-trip', () => {
    const original = createPerformanceTargetsData()
    const deserialized = JSON.parse(
      JSON.stringify(original)
    ) as PerformanceTargetsData

    expect(deserialized.districtId).toBe(original.districtId)
    expect(deserialized.computedAt).toBe(original.computedAt)
    expect(deserialized.paidClubsCount).toBe(original.paidClubsCount)
  })

  it('should preserve paidClubsCount field', () => {
    for (const count of [0, 1, 45, 100, 9999]) {
      const original = createPerformanceTargetsData({ paidClubsCount: count })
      const deserialized = JSON.parse(
        JSON.stringify(original)
      ) as PerformanceTargetsData
      expect(deserialized.paidClubsCount).toBe(count)
    }
  })

  it('should preserve currentProgress.distinguished field', () => {
    for (const distinguished of [0, 1, 7, 50]) {
      const original = createPerformanceTargetsData({
        currentProgress: { membership: 100, distinguished, clubGrowth: 2 },
      })
      const deserialized = JSON.parse(
        JSON.stringify(original)
      ) as PerformanceTargetsData
      expect(deserialized.currentProgress.distinguished).toBe(distinguished)
    }
  })

  it('should preserve all currentProgress fields', () => {
    const original = createPerformanceTargetsData({
      currentProgress: { membership: 999, distinguished: 42, clubGrowth: -5 },
    })
    const deserialized = JSON.parse(
      JSON.stringify(original)
    ) as PerformanceTargetsData

    expect(deserialized.currentProgress.membership).toBe(999)
    expect(deserialized.currentProgress.distinguished).toBe(42)
    expect(deserialized.currentProgress.clubGrowth).toBe(-5)
  })

  it('should preserve MetricRankings with non-null values', () => {
    const original = createPerformanceTargetsData()
    const deserialized = JSON.parse(
      JSON.stringify(original)
    ) as PerformanceTargetsData

    expect(deserialized.paidClubsRankings).toEqual(original.paidClubsRankings)
    expect(deserialized.membershipPaymentsRankings).toEqual(
      original.membershipPaymentsRankings
    )
  })

  it('should preserve MetricRankings with null values', () => {
    const original = createPerformanceTargetsData()
    const deserialized = JSON.parse(
      JSON.stringify(original)
    ) as PerformanceTargetsData

    // distinguishedClubsRankings has null fields
    expect(deserialized.distinguishedClubsRankings.worldRank).toBeNull()
    expect(deserialized.distinguishedClubsRankings.worldPercentile).toBeNull()
    expect(deserialized.distinguishedClubsRankings.regionRank).toBeNull()
    expect(deserialized.distinguishedClubsRankings.region).toBeNull()
    expect(deserialized.distinguishedClubsRankings.totalDistricts).toBe(150)
  })

  it('should produce valid parseable JSON', () => {
    const original = createPerformanceTargetsData()
    const serialized = JSON.stringify(original)

    expect(() => JSON.parse(serialized)).not.toThrow()
    const parsed = JSON.parse(serialized)
    expect(typeof parsed).toBe('object')
    expect(parsed).not.toBeNull()
  })

  it('should produce identical JSON when re-serialized', () => {
    const original = createPerformanceTargetsData()
    const serialized1 = JSON.stringify(original)
    const deserialized = JSON.parse(serialized1) as PerformanceTargetsData
    const serialized2 = JSON.stringify(deserialized)

    expect(serialized1).toBe(serialized2)
  })

  it('should handle edge case district IDs', () => {
    for (const districtId of ['D1', 'D999', 'D42']) {
      const original = createPerformanceTargetsData({ districtId })
      const deserialized = JSON.parse(
        JSON.stringify(original)
      ) as PerformanceTargetsData
      expect(deserialized.districtId).toBe(districtId)
    }
  })

  it('should handle zero values correctly', () => {
    const original = createPerformanceTargetsData({
      paidClubsCount: 0,
      currentProgress: { membership: 0, distinguished: 0, clubGrowth: 0 },
    })
    const deserialized = JSON.parse(
      JSON.stringify(original)
    ) as PerformanceTargetsData

    expect(deserialized.paidClubsCount).toBe(0)
    expect(deserialized.currentProgress.membership).toBe(0)
  })
})
