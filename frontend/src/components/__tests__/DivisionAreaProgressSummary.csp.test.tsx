/**
 * DivisionAreaProgressSummary — Club Success Plan clause (#1555).
 *
 * The overview list is fed by the pure generators, so the division and area
 * paragraphs must carry the CSP sentences with NO component-level logic, must
 * stay silent for a not-tracked (pre-2025-26) fixture, and the explanatory
 * footer must name Club Success Plan status among what the prose covers.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { DivisionAreaProgressSummary } from '../DivisionAreaProgressSummary'
import type { DivisionPerformance } from '../../utils/divisionStatus'
import { withRecognitionState } from '../../test-utils/areaFixture'

afterEach(() => cleanup())

function division(
  csp: Pick<
    DivisionPerformance,
    'cspTracked' | 'cspSubmittedCount' | 'clubsMissingCspCount'
  >,
  area: Parameters<typeof withRecognitionState>[0]
): DivisionPerformance {
  return {
    divisionId: 'A',
    status: 'not-distinguished',
    clubBase: 5,
    paidClubs: 5,
    netGrowth: 0,
    distinguishedClubs: 0,
    requiredDistinguishedClubs: 3,
    areas: [withRecognitionState(area, '2026-09-11')],
    ...csp,
  }
}

const baseArea: Parameters<typeof withRecognitionState>[0] = {
  areaId: '01',
  status: 'not-distinguished',
  clubBase: 5,
  paidClubs: 5,
  netGrowth: 0,
  distinguishedClubs: 0,
  requiredDistinguishedClubs: 3,
  firstRoundVisits: {
    completed: 5,
    required: 4,
    percentage: 100,
    meetsThreshold: true,
  },
  secondRoundVisits: {
    completed: 5,
    required: 4,
    percentage: 100,
    meetsThreshold: true,
  },
  isQualified: true,
}

describe('DivisionAreaProgressSummary — Club Success Plan clause (#1555)', () => {
  it('renders the division count clause and the area named-clubs clause from the generators', () => {
    render(
      <DivisionAreaProgressSummary
        divisions={[
          division(
            { cspTracked: true, cspSubmittedCount: 2, clubsMissingCspCount: 3 },
            {
              ...baseArea,
              cspTracked: true,
              cspSubmittedCount: 2,
              clubsMissingCsp: [
                { clubNumber: '1', clubName: 'Limestone City Club' },
                { clubNumber: '2', clubName: 'CFB Kingston Toastmasters' },
                { clubNumber: '3', clubName: 'KEYS Toastmasters Club' },
              ],
            }
          ),
        ]}
      />
    )

    expect(
      screen.getByText(
        /Club Success Plans: 2 of 5 clubs have submitted; 3 have not and cannot be Distinguished until they do\./
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Club Success Plans: 2 of 5 submitted — 3 active clubs still need to submit: Limestone City Club, CFB Kingston Toastmasters, KEYS Toastmasters Club\. No club can be Distinguished until its plan is in\./
      )
    ).toBeInTheDocument()
  })

  it('renders no CSP sentence anywhere when the snapshot is not tracked (pre-2025-26)', () => {
    render(
      <DivisionAreaProgressSummary
        divisions={[
          division(
            {
              cspTracked: false,
              cspSubmittedCount: 0,
              clubsMissingCspCount: 0,
            },
            baseArea
          ),
        ]}
      />
    )
    expect(screen.queryByText(/Club Success Plans:/)).toBeNull()
  })

  it('names Club Success Plan status in the explanatory footer', () => {
    render(
      <DivisionAreaProgressSummary
        divisions={[
          division(
            { cspTracked: true, cspSubmittedCount: 5, clubsMissingCspCount: 0 },
            { ...baseArea, cspTracked: true, cspSubmittedCount: 5 }
          ),
        ]}
      />
    )
    expect(
      screen.getByText(
        /Progress descriptions include current metrics, eligibility status, gaps to each recognition level, club visit completion status, and Club Success Plan status\./
      )
    ).toBeInTheDocument()
  })
})
