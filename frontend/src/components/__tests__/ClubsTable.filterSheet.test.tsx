/**
 * ClubsTable adopts the shared Filter & sort sheet below 768 (#1836).
 *
 * The desktop FiltersPanel's column-filter semantics ("Contains / Starts
 * with", Min/Max) become facet chips for status, division and area, with
 * sort inside the sheet. All state still flows out through onFilterChange /
 * onSortChange (the page writes the URL); ≥ 768 keeps the existing panel.
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
  area: string,
  overrides: Partial<ClubTrend> = {}
): ClubTrend => ({
  clubId: id,
  clubName: name,
  divisionId: div,
  divisionName: `Division ${div}`,
  areaId: area,
  areaName: `Area ${area}`,
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'thriving',
  riskFactors: [],
  membershipBase: 18,
  membershipTrend: [{ date: '2026-05-01', count: 20 }],
  dcpGoalsTrend: [{ date: '2026-05-01', goalsAchieved: 5 }],
  ...overrides,
})

const CLUBS: ClubTrend[] = [
  club('1', 'Alpha Speakers', 'A', 'A1', {
    currentStatus: 'intervention-required',
  }),
  club('2', 'Bravo Talkers', 'A', 'A2', { currentStatus: 'vulnerable' }),
  club('3', 'Charlie Orators', 'B', 'B1'),
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

const openSheet = () => {
  fireEvent.click(screen.getByRole('button', { name: /filter & sort/i }))
  return screen.getByRole('dialog', { name: 'Filter & sort' })
}

beforeEach(() => stubMobile(true))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ClubsTable < 768 — Filter & sort sheet (#1836)', () => {
  it('opens the shared sheet, not the desktop column-filter panel', () => {
    render(<ClubsTable clubs={CLUBS} districtId="61" />)
    const sheet = openSheet()
    expect(within(sheet).queryByText(/starts with/i)).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull()
  })

  it('filters by status in two taps, writing the URL once per tap', () => {
    const onFilterChange = vi.fn()
    render(
      <ClubsTable
        clubs={CLUBS}
        districtId="61"
        onFilterChange={onFilterChange}
      />
    )
    const sheet = openSheet()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Vulnerable' }))
    expect(onFilterChange).toHaveBeenCalledTimes(1)
    expect(onFilterChange.mock.calls[0]![0].status.value).toEqual([
      'vulnerable',
    ])
    // The apply button carries the live count and closes the sheet.
    fireEvent.click(within(sheet).getByRole('button', { name: 'Show 1 club' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getAllByTestId('mobile-row')).toHaveLength(1)
  })

  it('offers division chips from the clubs and filters by exact division', () => {
    const onFilterChange = vi.fn()
    render(
      <ClubsTable
        clubs={CLUBS}
        districtId="61"
        onFilterChange={onFilterChange}
      />
    )
    const sheet = openSheet()
    const division = within(sheet).getByRole('group', { name: 'Division' })
    fireEvent.click(within(division).getByRole('button', { name: 'B' }))
    expect(onFilterChange.mock.calls[0]![0].division).toEqual({
      field: 'division',
      type: 'categorical',
      value: ['Division B'],
      operator: 'in',
    })
  })

  it('narrows the area chips to the selected divisions', () => {
    render(
      <ClubsTable
        clubs={CLUBS}
        districtId="61"
        initialFilterState={{
          division: {
            field: 'division',
            type: 'categorical',
            value: ['Division A'],
            operator: 'in',
          },
        }}
      />
    )
    const sheet = openSheet()
    const area = within(sheet).getByRole('group', { name: 'Area' })
    expect(
      within(area)
        .getAllByRole('button')
        .map(b => b.textContent)
    ).toEqual(['A1', 'A2'])
  })

  it('shows the active-filter count on the trigger, not counting the search', () => {
    render(
      <ClubsTable
        clubs={CLUBS}
        districtId="61"
        initialFilterState={{
          status: {
            field: 'status',
            type: 'categorical',
            value: ['vulnerable'],
            operator: 'in',
          },
          name: {
            field: 'name',
            type: 'text',
            value: 'a',
            operator: 'contains',
          },
        }}
      />
    )
    expect(
      screen.getByRole('button', { name: /filter & sort/i })
    ).toHaveAccessibleName('Filter & sort, 1 active')
  })

  it('"Clear all" clears the sheet filters but keeps the search', () => {
    const onFilterChange = vi.fn()
    render(
      <ClubsTable
        clubs={CLUBS}
        districtId="61"
        onFilterChange={onFilterChange}
        initialFilterState={{
          status: {
            field: 'status',
            type: 'categorical',
            value: ['vulnerable'],
            operator: 'in',
          },
          name: {
            field: 'name',
            type: 'text',
            value: 'a',
            operator: 'contains',
          },
        }}
      />
    )
    const sheet = openSheet()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Clear all' }))
    expect(onFilterChange).toHaveBeenCalledTimes(1)
    expect(Object.keys(onFilterChange.mock.calls[0]![0])).toEqual(['name'])
  })

  it('sorts from inside the sheet with one onSortChange', () => {
    const onSortChange = vi.fn()
    render(
      <ClubsTable clubs={CLUBS} districtId="61" onSortChange={onSortChange} />
    )
    const sheet = openSheet()
    fireEvent.change(within(sheet).getByLabelText('Sort by'), {
      target: { value: 'membership' },
    })
    expect(onSortChange).toHaveBeenCalledTimes(1)
    expect(onSortChange).toHaveBeenCalledWith('membership', 'asc')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Descending' }))
    expect(onSortChange).toHaveBeenLastCalledWith('membership', 'desc')
  })

  it('drops the separate inline sort row — sort lives in the sheet', () => {
    render(<ClubsTable clubs={CLUBS} districtId="61" />)
    expect(screen.queryByLabelText('Sort clubs')).toBeNull()
  })
})

describe('ClubsTable < 768 — one-row toolbar (#1836, toolbar ≤ 100 px)', () => {
  it('puts the Filter & sort trigger in the sticky search row', () => {
    render(<ClubsTable clubs={CLUBS} districtId="61" />)
    const trigger = screen.getByRole('button', { name: /filter & sort/i })
    expect(trigger.closest('.clubs-mobile-sticky-search')).not.toBeNull()
    expect(
      screen.getAllByRole('button', { name: /filter & sort/i })
    ).toHaveLength(1)
  })

  it('keeps the shared row readable at 375: short visible labels, full names', () => {
    render(<ClubsTable clubs={CLUBS} districtId="61" />)
    const trigger = screen.getByRole('button', { name: /filter & sort/i })
    // Visible "Filter" is contained in the accessible name (WCAG 2.5.3).
    expect(trigger).toHaveTextContent(/^Filter$/)
    const search = screen.getByRole('searchbox', {
      name: 'Search clubs by name',
    })
    expect(search).toHaveAttribute('placeholder', 'Search clubs')
  })

  it('moves the Close to Distinguished preset into the sheet', () => {
    const onPresetChange = vi.fn()
    render(
      <ClubsTable
        clubs={CLUBS}
        districtId="61"
        onPresetChange={onPresetChange}
      />
    )
    expect(
      screen.queryByRole('button', { name: /close to distinguished/i })
    ).toBeNull()
    const sheet = openSheet()
    const quick = within(sheet).getByRole('group', { name: 'Quick filter' })
    const chip = within(quick).getByRole('button', {
      name: /close to distinguished/i,
    })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(chip)
    expect(onPresetChange).toHaveBeenCalledTimes(1)
    expect(onPresetChange).toHaveBeenCalledWith(true)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
  })

  it('counts an active preset on the trigger and clears it with "Clear all"', () => {
    const onPresetChange = vi.fn()
    render(
      <ClubsTable
        clubs={CLUBS}
        districtId="61"
        initialPresetActive
        onPresetChange={onPresetChange}
      />
    )
    expect(
      screen.getByRole('button', { name: /filter & sort/i })
    ).toHaveAccessibleName('Filter & sort, 1 active')
    const sheet = openSheet()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Clear all' }))
    expect(onPresetChange).toHaveBeenCalledWith(false)
  })
})

describe('ClubsTable ≥ 768 — existing filter UI (#1836)', () => {
  it('keeps the desktop Filters panel', () => {
    stubMobile(false)
    render(<ClubsTable clubs={CLUBS} districtId="61" />)
    fireEvent.click(screen.getByRole('button', { name: /^filters/i }))
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Filter & sort' })).toBeNull()
  })
})
