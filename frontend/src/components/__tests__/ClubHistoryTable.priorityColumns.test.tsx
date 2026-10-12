/**
 * ClubHistoryTable below 768 (#1834, mobile epic #1827).
 *
 * The 6-column table was 778px in a 325px scroller at 375 and clipped the
 * tier chip ("President's Disting…", Lesson 134). Below 768 it is a
 * PriorityColumnsTable: program year + 2 chosen metrics (?cols=), sortable
 * through the shared SortableHeader, with the tier as a short chip and the
 * full table in the sheet. ≥768 is covered unchanged by
 * ClubHistoryTable.test.tsx.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ClubHistoryTable } from '../ClubHistoryTable'
import type { ClubHistoryRow } from '../../utils/clubHistory'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => true }))

afterEach(() => cleanup())

const rows: ClubHistoryRow[] = [
  {
    startYear: 2022,
    label: '2022-2023',
    yearEndDate: '2023-06-30',
    hasData: true,
    dcpGoals: 4,
    tierCode: null,
    tierLabel: '—',
    membershipBase: 25,
    membershipEnd: 19,
    membershipNet: -6,
    octoberRenewals: 12,
    aprilRenewals: null,
    clubStatus: 'Low',
  },
  {
    startYear: 2023,
    label: '2023-2024',
    yearEndDate: '2024-06-30',
    hasData: true,
    dcpGoals: 9,
    tierCode: 'P',
    tierLabel: "President's Distinguished",
    membershipBase: 20,
    membershipEnd: 32,
    membershipNet: 12,
    octoberRenewals: 18,
    aprilRenewals: 16,
    clubStatus: 'Active',
  },
]

const Where = () => <output data-testid="where">{useLocation().search}</output>

const renderAt = (url = '/club/123/history') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <ClubHistoryTable rows={rows} clubName="Test Club" clubId="123" />
      <Where />
    </MemoryRouter>
  )

const table = () =>
  screen.getByRole('table', { name: 'Test Club program-year history' })
const headers = () =>
  within(table())
    .getAllByRole('columnheader')
    .map(th => th.textContent?.trim())
const years = () =>
  within(table())
    .getAllByRole('link')
    .map(a => a.textContent)

describe('ClubHistoryTable priority columns below 768 (#1834)', () => {
  it('shows year + DCP + Tier, newest first, no scroll region', () => {
    renderAt()
    expect(headers()).toEqual(['Year', 'DCP', 'Tier'])
    expect(years()).toEqual(['2023-2024', '2022-2023'])
    expect(
      screen.queryByRole('region', { name: /program-year history/ })
    ).toBeNull()
  })

  it('year cells link to that program year on the club page', () => {
    renderAt()
    expect(
      within(table()).getByRole('link', { name: '2023-2024' })
    ).toHaveAttribute('href', '/club/123?py=2023')
  })

  it('renders the tier as a short chip with the full name for AT (Lesson 134)', () => {
    renderAt()
    const chip = within(table()).getByTitle("President's Distinguished")
    expect(chip.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      'Pres.'
    )
    expect(chip.querySelector('.sr-only')?.textContent).toBe(
      "President's Distinguished"
    )
  })

  it('sorts by a shown metric through the shared SortableHeader', () => {
    renderAt()
    fireEvent.click(
      within(table()).getByRole('button', { name: /Sort by DCP/ })
    )
    expect(years()).toEqual(['2022-2023', '2023-2024'])
  })

  it('swaps a metric by chip into ?cols=', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Members' }))
    expect(headers()).toEqual(['Year', 'Tier', 'Members'])
    expect(screen.getByTestId('where').textContent).toBe(
      '?cols=tier%2Cmembership'
    )
    expect(within(table()).getByText('20 → 32')).toBeInTheDocument()
  })

  it('opens the complete 6-column table in the full-screen sheet', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: /full table/i }))
    const dialog = screen.getByRole('dialog', { name: /Test Club/ })
    const full = within(within(dialog).getByRole('region')).getByRole('table')
    expect(within(full).getAllByRole('columnheader')).toHaveLength(6)
  })
})
