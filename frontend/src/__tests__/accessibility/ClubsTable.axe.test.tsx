// Axe scan of ClubsTable (#672, epic #665 Sprint 6 — the a11y + verification
// pass). The clubs table is the last district surface to migrate to the
// redesign chrome; sprints 1–5 rebuilt it (single sticky-header scroll, pill
// column model, segmented/chip controls, 640px card collapse). This guards its
// STRUCTURAL WCAG 2.1 AA rules — ARIA roles, accessible names, heading order,
// and scrollable-region-focusable — across desktop + mobile and both themes,
// and in the populated / no-data / loading states.
//
// Known JSDOM limitation (lesson 075): axe auto-disables `color-contrast`
// under JSDOM (no layout engine), so a green scan here is NOT a contrast proof.
// Contrast is owned by ClubsTableDarkModeContrast.test.ts (+ the controls audit)
// and verified live in both engines on the PR preview.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render as rtlRender, cleanup, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'

// CC-7 (#872): ClubsTable now renders <Link>s — wrap every render in a router
// context (wrapper option persists across rerender).
const render = (ui: ReactElement, options?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: MemoryRouter, ...options })
import { axe, toHaveNoViolations } from 'jest-axe'
import { ClubsTable } from '../../components/ClubsTable'
import { ClubTrend } from '../../hooks/useDistrictAnalytics'

expect.extend(toHaveNoViolations)

const mockClub = (overrides: Partial<ClubTrend> = {}): ClubTrend => ({
  clubId: 'club-1',
  clubName: 'Test Club',
  divisionId: 'div-1',
  divisionName: 'Division A',
  areaId: 'area-1',
  areaName: 'Area 1',
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'thriving',
  riskFactors: [],
  membershipTrend: [{ date: '2026-03-01T00:00:00.000Z', count: 20 }],
  dcpGoalsTrend: [{ date: '2026-03-01T00:00:00.000Z', goalsAchieved: 5 }],
  ...overrides,
})

// One club per status + tier so the pill branches all render.
const CLUBS: ClubTrend[] = [
  mockClub({
    clubId: 'c1',
    clubName: 'Alpha',
    currentStatus: 'thriving',
    distinguishedLevel: 'Distinguished',
  }),
  mockClub({
    clubId: 'c2',
    clubName: 'Beta',
    currentStatus: 'vulnerable',
    distinguishedLevel: 'Select',
  }),
  mockClub({
    clubId: 'c3',
    clubName: 'Gamma',
    currentStatus: 'intervention-required',
    distinguishedLevel: 'President',
  }),
]

const mobileMatchMedia = () =>
  vi.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))

beforeEach(() => document.documentElement.removeAttribute('data-theme'))
afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  cleanup()
})

describe('ClubsTable axe scan (#672)', () => {
  it('desktop, populated — no structural a11y violations (light)', async () => {
    const { container } = render(
      <ClubsTable clubs={CLUBS} districtId="61" isLoading={false} />
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('desktop, populated — no structural a11y violations (dark)', async () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    const { container } = render(
      <ClubsTable clubs={CLUBS} districtId="61" isLoading={false} />
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('mobile card view — no structural a11y violations', async () => {
    vi.stubGlobal('matchMedia', mobileMatchMedia())
    const { container } = render(
      <ClubsTable clubs={CLUBS} districtId="61" isLoading={false} />
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('no-data empty state — no structural a11y violations', async () => {
    const { container } = render(
      <ClubsTable clubs={[]} districtId="61" isLoading={false} />
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('loading state — no structural a11y violations', async () => {
    const { container } = render(
      <ClubsTable clubs={[]} districtId="61" isLoading={true} />
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  // WCAG 1.4.1 (Use of Color): health + tier are conveyed by a TEXT label, not
  // colour or a marker alone. Assert every health and tier cell carries
  // non-empty text — this proves it so a future "marker-only" refactor can't
  // silently make status colour- or shape-only.
  it('health and tier cells carry a text label (not colour alone)', () => {
    const { container } = render(
      <ClubsTable clubs={CLUBS} districtId="61" isLoading={false} />
    )
    const cells = container.querySelectorAll('.dt-health, .dt-tier')
    expect(cells.length).toBeGreaterThan(0)
    cells.forEach(cell => {
      expect(cell.textContent?.trim().length ?? 0).toBeGreaterThan(0)
    })
  })

  // In overflow mode the wrapper scrolls sideways, so it must be a focusable,
  // named region (WCAG 2.1.1 / axe scrollable-region-focusable). While the
  // columns fit it is not a scroll container, so it is neither a region nor a
  // tab stop (spec 5.2, #2676). jsdom has no layout: a stubbed width stands in.
  it('scroll container is a focusable, labelled region only when it overflows', () => {
    const width = vi
      .spyOn(Element.prototype, 'clientWidth', 'get')
      .mockReturnValue(300)
    const { container } = render(
      <ClubsTable clubs={CLUBS} districtId="61" isLoading={false} />
    )
    const region = container.querySelector('.dt-scroll')
    expect(region).not.toBeNull()
    expect(region).toHaveAttribute('role', 'region')
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region?.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0)
    // sanity: the table itself is inside the region
    expect(within(region as HTMLElement).getByRole('table')).toBeTruthy()
    width.mockRestore()
  })
})
