/**
 * Health + Tier cells (#2676, Clubs table spec §3 and §12 test 5).
 *
 * Ron, 2026-11-12: no row tint anywhere; the status column is "Health" and shows
 * text plus a shape marker (never a pill, never colour alone); tier is plain
 * text with "provisional" spelled out on a second line, no asterisk and no
 * tooltip-only meaning. These checks are DOM-level and falsifiable on main,
 * where rows carry bg-red-50 / bg-yellow-50 / data-row-tint, status and tier are
 * pills, and provisional is a `*` plus a `title`.
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  render as rtlRender,
  cleanup,
  within,
  screen,
} from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ClubsTable } from '../ClubsTable'
import { ClubTrend } from '../../hooks/useDistrictAnalytics'

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter })

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

const renderClubs = (clubs: ClubTrend[]) =>
  render(<ClubsTable clubs={clubs} districtId="61" isLoading={false} />)

/** The `<tr>` for a club, found through its name link. */
const rowFor = (name: string): HTMLElement => {
  const row = screen.getByText(name).closest('tr')
  if (!row) throw new Error(`no row for ${name}`)
  return row
}

describe('ClubsTable health and tier cells (#2676)', () => {
  afterEach(() => cleanup())

  it('never tints a row or its cells by status', () => {
    const { container } = renderClubs([
      createMockClub({
        clubId: 'a',
        clubName: 'Alpha',
        currentStatus: 'intervention-required',
      }),
      createMockClub({
        clubId: 'b',
        clubName: 'Bravo',
        currentStatus: 'vulnerable',
      }),
      createMockClub({ clubId: 'c', clubName: 'Charlie' }),
    ])
    expect(container.querySelector('[data-row-tint]')).toBeNull()
    expect(container.querySelector('.bg-red-50')).toBeNull()
    expect(container.querySelector('.bg-yellow-50')).toBeNull()
    expect(container.querySelector('.hover\\:bg-red-100')).toBeNull()
    expect(container.querySelector('.hover\\:bg-yellow-100')).toBeNull()
  })

  it('names the status column Health', () => {
    renderClubs([createMockClub()])
    const headers = screen.getAllByRole('columnheader')
    expect(headers.some(h => h.textContent?.trim() === 'Health')).toBe(true)
    expect(headers.some(h => h.textContent?.trim() === 'Status')).toBe(false)
  })

  it('shows Intervention as text plus sr-only "required" and an aria-hidden marker, with no pill', () => {
    renderClubs([
      createMockClub({
        clubName: 'Alpha',
        currentStatus: 'intervention-required',
      }),
    ])
    const row = rowFor('Alpha')
    expect(within(row).getByText('Intervention')).toBeInTheDocument()
    const sr = row.querySelector('.sr-only')
    expect(sr?.textContent?.toLowerCase()).toContain('required')
    const marker = row.querySelector('svg[data-marker="intervention-required"]')
    expect(marker).not.toBeNull()
    expect(marker?.getAttribute('aria-hidden')).toBe('true')
    expect(row.querySelector('[class*="clubs-status-pill"]')).toBeNull()
  })

  it.each([
    ['vulnerable', 'Vulnerable'],
    ['thriving', 'Thriving'],
  ] as const)('shows %s as a label with its own marker', (status, label) => {
    renderClubs([createMockClub({ clubName: 'Alpha', currentStatus: status })])
    const row = rowFor('Alpha')
    expect(within(row).getByText(label)).toBeInTheDocument()
    expect(row.querySelector(`svg[data-marker="${status}"]`)).not.toBeNull()
  })

  it('spells provisional out on the tier cell, with no asterisk and no title', () => {
    renderClubs([
      createMockClub({
        clubName: 'Alpha',
        distinguishedLevel: 'Select',
        isProvisionallyDistinguished: true,
      }),
    ])
    const row = rowFor('Alpha')
    expect(within(row).getByText('Select')).toBeInTheDocument()
    expect(within(row).getByText(/provisional/i)).toBeInTheDocument()
    expect(row.textContent).not.toContain('*')
    expect(row.querySelector('[title]')).toBeNull()
  })

  it('shows a confirmed tier as plain text, without a pill or "provisional"', () => {
    renderClubs([
      createMockClub({
        clubName: 'Alpha',
        distinguishedLevel: 'Distinguished',
        aprilRenewals: 30,
        membershipBase: 25,
        membershipTrend: [{ date: '2026-05-01T00:00:00.000Z', count: 30 }],
      }),
    ])
    const row = rowFor('Alpha')
    expect(within(row).getByText('Distinguished')).toBeInTheDocument()
    expect(within(row).queryByText(/provisional/i)).toBeNull()
    expect(row.querySelector('[class*="clubs-tier-pill"]')).toBeNull()
  })

  it('gives a club with no tier an sr-only "Not distinguished"', () => {
    renderClubs([createMockClub({ clubName: 'Alpha' })])
    const row = rowFor('Alpha')
    expect(within(row).getByText('Not distinguished')).toBeInTheDocument()
  })

  it('shows one always-visible legend that explains the markers and "provisional"', () => {
    renderClubs([createMockClub()])
    const legend = screen.getByTestId('health-legend')
    expect(legend.textContent).toMatch(/Intervention/)
    expect(legend.textContent).toMatch(/Vulnerable/)
    expect(legend.textContent).toMatch(/Thriving/)
    expect(legend.textContent).toMatch(/Provisional/)
    expect(legend.textContent).toMatch(/April renewals/)
    expect(legend.querySelectorAll('svg[aria-hidden="true"]').length).toBe(3)
  })
})
