import { describe, it, expect } from 'vitest'
import {
  confirmedDistinguished,
  withProvisionalDistinguished,
} from '../divisionAreaDistinguished'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import type { DivisionPerformance } from '../divisionStatus'

function club(overrides: Partial<ClubTrend> = {}): ClubTrend {
  return {
    clubId: '1',
    clubName: 'Club',
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: 'A1',
    areaName: 'Area A1',
    membershipTrend: [],
    dcpGoalsTrend: [],
    currentStatus: 'thriving',
    riskFactors: [],
    distinguishedLevel: 'Distinguished',
    isProvisionallyDistinguished: false,
    ...overrides,
  }
}

function area(areaId: string, distinguishedClubs: number) {
  return { areaId, distinguishedClubs } as DivisionPerformance['areas'][number]
}

function division(
  divisionId: string,
  distinguishedClubs: number,
  areas: DivisionPerformance['areas']
): DivisionPerformance {
  return { divisionId, distinguishedClubs, areas } as DivisionPerformance
}

describe('confirmedDistinguished', () => {
  it('is the count itself when no provisional part is recorded', () => {
    expect(confirmedDistinguished({ distinguishedClubs: 5 })).toBe(5)
  })

  it('removes the provisional part', () => {
    expect(
      confirmedDistinguished({
        distinguishedClubs: 5,
        provisionalDistinguishedClubs: 2,
      })
    ).toBe(3)
  })

  it('never goes below zero', () => {
    expect(
      confirmedDistinguished({
        distinguishedClubs: 1,
        provisionalDistinguishedClubs: 4,
      })
    ).toBe(0)
  })
})

describe('withProvisionalDistinguished', () => {
  const clubs = [
    club({ clubId: '1', areaId: 'A1', isProvisionallyDistinguished: true }),
    club({ clubId: '2', areaId: 'A1', isProvisionallyDistinguished: false }),
    club({ clubId: '3', areaId: 'A2', isProvisionallyDistinguished: true }),
    club({
      clubId: '4',
      divisionId: 'B',
      areaId: 'B1',
      isProvisionallyDistinguished: true,
    }),
    club({
      clubId: '5',
      areaId: 'A2',
      distinguishedLevel: 'NotDistinguished',
      isProvisionallyDistinguished: true,
    }),
  ]
  const divisions = [
    division('A', 3, [area('A1', 2), area('A2', 1)]),
    division('B', 1, [area('B1', 1)]),
  ]

  it('counts the provisional clubs per area and per division', () => {
    const [a, b] = withProvisionalDistinguished(divisions, clubs, '2026-03-15')
    expect(a?.provisionalDistinguishedClubs).toBe(2)
    expect(a?.areas.map(x => x.provisionalDistinguishedClubs)).toEqual([1, 1])
    expect(b?.provisionalDistinguishedClubs).toBe(1)
    expect(b?.areas[0]?.provisionalDistinguishedClubs).toBe(1)
  })

  it('leaves the qualifying-today count and the input untouched', () => {
    const out = withProvisionalDistinguished(divisions, clubs, '2026-03-15')
    expect(out[0]?.distinguishedClubs).toBe(3)
    expect(out[0]?.areas[0]?.distinguishedClubs).toBe(2)
    expect(divisions[0]?.provisionalDistinguishedClubs).toBeUndefined()
  })

  it('caps the provisional part at the qualifying-today count', () => {
    const [a] = withProvisionalDistinguished(
      [division('A', 1, [area('A1', 0), area('A2', 1)])],
      clubs,
      '2026-03-15'
    )
    expect(a?.provisionalDistinguishedClubs).toBe(1)
    expect(a?.areas[0]?.provisionalDistinguishedClubs).toBe(0)
  })

  it('returns the divisions unchanged when the club list is unavailable', () => {
    expect(
      withProvisionalDistinguished(divisions, undefined, '2026-03-15')
    ).toBe(divisions)
  })
})
