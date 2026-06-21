/**
 * Unit tests for ClubHistoryTable (#1229, epic #1228).
 *
 * Presentational, comparison-across-rows table: one row per program year for a
 * single club. Per Lesson 105 it stays a TABLE (not card-collapse) because its
 * value is comparing years against each other. Covers value rendering,
 * em-dash for missing data, tier badge, sortable headers, and the
 * keyboard-operable scroll region.
 */

import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClubHistoryTable } from '../ClubHistoryTable'
import type { ClubHistoryRow } from '../../utils/clubHistory'

const rows: ClubHistoryRow[] = [
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
]

describe('ClubHistoryTable (#1229)', () => {
  it('renders one row per program year with its values', () => {
    render(<ClubHistoryTable rows={rows} clubName="Test Club" />)
    expect(screen.getByText('2023-2024')).toBeInTheDocument()
    expect(screen.getByText('2022-2023')).toBeInTheDocument()
    // DCP goals (rendered out of 10)
    expect(screen.getByText('9 / 10')).toBeInTheDocument()
    // Tier label
    expect(screen.getByText("President's Distinguished")).toBeInTheDocument()
  })

  it('shows em-dashes for a no-data year rather than crashing', () => {
    const noData: ClubHistoryRow = {
      startYear: 2021,
      label: '2021-2022',
      yearEndDate: '2022-06-30',
      hasData: false,
      dcpGoals: null,
      tierCode: null,
      tierLabel: '—',
      membershipBase: null,
      membershipEnd: null,
      membershipNet: null,
      octoberRenewals: null,
      aprilRenewals: null,
      clubStatus: null,
    }
    render(<ClubHistoryTable rows={[noData]} clubName="Test Club" />)
    // DCP, tier, membership, status all collapse to standalone em-dashes.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
  })

  it('renders a positive net with a + sign and a negative net plainly', () => {
    render(<ClubHistoryTable rows={rows} clubName="Test Club" />)
    expect(screen.getByText(/\+12/)).toBeInTheDocument()
    expect(screen.getByText(/-6/)).toBeInTheDocument()
  })

  it('exposes a keyboard-operable, labelled scroll region (Lesson 105)', () => {
    render(<ClubHistoryTable rows={rows} clubName="Test Club" />)
    const region = screen.getByRole('region', { name: /history/i })
    expect(region).toHaveAttribute('tabindex', '0')
  })

  it('sorts by DCP goals ascending when its header is activated', async () => {
    const user = userEvent.setup()
    render(<ClubHistoryTable rows={rows} clubName="Test Club" />)
    const goalsHeader = screen.getByRole('button', { name: /dcp goals/i })
    await user.click(goalsHeader)

    const bodyRows = screen.getAllByRole('row').slice(1) // drop header row
    // Ascending by goals → 2022-23 (4 goals) before 2023-24 (9 goals).
    expect(within(bodyRows[0]!).getByText('2022-2023')).toBeInTheDocument()
    expect(within(bodyRows[1]!).getByText('2023-2024')).toBeInTheDocument()
  })

  it('defaults to newest program year first', () => {
    render(<ClubHistoryTable rows={rows} clubName="Test Club" />)
    const bodyRows = screen.getAllByRole('row').slice(1)
    expect(within(bodyRows[0]!).getByText('2023-2024')).toBeInTheDocument()
  })
})
