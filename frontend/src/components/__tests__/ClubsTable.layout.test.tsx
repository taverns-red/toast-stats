/**
 * Clubs table layout and the DataTable shell (#2676, spec §5, §7, §11, §12
 * tests 6, 11, 14; PR 3).
 *
 * jsdom has no layout engine, so these pin the structure that the layout rides
 * on (colgroup, caption, scope, overflow attributes, no row click); the
 * Playwright smoke `clubs-table-layout.smoke.ts` measures the result.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import {
  render as rtlRender,
  cleanup,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps, ReactElement } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ClubsTable } from '../ClubsTable'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import type { FilterState } from '../filters/types'
import { storageKey } from '../../utils/localStorageStore'
import { stubViewportWidth } from '../../test-utils/viewportMatchMedia'

const COLUMNS_KEY = storageKey('clubs-table:columns')

const LocationProbe = () => (
  <div data-testid="location">{useLocation().pathname}</div>
)

const render = (ui: ReactElement) =>
  rtlRender(
    <MemoryRouter initialEntries={['/district/61/clubs']}>
      {ui}
      <LocationProbe />
    </MemoryRouter>
  )

const makeClub = (over: Partial<ClubTrend> = {}): ClubTrend => ({
  clubId: 'c1',
  clubName: 'Alpha Club',
  divisionId: 'div-1',
  divisionName: 'A',
  areaId: 'area-1',
  areaName: '1',
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'thriving',
  riskFactors: [],
  membershipTrend: [{ date: '2026-03-01T00:00:00.000Z', count: 20 }],
  dcpGoalsTrend: [{ date: '2026-03-01T00:00:00.000Z', goalsAchieved: 5 }],
  ...over,
})

const CLUBS = [
  makeClub(),
  makeClub({ clubId: 'c2', clubName: 'Bravo Club' }),
  makeClub({ clubId: 'c3', clubName: 'Charlie Club' }),
]

const renderTable = (props: Partial<ComponentProps<typeof ClubsTable>> = {}) =>
  render(
    <ClubsTable clubs={CLUBS} districtId="61" isLoading={false} {...props} />
  )

const headerLabels = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>('#clubs-table thead th')
  ).map(th => th.textContent?.trim() ?? '')

beforeEach(() => {
  localStorage.clear()
  stubViewportWidth(1024)
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sizing and colgroup (#2676, spec §5.3)', () => {
  it('renders one <col> per visible column, widths from the column meta', () => {
    renderTable()
    const cols = Array.from(
      document.querySelectorAll<HTMLElement>('#clubs-table colgroup col')
    )
    expect(cols).toHaveLength(9)
    // Club takes the remainder: no width. The rest are fixed (spec §4.1).
    expect(cols[0]!.style.width).toBe('')
    expect(cols.slice(1).map(c => c.style.width)).toEqual([
      '72px', // Division
      '56px', // Area
      '132px', // Health
      '96px', // Members
      '104px', // Trend
      '72px', // Needed
      '88px', // DCP
      '124px', // Tier
    ])
  })

  it('uses a fixed layout whose min-width is the total of the column sizes', () => {
    renderTable()
    const table = document.getElementById('clubs-table') as HTMLElement
    expect(table.style.minWidth).toBe(`${180 + 744}px`)
  })
})

describe('table semantics (#2676, spec §7, §11, test 6)', () => {
  it('captions the table with the district, date, count and the sort hint', () => {
    renderTable({ dataDate: '2026-11-11' })
    const caption = document.querySelector('#clubs-table caption')
    expect(caption).not.toBeNull()
    expect(caption!.textContent).toMatch(/All clubs in District 61/)
    expect(caption!.textContent).toMatch(/as of Nov 11, 2026/)
    expect(caption!.textContent).toMatch(/3 clubs/)
    expect(caption!.textContent).toMatch(
      /Column headers with buttons are sortable/
    )
  })

  it('makes the Club cell the row header: th[scope=row], and no other body th', () => {
    renderTable()
    const row = document.querySelector(
      '#clubs-table tbody tr:first-child'
    ) as HTMLElement
    const th = row.querySelectorAll('th')
    expect(th).toHaveLength(1)
    expect(th[0]).toHaveAttribute('scope', 'row')
    expect(within(th[0] as HTMLElement).getByRole('link')).toHaveTextContent(
      'Alpha Club'
    )
    expect(row.querySelectorAll('td')).toHaveLength(8)
  })

  it('puts aria-sort on exactly one column header, the sorted one', () => {
    renderTable()
    const sorted = document.querySelectorAll('#clubs-table thead th[aria-sort]')
    expect(sorted).toHaveLength(1)
    expect(sorted[0]).toHaveAttribute('aria-sort', 'ascending')
    expect(sorted[0]!.textContent).toContain('Club')
  })

  it('names a sort button by its visible label (APG sortable table)', () => {
    renderTable()
    const btn = screen.getByRole('button', { name: 'Members' })
    expect(btn).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /click to flip direction/i })
    ).toBeNull()
  })

  it('announces the count in a polite live region outside the table', () => {
    renderTable()
    const count = screen.getByText(/Total: 3 clubs/)
    expect(count.closest('[aria-live="polite"]')).not.toBeNull()
    expect(count.closest('table')).toBeNull()
  })

  it('titles the panel with an H2, not an H3 (HUB-21)', () => {
    renderTable()
    expect(
      screen.getByRole('heading', { level: 2, name: 'All clubs' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
  })
})

describe('no inner scroller, no row click (#2676, spec §5.1, Q4)', () => {
  it('has no vertical inner scroller element around the table', () => {
    renderTable()
    expect(document.querySelector('.clubs-table-scroll')).toBeNull()
    expect(document.querySelector('.clubs-table-sticky-head')).toBeNull()
  })

  it('does not navigate when a non-link cell is clicked', async () => {
    const user = userEvent.setup()
    renderTable()
    const cell = document.querySelector(
      '#clubs-table tbody tr:first-child td'
    ) as HTMLElement
    await user.click(cell)
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/district/61/clubs'
    )
    const row = cell.closest('tr') as HTMLElement
    expect(row.className).not.toContain('cursor-pointer')
  })

  it('keeps the club name link as the row action', async () => {
    const user = userEvent.setup()
    renderTable()
    await user.click(screen.getByRole('link', { name: 'Alpha Club' }))
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/district/61/club/c1'
    )
  })
})

describe('overflow mode (#2676, spec §5.2)', () => {
  const stubWrapperWidth = (width: number) => {
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(width)
  }

  it('when the columns fit: no overflow flag, no region role, no tab stop', () => {
    stubWrapperWidth(1200)
    renderTable()
    const wrap = document.querySelector('.dt-scroll') as HTMLElement
    expect(wrap).not.toBeNull()
    expect(wrap).not.toHaveAttribute('data-overflow', 'true')
    expect(wrap).not.toHaveAttribute('role')
    expect(wrap).not.toHaveAttribute('tabindex')
  })

  it('when the columns do not fit: a labelled, focusable scroll region', () => {
    stubWrapperWidth(500)
    renderTable()
    const wrap = document.querySelector('.dt-scroll') as HTMLElement
    expect(wrap).toHaveAttribute('data-overflow', 'true')
    expect(wrap).toHaveAttribute('role', 'region')
    expect(wrap).toHaveAttribute('tabindex', '0')
    expect(wrap).toHaveAccessibleName(/all clubs table, scrolls sideways/i)
    expect(document.querySelector('.dt-scroll__cue--end')).not.toBeNull()
  })

  it('offers a visible hint that the table scrolls sideways', () => {
    stubWrapperWidth(500)
    renderTable()
    expect(
      screen.getByText(/scroll sideways for more columns/i)
    ).toBeInTheDocument()
  })

  it('does not scroll the header with a synced clone (Q2 = no)', () => {
    stubWrapperWidth(500)
    renderTable()
    expect(document.querySelectorAll('#clubs-table thead')).toHaveLength(1)
    expect(document.querySelector('[inert]')).toBeNull()
  })
})

describe('a sort or filter on a hidden column reveals it (#2676, PR2 review)', () => {
  it('shows the column the URL sorts by, and does not save it', () => {
    stubViewportWidth(768)
    renderTable({
      initialSortField: 'newMembers',
      initialSortDirection: 'desc',
    })
    expect(headerLabels().some(h => h.startsWith('New'))).toBe(true)
    const th = Array.from(
      document.querySelectorAll<HTMLElement>('#clubs-table thead th')
    ).find(t => t.textContent?.trim().startsWith('New'))!
    expect(th).toHaveAttribute('aria-sort', 'descending')
    expect(localStorage.getItem(COLUMNS_KEY)).toBeNull()
  })

  it('hides it again once the sort moves to a shown column', async () => {
    const user = userEvent.setup()
    stubViewportWidth(768)
    renderTable({ initialSortField: 'newMembers', initialSortDirection: 'asc' })
    await user.click(screen.getByRole('button', { name: 'Members' }))
    expect(headerLabels().some(h => h.startsWith('New'))).toBe(false)
    expect(localStorage.getItem(COLUMNS_KEY)).toBeNull()
  })

  it('shows a column the URL filters on, and does not save it', () => {
    stubViewportWidth(768)
    const filters: FilterState = {
      yearsChartered: {
        field: 'yearsChartered',
        type: 'numeric',
        value: [2, null],
      },
    }
    renderTable({ initialFilterState: filters })
    expect(headerLabels().some(h => h.startsWith('Years'))).toBe(true)
    expect(localStorage.getItem(COLUMNS_KEY)).toBeNull()
  })

  it('lists the revealed column as shown and locked in the Columns menu', async () => {
    const user = userEvent.setup()
    stubViewportWidth(768)
    renderTable({ initialSortField: 'newMembers', initialSortDirection: 'asc' })
    await user.click(screen.getByRole('button', { name: /^columns/i }))
    const box = screen.getByRole('checkbox', { name: /^New members/ })
    expect(box).toBeChecked()
    expect(box).toBeDisabled()
    expect(screen.getByText(/shown while sorted or filtered/i)).toBeTruthy()
  })
})

describe('Columns menu a11y fixes (#2676, PR2 review)', () => {
  it('only references the popover from aria-controls while it is rendered', async () => {
    const user = userEvent.setup()
    renderTable()
    const trigger = screen.getByRole('button', { name: /^columns/i })
    expect(trigger).not.toHaveAttribute('aria-controls')
    await user.click(trigger)
    const id = trigger.getAttribute('aria-controls')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)).not.toBeNull()
    await user.keyboard('{Escape}')
    expect(trigger).not.toHaveAttribute('aria-controls')
  })

  it('returns focus to the trigger without scrolling the page (lesson 139)', async () => {
    const user = userEvent.setup()
    renderTable()
    const trigger = screen.getByRole('button', { name: /^columns/i })
    await user.click(trigger)
    const focus = vi.spyOn(trigger, 'focus')
    await user.keyboard('{Escape}')
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })
})

describe('legend placement (#2676, PR1 review)', () => {
  it('sits above the table at 768 and up', () => {
    renderTable()
    const legend = screen.getByTestId('health-legend')
    const table = document.getElementById('clubs-table') as HTMLElement
    expect(
      legend.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })
})

describe('panel inset (#2676, spec §5.4, HUB-37)', () => {
  it('insets title, toolbar and filter bar by the panel padding alone from 768', () => {
    renderTable()
    const header = document.querySelector('.clubs-panel-header') as HTMLElement
    expect(header.className).toContain('md:p-0')
    const bar = document.querySelector('.clubs-active-filters-wrap')
    expect(bar).not.toBeNull()
    expect(bar!.className).toContain('md:px-0')
  })
})
