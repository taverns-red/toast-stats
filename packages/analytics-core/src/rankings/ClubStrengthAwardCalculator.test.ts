/**
 * Tests for ClubStrengthAwardCalculator (#333)
 *
 * District Club Strength Award: 10%+ growth in average club size YoY.
 * avgClubSize = totalMembership / activeClubs
 */

import { describe, it, expect } from 'vitest'
import {
  ClubStrengthAwardCalculator,
  type ClubStrengthInput,
} from './ClubStrengthAwardCalculator.js'

function input(overrides: Partial<ClubStrengthInput>): ClubStrengthInput {
  return {
    districtId: '1',
    districtName: 'District 1',
    region: '1',
    currentAvgClubSize: 20,
    priorYearAvgClubSize: null,
    ...overrides,
  }
}

describe('ClubStrengthAwardCalculator (#333)', () => {
  const calculator = new ClubStrengthAwardCalculator()

  it('should qualify a district with 10%+ growth', () => {
    const result = calculator.calculate([
      input({ currentAvgClubSize: 22, priorYearAvgClubSize: 20 }), // 10%
    ])
    expect(result.qualifyingDistricts).toHaveLength(1)
    expect(result.qualifyingDistricts[0]?.qualifies).toBe(true)
    expect(result.qualifyingDistricts[0]?.growthPercent).toBeCloseTo(10)
  })

  it('should qualify at exactly 10% boundary', () => {
    const result = calculator.calculate([
      input({ currentAvgClubSize: 11, priorYearAvgClubSize: 10 }),
    ])
    expect(result.qualifyingDistricts).toHaveLength(1)
  })

  it('should NOT qualify at 9.9% growth', () => {
    const result = calculator.calculate([
      input({ currentAvgClubSize: 10.99, priorYearAvgClubSize: 10 }),
    ])
    expect(result.qualifyingDistricts).toHaveLength(0)
  })

  it('should NOT qualify when prior year data is null', () => {
    const result = calculator.calculate([
      input({ currentAvgClubSize: 25, priorYearAvgClubSize: null }),
    ])
    expect(result.qualifyingDistricts).toHaveLength(0)
    expect(result.allDistricts[0]?.growthPercent).toBeNull()
  })

  it('should handle 0 prior year avg safely (no division by zero)', () => {
    const result = calculator.calculate([
      input({ currentAvgClubSize: 20, priorYearAvgClubSize: 0 }),
    ])
    expect(result.qualifyingDistricts).toHaveLength(0)
  })

  it('should rank all districts by growth percent descending', () => {
    const result = calculator.calculate([
      input({
        districtId: '1',
        currentAvgClubSize: 22,
        priorYearAvgClubSize: 20,
      }), // 10%
      input({
        districtId: '2',
        currentAvgClubSize: 30,
        priorYearAvgClubSize: 20,
      }), // 50%
      input({
        districtId: '3',
        currentAvgClubSize: 18,
        priorYearAvgClubSize: 20,
      }), // -10%
    ])
    expect(result.allDistricts[0]?.districtId).toBe('2')
    expect(result.allDistricts[1]?.districtId).toBe('1')
    expect(result.allDistricts[2]?.districtId).toBe('3')
    expect(result.qualifyingDistricts).toHaveLength(2) // D1 and D2
  })

  // #1613 — "U" is the undistricted bucket, not a district; it can't
  // receive a district award, so it never ranks or qualifies.
  it('never ranks or qualifies the undistricted "U" bucket (#1613)', () => {
    const result = calculator.calculate([
      input({
        districtId: 'U',
        districtName: 'U',
        currentAvgClubSize: 30,
        priorYearAvgClubSize: 20,
      }),
      input({
        districtId: '16',
        currentAvgClubSize: 24,
        priorYearAvgClubSize: 20,
      }),
    ])
    expect(result.allDistricts.map(d => d.districtId)).toEqual(['16'])
    expect(result.qualifyingDistricts.map(d => d.districtId)).toEqual(['16'])
  })
})
