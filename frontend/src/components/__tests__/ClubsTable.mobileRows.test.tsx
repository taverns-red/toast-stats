/**
 * ClubsTable on phones (#1833, mobile epic #1827 Phase 1): below 768 px the
 * 125–140 px ClubCard stack (D61 clubs page 24,821 px) becomes MobileRowList
 * compact rows.
 *
 * - Default view (no search/filter/preset, default name sort): grouped by
 *   division, collapsed, with counts. Open groups are owned by the page
 *   (`openGroups` / `onOpenGroupsChange` → URL), never re-derived here (R3).
 * - Any search/filter/preset, or a non-default sort: one flat result list in
 *   the sorted order (50 then "Show 25 more"), so sort and search still mean
 *   what they say.
 * - The mobile sort control round-trips through onSortChange (URL), like the
 *   desktop headers.
 * - The search box sits in a sticky bar directly above the list.
 */
import type { ReactElement } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import {
  render as rtlRender,
  screen,
  cleanup,
  fireEvent,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { ClubsTable } from '../ClubsTable'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter })

const club = (
  id: string,
  name: string,
  div: string,
  overrides: Partial<ClubTrend> = {}
): ClubTrend => ({
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
  ...overrides,
})

const CLUBS: ClubTrend[] = [
  club('1', 'Alpha Speakers', 'A', {
    currentStatus: 'intervention-required',
    membershipTrend: [{ date: '2026-05-01', count: 8 }],
  }),
  club('2', 'Bravo Talkers', 'A', { currentStatus: 'vulnerable' }),
  club('3', 'Charlie Orators', 'B', {
    membershipTrend: [{ date: '2026-05-01', count: 30 }],
  }),
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

beforeEach(() => stubMobile(true))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ClubsTable < 768 px — compact rows (#1833)', () => {
  it('groups clubs by division, collapsed, with counts and a status summary', () => {
    render(<ClubsTable clubs={CLUBS} districtId="61" />)
    const a = screen.getByRole('button', { name: /Division A/ })
    const b = screen.getByRole('button', { name: /Division B/ })
    expect(a).toHaveAttribute('aria-expanded', 'false')
    expect(a).toHaveTextContent('2')
    // Status summary by glyph + count, not colour.
    expect(a).toHaveTextContent('✗ 1')
    expect(a).toHaveTextContent('⚠ 1')
    expect(b).toHaveTextContent('1')
    expect(screen.queryByTestId('club-card')).toBeNull()
    expect(screen.queryAllByTestId('mobile-row')).toHaveLength(0)
  })

  it('renders an open group (page-owned) as row links with chip and key numbers', () => {
    render(
      <ClubsTable
        clubs={CLUBS}
        districtId="61"
        openGroups={['A']}
        onOpenGroupsChange={vi.fn()}
        clubLinkState={{ fromClubsSearch: '?open=A' }}
      />
    )
    const rows = screen.getAllByTestId('mobile-row')
    expect(rows).toHaveLength(2)
    const alpha = rows[0]!
    expect(alpha).toHaveAttribute('href', '/district/61/club/1')
    // Line 1 is the name alone — at 375 px it needs the full row width.
    expect(alpha.querySelector('.mobile-row__line1')).toHaveTextContent(
      /^Alpha Speakers$/
    )
    // Line 2: glyph + one-word status, then DCP.
    const line2 = alpha.querySelector('.mobile-row__line2')!
    expect(line2).toHaveTextContent('✗ Intervention')
    expect(line2).toHaveTextContent(/^✗ Intervention\s*5\/10 DCP$/)
    // Members ride under the trend sparkline (#1792); the name keeps them.
    expect(alpha.querySelector('.clubs-row-trend__net')).toHaveTextContent(
      '8 (−10)'
    )
    expect(alpha).toHaveAccessibleName(/8 members/)
    // Net change stays in the accessible name.
    expect(alpha).toHaveAccessibleName(/net −10/)
  })

  it('flags an actively coached club on line 1, in words (#1968)', () => {
    // #1954 measured line 2 (chip + DCP) full at 375 — "· Coach" clipped to
    // "· C…". The flag rides line 1 after the name instead: the name
    // ellipsizes, the flag never does, and line 2 is untouched.
    render(
      <ClubsTable
        clubs={[
          club('1', 'Alpha Speakers', 'A', {
            coach: { status: 'active', since: '2026-07-25' },
          }),
          club('2', 'Bravo Talkers', 'A', {
            coach: { status: 'completed', since: '2025-11-02' },
          }),
          club('3', 'Charlie Orators', 'A'),
        ]}
        districtId="61"
        openGroups={['A']}
        onOpenGroupsChange={vi.fn()}
      />
    )
    const [alpha, bravo, charlie] = screen.getAllByTestId('mobile-row')
    const flag = alpha!.querySelector('.mobile-row__line1 .mobile-row__badge')
    expect(flag).toHaveTextContent(/^Coach$/)
    expect(alpha!.querySelector('.mobile-row__line2')).toHaveTextContent(
      /^✓ Thriving\s*5\/10 DCP$/
    )
    expect(alpha).toHaveAccessibleName(/, active coach,/)
    // Completed or no coach: no flag, nothing in the name.
    for (const row of [bravo!, charlie!]) {
      expect(row.querySelector('.mobile-row__badge')).toBeNull()
      expect(row).not.toHaveAccessibleName(/coach/i)
    }
  })

  it('asks the page to toggle a group (URL-owned open set)', () => {
    const onOpenGroupsChange = vi.fn()
    render(
      <ClubsTable
        clubs={CLUBS}
        districtId="61"
        openGroups={['A']}
        onOpenGroupsChange={onOpenGroupsChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Division B/ }))
    expect(onOpenGroupsChange).toHaveBeenCalledWith(['A', 'B'])
    fireEvent.click(screen.getByRole('button', { name: /Division A/ }))
    expect(onOpenGroupsChange).toHaveBeenLastCalledWith([])
  })

  // #2335: long club names wrap to two lines instead of ellipsizing, in
  // both the grouped browse view and the flat result list (#2329's mode).
  it('renders flush lists whose names may wrap (grouped and flat)', () => {
    const { container, unmount } = render(
      <ClubsTable clubs={CLUBS} districtId="61" />
    )
    const grouped = container.querySelector('.mobile-row-list')
    expect(grouped).toHaveClass('mobile-row-list--flush')
    expect(grouped).toHaveClass('mobile-row-list--wrap')
    unmount()

    const flat = render(
      <ClubsTable
        clubs={CLUBS}
        districtId="61"
        initialFilterState={{
          name: {
            field: 'name',
            type: 'text',
            value: 'a',
            operator: 'contains',
          },
        }}
      />
    ).container.querySelector('.mobile-row-list')
    expect(flat).toHaveClass('mobile-row-list--flush')
    expect(flat).toHaveClass('mobile-row-list--wrap')
  })

  it('shows one flat result list (no groups) while a search is active', () => {
    render(
      <ClubsTable
        clubs={CLUBS}
        districtId="61"
        initialFilterState={{
          name: {
            field: 'name',
            type: 'text',
            value: 'a',
            operator: 'contains',
          },
        }}
      />
    )
    expect(screen.queryByRole('button', { name: /Division A/ })).toBeNull()
    const list = screen.getByRole('list', { name: /clubs/i })
    expect(within(list).getAllByTestId('mobile-row')).toHaveLength(3)
  })

  it('shows one flat list in sorted order when the sort is not the default', () => {
    render(
      <ClubsTable
        clubs={CLUBS}
        districtId="61"
        initialSortField="membership"
        initialSortDirection="desc"
      />
    )
    expect(screen.queryByRole('button', { name: /Division A/ })).toBeNull()
    const names = screen
      .getAllByTestId('mobile-row')
      .map(r => r.querySelector('.mobile-row__title')?.textContent)
    expect(names).toEqual([
      'Charlie Orators',
      'Bravo Talkers',
      'Alpha Speakers',
    ])
  })

  it('the mobile sort control writes through onSortChange (URL state)', () => {
    // Sort moved into the Filter & sort sheet (#1836).
    const onSortChange = vi.fn()
    render(
      <ClubsTable clubs={CLUBS} districtId="61" onSortChange={onSortChange} />
    )
    fireEvent.click(screen.getByRole('button', { name: /filter & sort/i }))
    fireEvent.change(screen.getByLabelText('Sort by'), {
      target: { value: 'membership' },
    })
    expect(onSortChange).toHaveBeenCalledWith('membership', 'asc')
    fireEvent.click(screen.getByRole('button', { name: 'Descending' }))
    expect(onSortChange).toHaveBeenLastCalledWith('membership', 'desc')
  })

  it('renders exactly one search box, in a sticky bar above the list', () => {
    render(<ClubsTable clubs={CLUBS} districtId="61" />)
    const boxes = screen.getAllByRole('searchbox')
    expect(boxes).toHaveLength(1)
    expect(boxes[0]!.closest('.clubs-mobile-sticky-search')).not.toBeNull()
  })

  it('keeps the desktop table at ≥ 768 px (no rows, no groups)', () => {
    stubMobile(false)
    render(<ClubsTable clubs={CLUBS} districtId="61" />)
    expect(screen.queryAllByTestId('mobile-row')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Division A/ })).toBeNull()
    expect(
      screen.getByRole('region', { name: 'All clubs table' })
    ).toBeVisible()
  })
})
