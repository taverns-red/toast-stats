/**
 * DistrictOverview — Club Success Plan completion line (#1555, spec §6.3;
 * #1565 deadline-aware copy).
 *
 * One sentence under the "N clubs · avg …" header, computed from
 * `analytics.allClubs` through the shared `summarizeCspCompletion`, and gated
 * on the `programYear` label the page passes (R3 — never inferred from the
 * rows: pre-2025-26 rows read as "submitted", so an ungated line would say
 * "Every club has submitted" for a year with no requirement). Links to the
 * action list's `#action-csp` section.
 *
 * The before/after-deadline wording is driven by the PINNED `selectedDate`
 * the page passes — never the clock — so a historical snapshot reads as it
 * did on its date, and these tests need no fake timers.
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
  charterDate?: string
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

/** Pinned 2026-09-11 (PY 2026-27, before 30 September) unless a date is given. */
function renderOverview(programYear: string, date = '2026-09-11') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DistrictOverview
          districtId="61"
          selectedDate={snap(date)}
          programYearStartDate="2026-07-01"
          programYear={programYear}
        />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('DistrictOverview — Club Success Plan line (#1555, #1565)', () => {
  it('before the deadline: counts ACTIVE clubs without a plan, names the date and the consequence, footnotes ineligible ones', () => {
    // Live D61 in miniature: the overview must agree with its own link target
    // (badge = active only), so ineligible clubs leave BOTH the numerator and
    // the denominator and are named in the action list's footnote voice
    // instead (#1561 review).
    mockAnalytics([
      { clubId: '1', cspSubmitted: false, clubStatus: 'Active' },
      { clubId: '2', cspSubmitted: false, clubStatus: 'Active' },
      { clubId: '3', cspSubmitted: false, clubStatus: 'Ineligible' },
      { clubId: '4', cspSubmitted: true, clubStatus: 'Active' },
    ])
    renderOverview('2026-2027')

    const line = screen.getByTestId('district-csp-line')
    expect(line).toHaveTextContent(
      '2 of 3 active clubs (67%) have not submitted a Club Success Plan — due 30 September 2026; ' +
        'a club that misses that date cannot be Distinguished this program year.'
    )
    expect(line).toHaveTextContent(
      '1 suspended/ineligible club without a plan is not counted.'
    )
    expect(line).not.toHaveTextContent(/until/)
    const link = screen.getByRole('link', { name: /See which clubs/ })
    expect(link).toHaveAttribute('href', '/district/61/action-list#action-csp')
  })

  it('after the deadline: terminal wording — eligibility is lost, judged by the pinned date', () => {
    mockAnalytics([
      { clubId: '1', cspSubmitted: false, clubStatus: 'Active' },
      { clubId: '2', cspSubmitted: false, clubStatus: 'Active' },
      { clubId: '4', cspSubmitted: true, clubStatus: 'Active' },
    ])
    renderOverview('2026-2027', '2026-10-01')

    const line = screen.getByTestId('district-csp-line')
    expect(line).toHaveTextContent(
      '2 of 3 active clubs (67%) did not submit a Club Success Plan by 30 September 2026 ' +
        'and cannot be Distinguished this program year.'
    )
    expect(line).not.toHaveTextContent(/until|required for/)
    // Still worth seeing which clubs they are.
    expect(
      screen.getByRole('link', { name: /See which clubs/ })
    ).toBeInTheDocument()
  })

  it('on the due date itself the plan is still pending', () => {
    mockAnalytics([
      { clubId: '1', cspSubmitted: false, clubStatus: 'Active' },
      { clubId: '2', cspSubmitted: true },
    ])
    renderOverview('2026-2027', '2026-09-30')
    expect(screen.getByTestId('district-csp-line')).toHaveTextContent(
      '1 of 2 active clubs (50%) has not submitted a Club Success Plan — due 30 September 2026'
    )
  })

  it('mixed: existing clubs past 30 September, a new charter still inside its 90 days', () => {
    // Pinned 2026-10-05: club 1 missed 30 September; club 2, chartered
    // 15 August, has until 13 November.
    mockAnalytics([
      { clubId: '1', cspSubmitted: false, clubStatus: 'Active' },
      {
        clubId: '2',
        cspSubmitted: false,
        clubStatus: 'Active',
        charterDate: '2026-08-15',
      },
      { clubId: '3', cspSubmitted: true },
      { clubId: '4', cspSubmitted: true },
    ])
    renderOverview('2026-2027', '2026-10-05')
    expect(screen.getByTestId('district-csp-line')).toHaveTextContent(
      '2 of 4 active clubs (50%) have not submitted a Club Success Plan — ' +
        '1 did not file by 30 September 2026 and cannot be Distinguished this program year; ' +
        '1 is still due by 13 November 2026.'
    )
  })

  it('several pending dates: names each date with its club count', () => {
    mockAnalytics([
      { clubId: '1', cspSubmitted: false, clubStatus: 'Active' },
      { clubId: '2', cspSubmitted: false, clubStatus: 'Active' },
      {
        clubId: '3',
        cspSubmitted: false,
        clubStatus: 'Active',
        charterDate: '2026-08-15',
      },
      { clubId: '4', cspSubmitted: true },
    ])
    renderOverview('2026-2027')
    expect(screen.getByTestId('district-csp-line')).toHaveTextContent(
      '3 of 4 active clubs (75%) have not submitted a Club Success Plan — ' +
        'due 30 September 2026 for 2 clubs and 13 November 2026 for 1 club; ' +
        'a club that misses its date cannot be Distinguished this program year.'
    )
  })

  it('a club chartered after 1 April is automatic credit — out of both numbers, named in the footnote', () => {
    // PY 2025-26 pinned at the June close: club 3 chartered 15 April 2026.
    mockAnalytics([
      { clubId: '1', cspSubmitted: false, clubStatus: 'Active' },
      { clubId: '2', cspSubmitted: true, clubStatus: 'Active' },
      {
        clubId: '3',
        cspSubmitted: false,
        clubStatus: 'Active',
        charterDate: '2026-04-15',
      },
      { clubId: '4', cspSubmitted: false, clubStatus: 'Suspended' },
    ])
    renderOverview('2025-2026', '2026-06-30')
    const line = screen.getByTestId('district-csp-line')
    expect(line).toHaveTextContent(
      '1 of 2 active clubs (50%) did not submit a Club Success Plan by 30 September 2025'
    )
    expect(line).toHaveTextContent(
      '1 suspended/ineligible club without a plan is not counted. ' +
        '1 club chartered after 1 April has automatic credit.'
    )
  })

  it('excludes an ineligible club that HAS submitted from the active denominator', () => {
    mockAnalytics([
      { clubId: '1', cspSubmitted: false, clubStatus: 'Active' },
      { clubId: '2', cspSubmitted: true, clubStatus: 'Ineligible' },
      { clubId: '3', cspSubmitted: true, clubStatus: 'Active' },
    ])
    renderOverview('2026-2027')
    const line = screen.getByTestId('district-csp-line')
    expect(line).toHaveTextContent(
      '1 of 2 active clubs (50%) has not submitted'
    )
    expect(line).not.toHaveTextContent('suspended/ineligible')
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
    renderOverview('2024-2025', '2025-05-31')
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
      '1 of 2 active clubs (50%) has not submitted a Club Success Plan — due 30 September 2026; ' +
        'a club that misses that date cannot be Distinguished this program year. (1 club with no CSP data)'
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
      '1 of 4 active clubs (25%) has not submitted a Club Success Plan'
    )
  })
})
