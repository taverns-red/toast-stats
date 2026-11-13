/**
 * Divisions list: confirmed Distinguished headline (#2580, part). The list
 * gets the district's club rows (`clubs`) and splits each division's and area's
 * qualifying-today count into confirmed + "+N qualifying today".
 */
import type { ReactElement } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render as rtlRender, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { DivisionPerformanceCards } from '../DivisionPerformanceCards'
import type { DivisionPerformance } from '../../utils/divisionStatus'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import { withRecognitionState } from '../../test-utils/areaFixture'

vi.mock('../../utils/extractDivisionPerformance', () => ({
  extractDivisionPerformance: vi.fn(),
}))
import { extractDivisionPerformance } from '../../utils/extractDivisionPerformance'

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter })

const visits = {
  completed: 8,
  required: 8,
  percentage: 100,
  meetsThreshold: true,
}

const DIVISIONS: DivisionPerformance[] = [
  {
    divisionId: 'A',
    status: 'distinguished',
    clubBase: 10,
    paidClubs: 10,
    netGrowth: 0,
    distinguishedClubs: 6,
    requiredDistinguishedClubs: 5,
    cspTracked: false,
    cspSubmittedCount: 0,
    clubsMissingCsp: [],
    areas: [
      withRecognitionState(
        {
          areaId: 'A1',
          status: 'distinguished',
          clubBase: 10,
          paidClubs: 10,
          netGrowth: 0,
          distinguishedClubs: 6,
          requiredDistinguishedClubs: 5,
          firstRoundVisits: visits,
          secondRoundVisits: visits,
          isQualified: true,
        },
        '2026-03-15'
      ),
    ],
  },
]

function club(id: string, provisional: boolean): ClubTrend {
  return {
    clubId: id,
    clubName: `Club ${id}`,
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: 'A1',
    areaName: 'Area A1',
    membershipTrend: [],
    dcpGoalsTrend: [],
    currentStatus: 'thriving',
    riskFactors: [],
    distinguishedLevel: 'Distinguished',
    isProvisionallyDistinguished: provisional,
  }
}

const CLUBS = [club('1', true), club('2', true), club('3', false)]

function stubMobile(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
}

const renderCards = (clubs?: ClubTrend[]) =>
  render(
    <DivisionPerformanceCards
      districtSnapshot={{ divisionPerformance: [] }}
      snapshotTimestamp="2026-03-15"
      districtId="61"
      clubs={clubs}
    />
  )

beforeEach(() => {
  vi.mocked(extractDivisionPerformance).mockReturnValue(DIVISIONS)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DivisionPerformanceCards confirmed Distinguished (#2580)', () => {
  it('desktop: the card summary and the area row use the confirmed count', () => {
    stubMobile(false)
    renderCards(CLUBS)
    const card = screen.getByLabelText('Division A performance card')
    expect(
      card.querySelector('[aria-label^="Distinguished clubs:"]')
    ).toHaveTextContent('4/5')
    expect(screen.getByText('A1').closest('tr')).toHaveTextContent('4/10 40%')
    const extras = screen.getAllByTestId('distinguished-provisional')
    expect(extras).toHaveLength(2)
    extras.forEach(e => expect(e).toHaveTextContent('+2 qualifying today'))
  })

  it('phone: the row meta shows confirmed over required, then the extra', () => {
    stubMobile(true)
    renderCards(CLUBS)
    const row = screen.getByTestId('mobile-row')
    expect(row).toHaveTextContent('4/5 distinguished')
    expect(row).toHaveTextContent('+2 qualifying today')
    expect(row).not.toHaveTextContent('6/5')
  })

  it('without club rows the snapshot count stands, with no extra', () => {
    stubMobile(true)
    renderCards(undefined)
    const row = screen.getByTestId('mobile-row')
    expect(row).toHaveTextContent('6/5 distinguished')
    expect(row).not.toHaveTextContent('qualifying today')
  })
})
