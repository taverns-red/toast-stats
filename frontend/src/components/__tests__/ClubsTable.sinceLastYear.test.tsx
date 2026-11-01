/**
 * ClubsTable — "Climbed / slipped since last year" preset (#2432).
 *
 * The preset is one pipeline step after the column filters and the Close to
 * Distinguished preset (R11). It compares each club's DCP goals now with the
 * district's snapshot on the same date last program year (or the nearest
 * earlier one), names that date, and labels clubs with no prior-year data
 * instead of counting them as climbers.
 */
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { ClubsTable, type SinceLastYearProps } from '../ClubsTable'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import type { PriorYearClubGoals } from '../../utils/sinceLastYear'

const render = (ui: ReactElement) =>
  rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

const club = (
  clubId: string,
  clubName: string,
  goals: number,
  charterDate?: string
): ClubTrend => ({
  clubId,
  clubName,
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: '01',
  areaName: 'Area 01',
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'thriving',
  riskFactors: [],
  membershipTrend: [{ date: '2026-10-31', count: 20 }],
  dcpGoalsTrend: [{ date: '2026-10-31', goalsAchieved: goals }],
  ...(charterDate ? { charterDate } : {}),
})

const CLUBS = [
  club('1', 'Climber Club', 5, '1990-01-01'),
  club('2', 'Slipper Club', 2, '1990-01-01'),
  club('3', 'Steady Club', 4, '1990-01-01'),
  club('4', 'New Charter Club', 6, '2026-01-15'),
  // Realignment: chartered decades ago, absent from this district last year.
  club('9472', 'Realigned Club', 7, '1993-06-01'),
]

const PRIOR: PriorYearClubGoals = {
  targetDate: '2025-10-31',
  comparisonDate: '2025-10-31',
  clubs: [
    { clubId: '1', dcpGoals: 3 },
    { clubId: '2', dcpGoals: 6 },
    { clubId: '3', dcpGoals: 4 },
  ],
}

const renderTable = (since: Partial<SinceLastYearProps> = {}) => {
  const onModeChange = vi.fn()
  const view = render(
    <ClubsTable
      clubs={CLUBS}
      districtId="61"
      isLoading={false}
      sinceLastYear={{
        mode: null,
        onModeChange,
        prior: undefined,
        ...since,
      }}
    />
  )
  return { ...view, onModeChange }
}

const rowNames = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map(r => within(r).getAllByRole('cell')[0]?.textContent ?? '')

describe('ClubsTable — since last year preset (#2432)', () => {
  afterEach(() => cleanup())

  it('offers the preset in the toolbar and reports the chosen mode', () => {
    const { container, onModeChange } = renderTable()
    const select = screen.getByRole('combobox', {
      name: /dcp goals since last year/i,
    })
    expect(container.querySelector('.clubs-filter-toolbar')).toContainElement(
      select
    )
    fireEvent.change(select, { target: { value: 'slipped' } })
    expect(onModeChange).toHaveBeenCalledWith('slipped')
    fireEvent.change(select, { target: { value: '' } })
    expect(onModeChange).toHaveBeenLastCalledWith(null)
  })

  it('shows every club and no comparison column while the preset is off', () => {
    renderTable({ prior: PRIOR })
    expect(rowNames()).toHaveLength(5)
    expect(
      screen.queryByRole('columnheader', { name: /vs last year/i })
    ).not.toBeInTheDocument()
  })

  it('keeps only climbers, names the comparison date, and counts the rest', () => {
    renderTable({ mode: 'climbed', prior: PRIOR })
    expect(rowNames()).toEqual([expect.stringContaining('Climber Club')])
    const line = screen.getByText(/climbed since/i)
    expect(line).toHaveTextContent(
      '1 of 5 clubs climbed since October 31, 2025, the same date last year'
    )
    expect(line).toHaveTextContent('1 slipped')
    expect(line).toHaveTextContent('1 unchanged')
    expect(line).toHaveTextContent('2 with no prior-year data')
    // The row shows then → now.
    const cell = screen.getByTestId('since-last-year-1')
    expect(cell).toHaveTextContent('3 → 5')
  })

  it('keeps only slippers', () => {
    renderTable({ mode: 'slipped', prior: PRIOR })
    expect(rowNames()).toEqual([expect.stringContaining('Slipper Club')])
    expect(screen.getByTestId('since-last-year-2')).toHaveTextContent('6 → 2')
  })

  it('names the nearest earlier date when last year has no snapshot on the same date', () => {
    renderTable({
      mode: 'climbed',
      prior: { ...PRIOR, comparisonDate: '2025-10-28' },
    })
    expect(screen.getByText(/climbed since/i)).toHaveTextContent(
      'climbed since October 28, 2025, the nearest snapshot before October 31, 2025'
    )
  })

  it('labels new charters and realigned clubs as no prior-year data, never as climbers', () => {
    const { unmount } = renderTable({ mode: 'climbed', prior: PRIOR })
    expect(rowNames().join(' ')).not.toMatch(/Realigned|New Charter/)
    unmount()

    renderTable({ mode: 'no-prior', prior: PRIOR })
    expect(rowNames()).toEqual([
      expect.stringContaining('New Charter Club'),
      expect.stringContaining('Realigned Club'),
    ])
    expect(screen.getByTestId('since-last-year-4')).toHaveTextContent(
      'Chartered since'
    )
    expect(screen.getByTestId('since-last-year-9472')).toHaveTextContent(
      'Not in district then'
    )
  })

  it('labels every club no prior-year data when the district has no prior-year snapshot (the 200-series)', () => {
    renderTable({
      mode: 'climbed',
      prior: { targetDate: '2025-10-31', comparisonDate: null, clubs: null },
    })
    expect(screen.queryAllByRole('row')).toHaveLength(0)
    expect(
      screen.getByText(/no snapshot for this district/i)
    ).toHaveTextContent(
      'No snapshot for this district on or before October 31, 2025 in last program year, so all 5 clubs have no prior-year data.'
    )
  })

  it('shows a loading line and filters nothing until last year has loaded', () => {
    renderTable({ mode: 'climbed', prior: undefined })
    expect(screen.getByText(/loading last year/i)).toBeInTheDocument()
    expect(rowNames()).toHaveLength(5)
  })

  it('says so when last year cannot be loaded, and marks no club as a climber', () => {
    renderTable({ mode: 'climbed', prior: undefined, isError: true })
    expect(
      screen.getByText(/last year.s dcp goals could not be loaded/i)
    ).toBeInTheDocument()
    expect(screen.queryByTestId('since-last-year-1')).not.toBeInTheDocument()
  })
})
