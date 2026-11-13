/**
 * Division and area Distinguished counts come from the pipeline's
 * `distinguishedCountsByDivision` (#2553, #2580). Expected values here are
 * hand-written fixture numbers, never computed with the helper under test.
 */
import { describe, it, expect } from 'vitest'
import { applyPipelineDistinguished } from '../divisionAreaDistinguished'
import type { DivisionDistinguishedCountsRow } from '../../hooks/useDistrictAnalytics'
import type { DivisionPerformance } from '../divisionStatus'
import { withRecognitionState } from '../../test-utils/areaFixture'

const visits = {
  completed: 8,
  required: 8,
  percentage: 100,
  meetsThreshold: true,
}

function area(areaId: string, distinguishedClubs: number) {
  return withRecognitionState(
    {
      areaId,
      status: 'distinguished',
      clubBase: 10,
      paidClubs: 10,
      netGrowth: 0,
      distinguishedClubs,
      requiredDistinguishedClubs: 5,
      firstRoundVisits: visits,
      secondRoundVisits: visits,
      isQualified: true,
    },
    '2026-03-15'
  )
}

function division(
  divisionId: string,
  distinguishedClubs: number,
  areas: DivisionPerformance['areas']
): DivisionPerformance {
  return {
    divisionId,
    status: 'distinguished',
    clubBase: 10,
    paidClubs: 10,
    netGrowth: 0,
    distinguishedClubs,
    requiredDistinguishedClubs: 5,
    areas,
    cspTracked: false,
    cspSubmittedCount: 0,
    clubsMissingCsp: [],
  }
}

const counts = (confirmed: number, provisional: number) => ({
  confirmed,
  provisional,
})

// D61 on 2026-11-12, as published: A=(1,0) B=(0,1) F=(1,1) H=(0,2).
const D61_BY_DIVISION: DivisionDistinguishedCountsRow[] = [
  {
    divisionId: 'A',
    distinguishedCounts: counts(1, 0),
    areas: [{ areaId: 'A1', distinguishedCounts: counts(1, 0) }],
  },
  {
    divisionId: 'B',
    distinguishedCounts: counts(0, 1),
    areas: [{ areaId: 'B1', distinguishedCounts: counts(0, 1) }],
  },
  {
    divisionId: 'F',
    distinguishedCounts: counts(1, 1),
    areas: [
      { areaId: 'F1', distinguishedCounts: counts(1, 0) },
      { areaId: 'F2', distinguishedCounts: counts(0, 1) },
    ],
  },
  {
    divisionId: 'H',
    distinguishedCounts: counts(0, 2),
    areas: [{ areaId: 'H1', distinguishedCounts: counts(0, 2) }],
  },
]
const D61_DISTRICT_KPI = { confirmed: 2, provisional: 4 }

const D61 = [
  division('A', 1, [area('A1', 1)]),
  division('B', 1, [area('B1', 1)]),
  division('F', 2, [area('F1', 1), area('F2', 1)]),
  division('H', 2, [area('H1', 2)]),
]

describe('applyPipelineDistinguished', () => {
  it('takes the headline from the confirmed count and the extra from provisional', () => {
    const [a, b, f, h] = applyPipelineDistinguished(
      D61,
      D61_BY_DIVISION,
      '2026-03-15'
    )
    expect([a, b, f, h].map(d => d?.distinguishedClubs)).toEqual([1, 0, 1, 0])
    expect([a, b, f, h].map(d => d?.provisionalDistinguishedClubs)).toEqual([
      0, 1, 1, 2,
    ])
    expect(f?.areas.map(x => x.distinguishedClubs)).toEqual([1, 0])
    expect(f?.areas.map(x => x.provisionalDistinguishedClubs)).toEqual([0, 1])
  })

  it('division sums equal the district KPI', () => {
    const out = applyPipelineDistinguished(D61, D61_BY_DIVISION, '2026-03-15')
    const sum = (pick: (d: DivisionPerformance) => number | undefined) =>
      out.reduce((n, d) => n + (pick(d) ?? 0), 0)
    expect(sum(d => d.distinguishedClubs)).toBe(D61_DISTRICT_KPI.confirmed)
    expect(sum(d => d.provisionalDistinguishedClubs)).toBe(
      D61_DISTRICT_KPI.provisional
    )
  })

  it('does not cap the pipeline count at the snapshot count', () => {
    // A club confirmed at a lower tier than the snapshot shows still counts.
    const [a] = applyPipelineDistinguished(
      [division('A', 1, [area('A1', 1)])],
      [
        {
          divisionId: 'A',
          distinguishedCounts: counts(3, 0),
          areas: [{ areaId: 'A1', distinguishedCounts: counts(3, 0) }],
        },
      ],
      '2026-03-15'
    )
    expect(a?.distinguishedClubs).toBe(3)
    expect(a?.areas[0]?.distinguishedClubs).toBe(3)
  })

  it('puts status and recognition on the confirmed count too', () => {
    // required 5; the snapshot says 5 qualify today, 2 of them unconfirmed.
    const input = [division('A', 5, [area('A1', 5)])]
    const [a] = applyPipelineDistinguished(
      input,
      [
        {
          divisionId: 'A',
          distinguishedCounts: counts(3, 2),
          areas: [{ areaId: 'A1', distinguishedCounts: counts(3, 2) }],
        },
      ],
      '2026-03-15'
    )
    expect(a?.status).toBe('not-distinguished')
    expect(a?.areas[0]?.status).not.toBe('distinguished')
    expect(a?.areas[0]?.recognitionState).not.toEqual(
      input[0]?.areas[0]?.recognitionState
    )
  })

  it('leaves the input untouched', () => {
    applyPipelineDistinguished(D61, D61_BY_DIVISION, '2026-03-15')
    expect(D61[1]?.distinguishedClubs).toBe(1)
    expect(D61[1]?.provisionalDistinguishedClubs).toBeUndefined()
  })

  it('returns the divisions unchanged when the field is absent (old snapshots)', () => {
    expect(applyPipelineDistinguished(D61, undefined, '2026-03-15')).toBe(D61)
  })

  it('leaves a division or area the field does not list as it was', () => {
    const [a, b] = applyPipelineDistinguished(
      [division('A', 1, [area('A1', 1)]), division('B', 1, [area('B1', 1)])],
      [
        {
          divisionId: 'A',
          distinguishedCounts: counts(0, 1),
          areas: [],
        },
      ],
      '2026-03-15'
    )
    expect(a?.distinguishedClubs).toBe(0)
    expect(a?.areas[0]?.distinguishedClubs).toBe(1)
    expect(a?.areas[0]?.provisionalDistinguishedClubs).toBeUndefined()
    expect(b?.distinguishedClubs).toBe(1)
    expect(b?.provisionalDistinguishedClubs).toBeUndefined()
  })
})
