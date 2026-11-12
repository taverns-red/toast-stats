/**
 * Column-model guard for ClubsTable (#669, epic #665 Sprint 3).
 *
 * Reconciles the column set/order to the HANDOFF spec and renders the
 * Health + Tier columns, Members as current/base, and DCP as an inline
 * progress bar. Falsifiable DOM checks:
 *
 *   1. Header order matches the spec exactly (extras appended).
 *   2. Tier renders as plain text (#2676; no longer a coloured pill).
 *   3. (Health cells: see ClubsTable.healthTier.test.tsx.)
 *   4. DCP renders as an accessible progressbar reading the canonical
 *      goalsAchieved count (no Goals-1-N inference).
 *   5. Members shows current / base when base is present; current-only
 *      when base is absent.
 *
 * Header labels changed from Sprint 2 (e.g. "Club Name" → "Club",
 * "Distinguished" → "Tier"). That is a deliberate spec change (Lesson 092),
 * not assertion pinning — the new labels encode the HANDOFF column set.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  render as rtlRender,
  cleanup,
  within,
  screen,
} from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'

// CC-7 (#872): ClubsTable now renders <Link>s — wrap every render in a router
// context (wrapper option persists across rerender).
const render = (ui: ReactElement, options?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: MemoryRouter, ...options })
import { ClubsTable } from '../ClubsTable'
import { ClubTrend } from '../../hooks/useDistrictAnalytics'

const createMockClub = (overrides: Partial<ClubTrend> = {}): ClubTrend => ({
  clubId: 'club-1',
  clubName: 'Test Club',
  divisionId: 'div-1',
  divisionName: 'A',
  areaId: 'area-1',
  areaName: '1',
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'thriving',
  riskFactors: [],
  membershipTrend: [{ date: '2026-03-01T00:00:00.000Z', count: 20 }],
  dcpGoalsTrend: [{ date: '2026-03-01T00:00:00.000Z', goalsAchieved: 5 }],
  ...overrides,
})

// Expected header order per the HANDOFF column set, extras (Club Status,
// Years) appended. This is THE acceptance criterion for column order.
const EXPECTED_HEADERS = [
  'Club',
  'Div',
  'Area',
  'Health',
  'Members',
  'Trend',
  'Needed',
  'New',
  'Oct Renew',
  'Apr Renew',
  'DCP',
  'Tier',
  'Club Status',
  'Coach',
  'Years',
]

function headerLabelsInOrder(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      '#clubs-table thead th .clubs-col-header span.flex-1'
    )
  ).map(el => el.textContent?.trim() ?? '')
}

describe('ClubsTable column model (#669)', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders the spec column order with extras appended', () => {
    const { container } = render(
      <ClubsTable
        clubs={[createMockClub()]}
        districtId="61"
        isLoading={false}
      />
    )
    expect(headerLabelsInOrder(container)).toEqual(EXPECTED_HEADERS)
  })

  // Tier and Health are no longer pills (#2676); their cells are covered by
  // ClubsTable.healthTier.test.tsx. The tier names still render as plain text.
  it.each([
    ['Smedley', 'Smedley'],
    ['President', "President's"],
    ['Select', 'Select'],
    ['Distinguished', 'Distinguished'],
  ] as const)('renders %s tier as the plain text %s', (level, text) => {
    render(
      <ClubsTable
        clubs={[
          createMockClub({
            clubId: `c-${level}`,
            clubName: 'Tier Club',
            distinguishedLevel: level,
            // Post-April snapshot → confirmed (not provisional).
            aprilRenewals: 30,
            membershipBase: 25,
            membershipTrend: [{ date: '2026-05-01T00:00:00.000Z', count: 30 }],
          }),
        ]}
        districtId="61"
        isLoading={false}
      />
    )
    const row = screen.getByText('Tier Club').closest('tr') as HTMLElement
    expect(within(row).getByText(text)).toBeInTheDocument()
    expect(within(row).queryByText(/provisional/i)).toBeNull()
  })

  it('renders DCP as an accessible progressbar reading the canonical goal count', () => {
    render(
      <ClubsTable
        clubs={[
          createMockClub({
            dcpGoalsTrend: [
              { date: '2026-03-01T00:00:00.000Z', goalsAchieved: 7 },
            ],
          }),
        ]}
        districtId="61"
        isLoading={false}
      />
    )
    const bar = screen.getByRole('progressbar', { name: /dcp goals/i })
    expect(bar).toHaveAttribute('aria-valuenow', '7')
    expect(bar).toHaveAttribute('aria-valuemax', '10')
  })

  it('renders Members as current / base when base is present', () => {
    const { container } = render(
      <ClubsTable
        clubs={[
          createMockClub({
            membershipBase: 18,
            membershipTrend: [{ date: '2026-03-01T00:00:00.000Z', count: 24 }],
          }),
        ]}
        districtId="61"
        isLoading={false}
      />
    )
    const cell = container.querySelector('.clubs-members-cell')
    expect(cell).not.toBeNull()
    expect(within(cell as HTMLElement).getByText('24')).toBeInTheDocument()
    // base shown alongside, muted
    expect(cell?.textContent).toMatch(/24\s*\/\s*18/)
  })

  it('renders Members current-only when base is absent', () => {
    const { container } = render(
      <ClubsTable
        clubs={[
          createMockClub({
            membershipBase: undefined,
            membershipTrend: [{ date: '2026-03-01T00:00:00.000Z', count: 24 }],
          }),
        ]}
        districtId="61"
        isLoading={false}
      />
    )
    const cell = container.querySelector('.clubs-members-cell')
    expect(cell?.textContent?.replace(/\s/g, '')).toBe('24')
  })
})
