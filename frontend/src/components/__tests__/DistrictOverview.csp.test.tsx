/**
 * DistrictOverview — Club Success Plan completion line (#1555, spec §6.3).
 *
 * One sentence under the "N clubs · avg …" header, computed from
 * `analytics.allClubs` through the shared `summarizeCspCompletion`, and gated
 * on the `programYear` label the page passes (R3 — never inferred from the
 * rows: pre-2025-26 rows read as "submitted", so an ungated line would say
 * "Every club has submitted" for a year with no requirement). Links to the
 * action list's `#action-csp` section.
 *
 * Same mocking style as `DistrictOverview.programYear.test.tsx`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@testing-library/jest-dom'
import { DistrictOverview } from '../DistrictOverview'
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'
import { snap } from '../../test-utils/snapshotDate'

vi.mock('../../services/cdn', () => ({
  fetchCdnRankings: vi.fn(() => Promise.resolve({ rankings: [] })),
  fetchCdnRankingsForDate: vi.fn(() => Promise.resolve({ rankings: [] })),
}))

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(),
}))

type Club = {
  clubId: string
  cspSubmitted?: boolean
  clubStatus?: string
}

function mockAnalytics(allClubs: Club[]) {
  vi.mocked(useDistrictAnalytics).mockReturnValue({
    data: {
      allClubs,
      totalMembership: 60,
      distinguishedClubs: {
        smedley: 0,
        presidents: 0,
        select: 0,
        distinguished: 0,
      },
    },
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useDistrictAnalytics>)
}

function renderOverview(programYear: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DistrictOverview
          districtId="61"
          selectedDate={snap('2026-09-11')}
          programYearStartDate="2026-07-01"
          programYear={programYear}
        />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('DistrictOverview — Club Success Plan line (#1555)', () => {
  it('counts clubs without a plan (including ineligible ones) and links to the action-list section', () => {
    mockAnalytics([
      { clubId: '1', cspSubmitted: false, clubStatus: 'Active' },
      { clubId: '2', cspSubmitted: false, clubStatus: 'Ineligible' },
      { clubId: '3', cspSubmitted: true, clubStatus: 'Active' },
    ])
    renderOverview('2026-2027')

    const line = screen.getByTestId('district-csp-line')
    expect(line).toHaveTextContent(
      '2 of 3 clubs (67%) have not submitted a Club Success Plan — required for any Distinguished level this year.'
    )
    const link = screen.getByRole('link', { name: /See which clubs/ })
    expect(link).toHaveAttribute('href', '/district/61/action-list#action-csp')
  })

  it('says every club has submitted when no club is missing a plan', () => {
    mockAnalytics([
      { clubId: '1', cspSubmitted: true },
      { clubId: '2', cspSubmitted: true },
    ])
    renderOverview('2025-2026')
    expect(screen.getByTestId('district-csp-line')).toHaveTextContent(
      'Every club has submitted its Club Success Plan.'
    )
    expect(screen.queryByRole('link', { name: /See which clubs/ })).toBeNull()
  })

  it('renders no line at all for a pre-2025-26 program year, whatever the rows say', () => {
    // Pre-2025-26 rows carry no cspSubmitted; getCSPStatus folds that to
    // "submitted", so without the year gate this would read "Every club has
    // submitted" — a lie of omission (spec E1).
    mockAnalytics([{ clubId: '1' }, { clubId: '2' }])
    renderOverview('2024-2025')
    expect(screen.queryByTestId('district-csp-line')).toBeNull()
    expect(screen.queryByText(/Club Success Plan/)).toBeNull()
  })

  it('excludes clubs with no CSP value from the count and says so (E2)', () => {
    mockAnalytics([
      { clubId: '1', cspSubmitted: false, clubStatus: 'Active' },
      { clubId: '2', cspSubmitted: true },
      { clubId: '3' },
    ])
    renderOverview('2026-2027')
    expect(screen.getByTestId('district-csp-line')).toHaveTextContent(
      '1 of 2 clubs (50%) have not submitted a Club Success Plan — required for any Distinguished level this year. (1 club with no CSP data)'
    )
  })

  it('uses singular wording for one club', () => {
    mockAnalytics([
      { clubId: '1', cspSubmitted: false, clubStatus: 'Active' },
      { clubId: '2', cspSubmitted: true },
      { clubId: '3', cspSubmitted: true },
      { clubId: '4', cspSubmitted: true },
    ])
    renderOverview('2026-2027')
    expect(screen.getByTestId('district-csp-line')).toHaveTextContent(
      '1 of 4 clubs (25%) has not submitted a Club Success Plan'
    )
  })
})
