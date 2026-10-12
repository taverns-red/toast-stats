/**
 * Divisions list on phones (#1833, mobile epic #1827): below 768 px each
 * division is one MobileRowList row (name + recognition chip, paid/base · net ·
 * distinguished/required, chevron) linking to its routed division page. The
 * 9-column area table (731 px in a 261 px scroller) is not rendered inline —
 * it lives on the division page (review §7 Phase 2 item 17). Desktop keeps the
 * cards unchanged.
 */
import type { ReactElement } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render as rtlRender, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { DivisionPerformanceCards } from '../DivisionPerformanceCards'
import type { DivisionPerformance } from '../../utils/divisionStatus'

vi.mock('../../utils/extractDivisionPerformance', () => ({
  extractDivisionPerformance: vi.fn(),
}))
import { extractDivisionPerformance } from '../../utils/extractDivisionPerformance'

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter })

const division = (
  over: Partial<DivisionPerformance> & { divisionId: string }
): DivisionPerformance => ({
  status: 'not-distinguished',
  clubBase: 20,
  paidClubs: 20,
  netGrowth: 0,
  distinguishedClubs: 0,
  requiredDistinguishedClubs: 9,
  areas: [],
  cspTracked: false,
  cspSubmittedCount: 0,
  clubsMissingCsp: [],
  ...over,
})

const DIVISIONS: DivisionPerformance[] = [
  division({
    divisionId: 'A',
    status: 'distinguished',
    clubBase: 50,
    paidClubs: 52,
    netGrowth: 2,
    distinguishedClubs: 26,
    requiredDistinguishedClubs: 23,
  }),
  division({
    divisionId: 'B',
    status: 'not-distinguished',
    clubBase: 21,
    paidClubs: 19,
    netGrowth: -2,
    distinguishedClubs: 3,
    requiredDistinguishedClubs: 10,
  }),
  division({ divisionId: 'C', status: 'presidents-distinguished' }),
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

const renderCards = () =>
  render(
    <DivisionPerformanceCards
      districtSnapshot={{ divisionPerformance: [] }}
      snapshotTimestamp="2026-10-10"
      districtId="61"
    />
  )

beforeEach(() => {
  vi.mocked(extractDivisionPerformance).mockReturnValue(DIVISIONS)
  stubMobile(true)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DivisionPerformanceCards < 768 px — division rows (#1833)', () => {
  it('renders one row link per division to its routed page', () => {
    renderCards()
    const rows = screen.getAllByTestId('mobile-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveAttribute('href', '/district/61/division/A')
    expect(rows[0]).toHaveTextContent('Division A')
    expect(rows[0]).toHaveTextContent('52/50 paid')
    expect(rows[0]).toHaveTextContent('+2')
    expect(rows[0]).toHaveTextContent('26/23 distinguished')
  })

  it('encodes recognition by glyph + text, with net loss taking precedence', () => {
    renderCards()
    const [a, b, c] = screen.getAllByTestId('mobile-row')
    expect(a).toHaveTextContent('★ Distinguished')
    expect(b).toHaveTextContent('✗ Net loss')
    expect(b).toHaveTextContent('−2')
    expect(c).toHaveTextContent("★ President's")
  })

  it('does not render the inline area tables or cards', () => {
    renderCards()
    expect(screen.queryAllByRole('table')).toHaveLength(0)
    expect(
      screen.queryByLabelText('Division A performance card')
    ).not.toBeInTheDocument()
  })

  // #1837: the loading skeleton is the row list's own structure, so the DDP
  // criteria below it start where they will sit once the rows land.
  it('loads as MobileRowList-shaped placeholder rows, not a spinner panel', () => {
    const { container } = render(
      <DivisionPerformanceCards
        districtSnapshot={undefined}
        isLoading
        snapshotTimestamp=""
        districtId="61"
      />
    )
    expect(
      screen.getByRole('status', { name: 'Loading division performance' })
    ).toBeInTheDocument()
    expect(
      container.querySelectorAll('.mobile-row-list__rows > li > .mobile-row')
        .length
    ).toBe(8)
    expect(screen.queryAllByTestId('mobile-row')).toHaveLength(0)
  })

  it('keeps the desktop cards at ≥ 768 px', () => {
    stubMobile(false)
    renderCards()
    expect(screen.queryAllByTestId('mobile-row')).toHaveLength(0)
    expect(
      screen.getByLabelText('Division A performance card')
    ).toBeInTheDocument()
  })
})
