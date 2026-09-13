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
import type {
  DivisionPerformance,
  MissingCspClub,
} from '../../utils/divisionStatus'
import { withRecognitionState } from '../../test-utils/areaFixture'

afterEach(() => cleanup())

// Snapshot 2026-09-11: existing clubs, still inside the 30 September window.
const missingThree: MissingCspClub[] = [
  {
    clubNumber: '1',
    clubName: 'Limestone City Club',
    cspDueDate: '2026-09-30',
    cspOverdue: false,
  },
  {
    clubNumber: '2',
    clubName: 'CFB Kingston Toastmasters',
    cspDueDate: '2026-09-30',
    cspOverdue: false,
  },
  {
    clubNumber: '3',
    clubName: 'KEYS Toastmasters Club',
    cspDueDate: '2026-09-30',
    cspOverdue: false,
  },
]

function division(
  csp: Pick<
    DivisionPerformance,
    'cspTracked' | 'cspSubmittedCount' | 'clubsMissingCsp'
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
            {
              cspTracked: true,
              cspSubmittedCount: 2,
              clubsMissingCsp: missingThree,
            },
            {
              ...baseArea,
              cspTracked: true,
              cspSubmittedCount: 2,
              clubsMissingCsp: missingThree,
            }
          ),
        ]}
      />
    )

    expect(
      screen.getByText(
        /Club Success Plans: 2 of 5 clubs have submitted; 3 have not and must file by 30 September 2026 — a club that misses that date cannot be Distinguished this program year\./
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Club Success Plans: 2 of 5 submitted — 3 active clubs still need to submit by 30 September 2026: Limestone City Club, CFB Kingston Toastmasters, KEYS Toastmasters Club\. Any club that has not filed by 30 September 2026 cannot be Distinguished this program year\./
      )
    ).toBeInTheDocument()
  })

  it('renders no CSP sentence anywhere — and no footer mention — when the snapshot is not tracked (pre-2025-26)', () => {
    render(
      <DivisionAreaProgressSummary
        divisions={[
          division(
            {
              cspTracked: false,
              cspSubmittedCount: 0,
              clubsMissingCsp: [],
            },
            baseArea
          ),
        ]}
      />
    )
    expect(screen.queryByText(/Club Success Plans:/)).toBeNull()
    // The footer must not advertise a thing the page does not show for this
    // year: same `cspTracked` gate as the clauses (preview finding, #1559).
    expect(screen.queryByText(/Club Success Plan/)).toBeNull()
    expect(
      screen.getByText(
        /Progress descriptions include current metrics, eligibility status, gaps to each recognition level, and club visit completion status\./
      )
    ).toBeInTheDocument()
  })

  it('names Club Success Plan status in the explanatory footer', () => {
    render(
      <DivisionAreaProgressSummary
        divisions={[
          division(
            { cspTracked: true, cspSubmittedCount: 5, clubsMissingCsp: [] },
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
