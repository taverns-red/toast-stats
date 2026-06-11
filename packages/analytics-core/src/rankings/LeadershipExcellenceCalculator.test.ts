/**
 * Tests for LeadershipExcellenceCalculator (#333)
 *
 * District Leadership Excellence Award: 3+ consecutive years Distinguished.
 * Any Distinguished tier counts (Distinguished, Select, Presidents, Smedley).
 */

import { describe, it, expect } from 'vitest'
import {
  LeadershipExcellenceCalculator,
  type LeadershipExcellenceInput,
} from './LeadershipExcellenceCalculator.js'
import type { DistinguishedDistrictTier } from './DistinguishedDistrictCalculator.js'

function input(
  overrides: Partial<LeadershipExcellenceInput>
): LeadershipExcellenceInput {
  return {
    districtId: '1',
    districtName: 'District 1',
    region: '1',
    yearEndTiers: [],
    ...overrides,
  }
}

function tier(
  programYear: string,
  t: DistinguishedDistrictTier
): { programYear: string; tier: DistinguishedDistrictTier } {
  return { programYear, tier: t }
}

describe('LeadershipExcellenceCalculator (#333)', () => {
  const calculator = new LeadershipExcellenceCalculator()

  it('should qualify with 3 consecutive Distinguished years', () => {
    const result = calculator.calculate([
      input({
        yearEndTiers: [
          tier('2022-2023', 'Distinguished'),
          tier('2023-2024', 'Select'),
          tier('2024-2025', 'Presidents'),
        ],
      }),
    ])
    expect(result.qualifyingDistricts).toHaveLength(1)
    expect(result.qualifyingDistricts[0]?.consecutiveYears).toBe(3)
  })

  it('should NOT qualify with only 2 consecutive years', () => {
    const result = calculator.calculate([
      input({
        yearEndTiers: [
          tier('2023-2024', 'Distinguished'),
          tier('2024-2025', 'Select'),
        ],
      }),
    ])
    expect(result.qualifyingDistricts).toHaveLength(0)
    expect(result.allDistricts[0]?.consecutiveYears).toBe(2)
  })

  it('should break streak on NotDistinguished year', () => {
    const result = calculator.calculate([
      input({
        yearEndTiers: [
          tier('2021-2022', 'Distinguished'),
          tier('2022-2023', 'NotDistinguished'), // breaks streak
          tier('2023-2024', 'Select'),
          tier('2024-2025', 'Presidents'),
        ],
      }),
    ])
    expect(result.allDistricts[0]?.consecutiveYears).toBe(2) // only 2023-2024 + 2024-2025
  })

  it('should count all Distinguished tier variants', () => {
    const result = calculator.calculate([
      input({
        yearEndTiers: [
          tier('2022-2023', 'Smedley'),
          tier('2023-2024', 'Presidents'),
          tier('2024-2025', 'Distinguished'),
        ],
      }),
    ])
    expect(result.qualifyingDistricts).toHaveLength(1)
    expect(result.qualifyingDistricts[0]?.consecutiveYears).toBe(3)
  })

  it('should return 0 consecutive years for empty history', () => {
    const result = calculator.calculate([input({ yearEndTiers: [] })])
    expect(result.allDistricts[0]?.consecutiveYears).toBe(0)
    expect(result.qualifyingDistricts).toHaveLength(0)
  })

  it('should count streak from the most recent year backwards', () => {
    const result = calculator.calculate([
      input({
        yearEndTiers: [
          tier('2019-2020', 'Distinguished'),
          tier('2020-2021', 'Distinguished'),
          tier('2021-2022', 'NotDistinguished'),
          tier('2022-2023', 'Presidents'),
          tier('2023-2024', 'Select'),
          tier('2024-2025', 'Distinguished'),
        ],
      }),
    ])
    // Streak is only 2022-2023 + 2023-2024 + 2024-2025 = 3
    expect(result.allDistricts[0]?.consecutiveYears).toBe(3)
    expect(result.qualifyingDistricts).toHaveLength(1)
  })

  it('should handle gap in year data (missing year breaks streak)', () => {
    const result = calculator.calculate([
      input({
        yearEndTiers: [
          tier('2022-2023', 'Distinguished'),
          // 2023-2024 missing
          tier('2024-2025', 'Distinguished'),
        ],
      }),
    ])
    // Missing year = break. Only 2024-2025 counts.
    expect(result.allDistricts[0]?.consecutiveYears).toBe(1)
  })

  it('should rank districts by consecutive years descending', () => {
    const result = calculator.calculate([
      input({
        districtId: '1',
        yearEndTiers: [
          tier('2022-2023', 'Distinguished'),
          tier('2023-2024', 'Distinguished'),
          tier('2024-2025', 'Distinguished'),
        ],
      }),
      input({
        districtId: '2',
        yearEndTiers: [
          tier('2020-2021', 'Presidents'),
          tier('2021-2022', 'Select'),
          tier('2022-2023', 'Distinguished'),
          tier('2023-2024', 'Presidents'),
          tier('2024-2025', 'Smedley'),
        ],
      }),
    ])
    expect(result.allDistricts[0]?.districtId).toBe('2') // 5 years
    expect(result.allDistricts[1]?.districtId).toBe('1') // 3 years
  })

  it('Unknown tier breaks a streak — unprovable years never count as Distinguished (#1116 item 5)', () => {
    const result = calculator.calculate([
      input({
        yearEndTiers: [
          tier('2022-2023', 'Distinguished'),
          tier('2023-2024', 'Unknown'),
          tier('2024-2025', 'Distinguished'),
          tier('2025-2026', 'Select'),
        ],
      }),
    ])
    expect(result.qualifyingDistricts).toHaveLength(0)
    expect(result.allDistricts[0]?.consecutiveYears).toBe(2)
  })
})
