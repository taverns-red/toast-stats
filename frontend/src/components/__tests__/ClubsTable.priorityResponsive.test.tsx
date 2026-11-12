/**
 * ClubsTable priority-column responsive model + sticky key column + scroll-cue
 * (#812, epic #813 Sprint 4).
 *
 * Mirrors the landing rankings table contract (#811) for the club table, per
 * ADR-006 §2–3. The club table differs from the districts leaderboard in one
 * way that matters here: a club is BROWSED one-at-a-time, not compared
 * row-vs-row, so card-collapse at true mobile is the right pattern (Lesson
 * 105). Hence the responsive contract:
 *   (1) the card view appears at TRUE mobile only — `< 768px` (ADR-006 §2),
 *       not the old 640px cliff (asserted in ClubsTable.responsive.test.tsx);
 *   (2) the table (rendered at tablet ≥768 and up) has ONE sticky key column
 *       (Club) pinned at left:0 — a robust sticky, no hardcoded px offset;
 *   (3) which columns show per width is the visibility model (#2676), not a
 *       CSS class: see ClubsTable.columnsMenu.test.tsx;
 *   (4) a right-edge scroll-cue affordance signals clipped columns.
 *
 * jsdom has no layout and can't evaluate media queries (Lesson 66), so this
 * asserts the structural hooks (classes, data-attrs, elements) the CSS keys
 * off; the live per-breakpoint behaviour is proven on the PR preview channel
 * in Playwright at 375 / 768 / 1280 / 1600 + dark mode.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render as rtlRender, cleanup, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'

// CC-7 (#872): ClubsTable now renders <Link>s — wrap every render in a router
// context (wrapper option persists across rerender).
const render = (ui: ReactElement, options?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: MemoryRouter, ...options })
import { ClubsTable } from '../ClubsTable'
import { ClubTrend } from '../../hooks/useDistrictAnalytics'

const makeClub = (over: Partial<ClubTrend> = {}): ClubTrend => ({
  clubId: 'c1',
  clubName: 'Alpha',
  divisionId: 'div-1',
  divisionName: 'Division A',
  areaId: 'area-1',
  areaName: 'Area 1',
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'thriving',
  riskFactors: [],
  membershipTrend: [{ date: new Date().toISOString(), count: 20 }],
  dcpGoalsTrend: [{ date: new Date().toISOString(), goalsAchieved: 5 }],
  ...over,
})

// jsdom matchMedia defaults to no-match → ClubsTable renders the desktop
// table, which is the surface under test here.
const stubDesktopMatchMedia = () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
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

describe('ClubsTable priority-column responsive model (#812)', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('pins the Club key column with the sticky-col class on header and body', () => {
    stubDesktopMatchMedia()
    const { container } = render(
      <ClubsTable clubs={[makeClub()]} districtId="61" isLoading={false} />
    )
    const headerCells = container.querySelectorAll('#clubs-table thead th')
    // Club is the first column (COLUMN_CONFIGS order) and the only sticky one.
    expect(headerCells[0].className).toContain('clubs-table__sticky-col')
    const stickyHeaders = container.querySelectorAll(
      '#clubs-table thead th.clubs-table__sticky-col'
    )
    expect(stickyHeaders).toHaveLength(1)

    const bodyRow = container.querySelector('#clubs-table tbody tr')!
    // The Club cell is the row header (th scope=row, #2676).
    const firstCell = bodyRow.querySelector('th')!
    expect(firstCell.className).toContain('clubs-table__sticky-col')
    // The pinned cell carries the club name (the row's identity).
    expect(within(firstCell as HTMLElement).getByText('Alpha')).toBeTruthy()
  })

  // The old test here pinned `data-row-tint` on the sticky cell so it could
  // repaint opaque per status tint. Rows carry no status tint now (#2676), so
  // the attribute is gone and one hover rule covers every row; the absence is
  // asserted in ClubsTable.healthTier.test.tsx.

  // The old tests here pinned a `clubs-table__col--desktop` CSS class that hid
  // the detail columns at 768-1279. Hiding is TanStack `columnVisibility` now
  // (#2676), so a hidden column is absent from the DOM: asserted per tier in
  // ClubsTable.columnsMenu.test.tsx and, for the model, clubsColumnMeta.test.ts.

  it('wraps the scroller and renders an edge-cue affordance on each side', () => {
    stubDesktopMatchMedia()
    const { container } = render(
      <ClubsTable clubs={[makeClub()]} districtId="61" isLoading={false} />
    )
    const wrap = container.querySelector('.dt-scroll-wrap')
    expect(wrap).not.toBeNull()
    // The scroller lives inside the wrap; it is not a vertical scroller.
    expect(wrap!.querySelector('.dt-scroll')).not.toBeNull()
    expect(container.querySelector('.clubs-table-scroll')).toBeNull()
    // The cues are sibling overlays inside the wrap, one per side (#2676).
    expect(wrap!.querySelector('.dt-scroll__cue--start')).not.toBeNull()
    expect(wrap!.querySelector('.dt-scroll__cue--end')).not.toBeNull()
  })
})
