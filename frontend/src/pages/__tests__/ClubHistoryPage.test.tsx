/**
 * Tests for ClubHistoryPage (#1229, epic #1228) — the per-club multi-year
 * history subpage at /district/:districtId/club/:clubId/history.
 *
 * Lives in pages/__tests__ (R22 — page mounts stay out of the unit project).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { screen, render, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import ClubHistoryPage from '../ClubHistoryPage'
import { useClubHistory } from '../../hooks/useClubHistory'
import type { ClubHistoryGap, ClubHistoryRow } from '../../utils/clubHistory'

Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
  writable: true,
})

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({
    data: { districts: [{ id: '61', name: 'District 61' }] },
  })),
}))

vi.mock('../../hooks/useClubHistory', () => ({
  useClubHistory: vi.fn(),
}))

const mockedHistory = vi.mocked(useClubHistory)

const row: ClubHistoryRow = {
  startYear: 2023,
  label: '2023-2024',
  yearEndDate: '2024-06-30',
  hasData: true,
  dcpGoals: 8,
  tierCode: 'S',
  tierLabel: 'Select Distinguished',
  membershipBase: 20,
  membershipEnd: 28,
  membershipNet: 8,
  octoberRenewals: 16,
  aprilRenewals: 14,
  clubStatus: 'Active',
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <DarkModeProvider>
        <MemoryRouter initialEntries={['/district/61/club/00001234/history']}>
          <Routes>
            <Route
              path="/district/:districtId/club/:clubId/history"
              element={<ClubHistoryPage />}
            />
          </Routes>
        </MemoryRouter>
      </DarkModeProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('ClubHistoryPage (#1229)', () => {
  it('renders the breadcrumb trail District › Clubs › Club › History', () => {
    mockedHistory.mockReturnValue({
      rows: [row],
      gaps: [],
      clubName: 'Sunrise Speakers',
      isLoading: false,
      isError: false,
      error: null,
    })
    renderPage()
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i })
    expect(within(nav).getByText('District 61')).toBeInTheDocument()
    expect(within(nav).getByText('Clubs')).toBeInTheDocument()
    expect(within(nav).getByText('Sunrise Speakers')).toBeInTheDocument()
    expect(within(nav).getByText('History')).toBeInTheDocument()
  })

  it('renders the history table and an export button when there are rows', () => {
    mockedHistory.mockReturnValue({
      rows: [row],
      gaps: [],
      clubName: 'Sunrise Speakers',
      isLoading: false,
      isError: false,
      error: null,
    })
    renderPage()
    expect(screen.getByText('2023-2024')).toBeInTheDocument()
    expect(screen.getByText('Select Distinguished')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /export csv/i })
    ).toBeInTheDocument()
  })

  it('shows an empty state (no export button) when there is no completed history', () => {
    mockedHistory.mockReturnValue({
      rows: [],
      gaps: [],
      clubName: 'Sunrise Speakers',
      isLoading: false,
      isError: false,
      error: null,
    })
    renderPage()
    expect(screen.getByText(/no completed program years/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /export csv/i })
    ).not.toBeInTheDocument()
  })

  it('shows an error state when the history query fails', () => {
    mockedHistory.mockReturnValue({
      rows: [],
      gaps: [],
      clubName: null,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
    })
    renderPage()
    expect(screen.getByText(/could not load this club/i)).toBeInTheDocument()
  })

  it('falls back to "Club <id>" when the name is not yet resolved', () => {
    mockedHistory.mockReturnValue({
      rows: [row],
      gaps: [],
      clubName: null,
      isLoading: false,
      isError: false,
      error: null,
    })
    renderPage()
    expect(
      screen.getByRole('heading', { name: /Club 00001234 — History/i })
    ).toBeInTheDocument()
  })
})

/**
 * #1437 — three different facts used to render as one empty table. The page
 * must say WHICH case it is, so "this club moved districts" is not mistaken
 * for "this club has no history".
 */
describe('ClubHistoryPage gap reporting (#1437)', () => {
  const gap = (over: Partial<ClubHistoryGap> = {}): ClubHistoryGap => ({
    startYear: 2022,
    label: '2022-2023',
    districtId: '61',
    yearEndDate: null,
    reason: 'district-absent',
    ...over,
  })

  it('explains an empty history caused by years this district cannot cover', () => {
    mockedHistory.mockReturnValue({
      rows: [],
      gaps: [gap({ startYear: 2023, label: '2023-2024' }), gap()],
      clubName: 'Sunrise Speakers',
      isLoading: false,
      isError: false,
      error: null,
    })
    renderPage()
    // Bounded query — "District 61" also appears in the breadcrumb.
    const empty = screen.getByText(/no snapshot for/i)
    expect(empty).toHaveTextContent('District 61')
    expect(empty).toHaveTextContent('2023-2024')
    expect(empty).toHaveTextContent('2022-2023')
    expect(empty).toHaveTextContent(/another district/i)
  })

  it('says a year could not be loaded rather than implying no history', () => {
    mockedHistory.mockReturnValue({
      rows: [],
      gaps: [
        gap({
          startYear: 2023,
          label: '2023-2024',
          reason: 'snapshot-unavailable',
          yearEndDate: '2024-06-30',
        }),
      ],
      clubName: 'Sunrise Speakers',
      isLoading: false,
      isError: false,
      error: null,
    })
    renderPage()
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument()
  })

  it('notes the skipped years alongside a partially-populated table', () => {
    mockedHistory.mockReturnValue({
      rows: [row],
      gaps: [gap()],
      clubName: 'Sunrise Speakers',
      isLoading: false,
      isError: false,
      error: null,
    })
    renderPage()
    expect(screen.getByText('2023-2024')).toBeInTheDocument()
    expect(screen.getByText(/2022-2023/)).toBeInTheDocument()
  })

  it('keeps the plain empty state when nothing was skipped', () => {
    mockedHistory.mockReturnValue({
      rows: [],
      gaps: [],
      clubName: 'Sunrise Speakers',
      isLoading: false,
      isError: false,
      error: null,
    })
    renderPage()
    expect(screen.getByText(/no completed program years/i)).toBeInTheDocument()
  })
})

describe('ClubHistoryPage phone context bar (#1831)', () => {
  beforeEach(() =>
    mockedHistory.mockReturnValue({
      rows: [row],
      gaps: [],
      clubName: 'Sunrise Speakers',
      isLoading: false,
      isError: false,
      error: null,
    })
  )

  it('backs up one level to the club and labels the chip About (no PY state)', () => {
    renderPage()
    expect(screen.getByTestId('context-bar-back')).toHaveAttribute(
      'href',
      '/district/61/club/00001234'
    )
    expect(screen.getByTestId('context-bar-back')).toHaveAccessibleName(
      'Back to Sunrise Speakers'
    )
    expect(screen.getByTestId('context-bar')).toHaveTextContent(
      'Sunrise Speakers — History'
    )
    expect(screen.getByTestId('context-bar-chip')).toHaveTextContent('About')
  })

  it('sheet holds Export CSV, About and the full trail', async () => {
    renderPage()
    await userEvent.click(screen.getByTestId('context-bar-chip'))
    const sheet = screen.getByRole('dialog', {
      name: 'Sunrise Speakers — History',
    })
    expect(
      within(sheet).getByRole('button', { name: 'Export CSV' })
    ).toBeInTheDocument()
    expect(
      within(sheet).getByText(/Multi-year performance/)
    ).toBeInTheDocument()
    const trail = within(sheet).getByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(trail)
        .getAllByRole('listitem')
        .map(li => li.textContent)
    ).toEqual([
      'Districts',
      'District 61',
      'Clubs',
      'Sunrise Speakers',
      'History',
    ])
  })
})

// #1803 — rows carry the district the club was in that year (club-district
// history, #1782). The District column appears only when it tells the reader
// something: a row recorded under a district other than the page's.
describe('ClubHistoryPage — District column (#1803)', () => {
  const result = (rows: ClubHistoryRow[]) => ({
    rows,
    gaps: [],
    clubName: 'Sunrise Speakers',
    isLoading: false,
    isError: false,
    error: null,
  })

  it('shows the District column when a year was recorded under another district', () => {
    mockedHistory.mockReturnValue(
      result([
        { ...row, districtId: '61' },
        { ...row, startYear: 2022, label: '2022-2023', districtId: '01' },
      ])
    )
    renderPage()
    expect(
      screen.getByRole('columnheader', { name: /District/ })
    ).toBeInTheDocument()
    expect(screen.getByText('District 1')).toBeInTheDocument()
  })

  it('has no District column when every year is in the page district', () => {
    mockedHistory.mockReturnValue(result([{ ...row, districtId: '61' }]))
    renderPage()
    expect(screen.queryByRole('columnheader', { name: /District/ })).toBeNull()
  })
})
