/**
 * ClubsTable on a phone on its side (#1912, follow-up to #1847).
 *
 * At 812×375 the card header (title + Export, search/Filters/Columns,
 * preset, total) put the first club row at 483px against a 200px budget.
 * In short landscape, when the page hands over a toolbar slot in the sticky
 * context bar, the table:
 * - renders the phone rows + Filter & sort sheet (as below 768);
 * - moves search + Filter & sort into that slot (sticky, on the first screen);
 * - moves the total + CSV exports below the rows, keeping "All Clubs" as a
 *   visually hidden heading at the top.
 * Without a slot (or outside short landscape) nothing changes.
 */
import type { ReactElement } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  render as rtlRender,
  screen,
  cleanup,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { ClubsTable } from '../ClubsTable'
import { SHORT_LANDSCAPE_QUERY } from '../../utils/contextBar'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter })

const club = (id: string, name: string, div: string): ClubTrend => ({
  clubId: id,
  clubName: name,
  divisionId: div,
  divisionName: `Division ${div}`,
  areaId: `${div}1`,
  areaName: `Area ${div}1`,
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'thriving',
  riskFactors: [],
  membershipBase: 18,
  membershipTrend: [{ date: '2026-05-01', count: 20 }],
  dcpGoalsTrend: [{ date: '2026-05-01', goalsAchieved: 5 }],
})

const CLUBS: ClubTrend[] = [
  club('1', 'Alpha Speakers', 'A'),
  club('2', 'Bravo Talkers', 'A'),
  club('3', 'Charlie Orators', 'B'),
]

/** Only the short-landscape query matches (812×375 is ≥768 wide). */
function stubShortLandscape(on: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: on && query === SHORT_LANDSCAPE_QUERY,
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

function slot(): HTMLDivElement {
  const el = document.createElement('div')
  el.setAttribute('data-testid', 'slot')
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('ClubsTable in short landscape (#1912)', () => {
  it('moves search and Filter & sort into the context-bar slot', () => {
    stubShortLandscape(true)
    const target = slot()
    render(
      <ClubsTable clubs={CLUBS} districtId="61" compactToolbarTarget={target} />
    )
    const inSlot = within(target)
    expect(inSlot.getByRole('searchbox', { name: 'Search clubs by name' }))
    expect(inSlot.getByRole('button', { name: /Filter & sort/ }))
    // Only one search box and one trigger on the page.
    expect(screen.getAllByRole('searchbox')).toHaveLength(1)
  })

  it('renders the phone rows (grouped by division), not the table', () => {
    stubShortLandscape(true)
    render(
      <ClubsTable clubs={CLUBS} districtId="61" compactToolbarTarget={slot()} />
    )
    expect(screen.getByRole('button', { name: /Division A/ })).toBeVisible()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('keeps "All Clubs" as a heading and puts total + export after the rows', () => {
    stubShortLandscape(true)
    render(
      <ClubsTable clubs={CLUBS} districtId="61" compactToolbarTarget={slot()} />
    )
    expect(screen.getByRole('heading', { name: 'All Clubs' })).toHaveClass(
      'sr-only'
    )
    const rows = screen.getByRole('button', { name: /Division A/ })
    const exportBtn = screen.getByRole('button', { name: /Export Clubs/ })
    expect(
      rows.compareDocumentPosition(exportBtn) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(screen.getByText(/Total: 3 clubs/)).toBeInTheDocument()
  })

  it('without a slot, short landscape keeps the desktop table', () => {
    stubShortLandscape(true)
    render(<ClubsTable clubs={CLUBS} districtId="61" />)
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('outside short landscape the slot stays empty and the table renders', () => {
    stubShortLandscape(false)
    const target = slot()
    render(
      <ClubsTable clubs={CLUBS} districtId="61" compactToolbarTarget={target} />
    )
    expect(target).toBeEmptyDOMElement()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'All Clubs' })).not.toHaveClass(
      'sr-only'
    )
  })
})
