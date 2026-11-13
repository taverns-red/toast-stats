/**
 * Divisions list: confirmed Distinguished headline (#2580, part). The list
 * gets the published `distinguishedCountsByDivision` and shows each division's
 * and area's confirmed count with "+N qualifying today".
 */
import type { ReactElement } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render as rtlRender, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { DivisionPerformanceCards } from '../DivisionPerformanceCards'
import type { DivisionPerformance } from '../../utils/divisionStatus'
import type { DivisionDistinguishedCountsRow } from '../../hooks/useDistrictAnalytics'
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

// The published field: the division is 4 confirmed + 2 qualifying today, and
// so is its one area. The snapshot says 6 hold a level today.
const BY_DIVISION: DivisionDistinguishedCountsRow[] = [
  {
    divisionId: 'A',
    distinguishedCounts: { confirmed: 4, provisional: 2 },
    areas: [
      { areaId: 'A1', distinguishedCounts: { confirmed: 4, provisional: 2 } },
    ],
  },
]

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

const renderCards = (
  by?: DivisionDistinguishedCountsRow[],
  countsPending = false
) =>
  render(
    <DivisionPerformanceCards
      districtSnapshot={{ divisionPerformance: [] }}
      snapshotTimestamp="2026-03-15"
      districtId="61"
      distinguishedCountsByDivision={by}
      countsPending={countsPending}
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
    renderCards(BY_DIVISION)
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
    renderCards(BY_DIVISION)
    const row = screen.getByTestId('mobile-row')
    expect(row).toHaveTextContent('4/5 distinguished')
    expect(row).toHaveTextContent('+2 qualifying today')
    expect(row).not.toHaveTextContent('6/5')
  })

  it('without the published field the snapshot count stands, with no extra', () => {
    stubMobile(true)
    renderCards(undefined)
    const row = screen.getByTestId('mobile-row')
    expect(row).toHaveTextContent('6/5 distinguished')
    expect(row).not.toHaveTextContent('qualifying today')
  })

  it('status badges follow the confirmed count: no Distinguished beside 4/5', () => {
    // 6 qualify today (status distinguished in the snapshot), 4 are confirmed
    // against a requirement of 5.
    stubMobile(false)
    renderCards(BY_DIVISION)
    const card = screen.getByLabelText('Division A performance card')
    expect(
      card.querySelector('[aria-label^="Distinguished clubs:"]')
    ).toHaveTextContent('4/5')
    expect(
      screen.getByRole('status', { name: /^Division status:/ })
    ).toHaveAccessibleName('Division status: Not Distinguished')
    const areaBadge = screen.getByLabelText(/^Recognition status:/)
    expect(areaBadge.textContent).not.toMatch(/^Distinguished$/)
  })

  it('phone row chip follows the confirmed count too', () => {
    stubMobile(true)
    renderCards(BY_DIVISION)
    expect(screen.getByTestId('mobile-row')).not.toHaveTextContent(
      '★ Distinguished'
    )
  })

  it('desktop, counts loading: no status badge, no count, no qualifying-today value', () => {
    stubMobile(false)
    renderCards(undefined, true)
    const card = screen.getByLabelText('Division A performance card')
    expect(
      screen.queryByRole('status', { name: /^Division status:/ })
    ).toBeNull()
    expect(
      card.querySelector('[aria-label^="Distinguished clubs:"]')
    ).toBeNull()
    expect(screen.queryByLabelText(/^Recognition status:/)).toBeNull()
    expect(card).not.toHaveTextContent('6/5')
    expect(card).not.toHaveTextContent('6/10')
    expect(screen.queryByTestId('distinguished-provisional')).toBeNull()
    expect(
      screen.getAllByTestId('distinguished-pending').length
    ).toBeGreaterThan(0)
  })

  it('phone, counts loading: the row has no chip and no distinguished count', () => {
    stubMobile(true)
    renderCards(undefined, true)
    const row = screen.getByTestId('mobile-row')
    expect(row).not.toHaveTextContent('Distinguished')
    expect(row).not.toHaveTextContent('distinguished')
    expect(row).not.toHaveTextContent('6/5')
    expect(row).toHaveTextContent('10/10 paid')
  })

  it('settled without the field: the snapshot basis shows, no placeholders', () => {
    stubMobile(false)
    renderCards(undefined, false)
    expect(screen.queryByTestId('distinguished-pending')).toBeNull()
    expect(
      screen.getByRole('status', { name: /^Division status:/ })
    ).toBeInTheDocument()
  })
})
