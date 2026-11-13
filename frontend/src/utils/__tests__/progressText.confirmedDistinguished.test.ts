/**
 * Division and area narratives name the confirmed Distinguished count, with
 * the clubs still to be confirmed beside it (#2580, part). `distinguishedClubs`
 * is the confirmed count on these surfaces, so the gap sentences follow it.
 */
import { describe, it, expect } from 'vitest'
import { generateDivisionProgressText } from '../divisionProgressText'
import { generateAreaProgressText } from '../areaProgressText'
import { calculateDivisionGapAnalysis } from '../divisionGapAnalysis'
import { calculateAreaGapAnalysis } from '../areaGapAnalysis'
import {
  calculateVisitStatus,
  type AreaPerformance,
  type DivisionPerformance,
} from '../divisionStatus'
import { deriveAreaRecognitionState } from '../areaRecognitionState'

function division(provisional?: number): DivisionPerformance {
  return {
    divisionId: 'A',
    status: 'not-distinguished',
    clubBase: 10,
    paidClubs: 10,
    netGrowth: 0,
    distinguishedClubs: 3,
    provisionalDistinguishedClubs: provisional,
    requiredDistinguishedClubs: 5,
    areas: [],
    cspTracked: false,
    cspSubmittedCount: 0,
    clubsMissingCsp: [],
  }
}

function area(provisional?: number) {
  const visits = calculateVisitStatus(10, 10)
  const base = {
    clubBase: 10,
    paidClubs: 10,
    distinguishedClubs: 3,
  }
  return {
    areaId: 'A1',
    divisionId: 'A',
    status: 'not-distinguished',
    netGrowth: 0,
    provisionalDistinguishedClubs: provisional,
    requiredDistinguishedClubs: 5,
    firstRoundVisits: visits,
    secondRoundVisits: visits,
    isQualified: true,
    recognitionState: deriveAreaRecognitionState({
      ...base,
      firstRoundVisitMet: true,
      secondRoundVisitMet: true,
      snapshotDate: '2026-03-15',
    }),
    currentRound: 2,
    clubsMissingCurrentRoundVisit: [],
    clubsMissingCurrentRoundVisitIneligible: [],
    cspTracked: false,
    clubsMissingCsp: [],
    clubsMissingCspIneligible: [],
    cspSubmittedCount: 0,
    ...base,
  } as AreaPerformance & { divisionId: string }
}

const divisionText = (d: DivisionPerformance) =>
  generateDivisionProgressText(
    d,
    calculateDivisionGapAnalysis({
      clubBase: d.clubBase,
      paidClubs: d.paidClubs,
      distinguishedClubs: d.distinguishedClubs,
    })
  ).progressText

const areaText = (a: AreaPerformance & { divisionId: string }) =>
  generateAreaProgressText(
    a,
    calculateAreaGapAnalysis({
      clubBase: a.clubBase,
      paidClubs: a.paidClubs,
      distinguishedClubs: a.distinguishedClubs,
    })
  ).progressText

describe('progress text, confirmed Distinguished count (#2580)', () => {
  it('division: confirmed count, then the qualifying-today extra', () => {
    expect(divisionText(division(2))).toContain(
      '3 of 10 distinguished (+2 qualifying today)'
    )
  })

  it('area: confirmed count, then the qualifying-today extra', () => {
    expect(areaText(area(2))).toContain(
      '3 of 10 distinguished (+2 qualifying today)'
    )
  })

  it('is unchanged when nothing is provisional or it is unknown', () => {
    for (const text of [
      divisionText(division(0)),
      divisionText(division()),
      areaText(area(0)),
      areaText(area()),
    ]) {
      expect(text).toContain('3 of 10 distinguished')
      expect(text).not.toContain('qualifying today')
    }
  })
})
