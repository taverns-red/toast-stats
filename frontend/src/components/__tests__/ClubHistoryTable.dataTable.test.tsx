/**
 * Club history on the shared DataTable (#2733, #2676, spec §14 M6).
 *
 * Sort only. What the foundation adds is the contract every data table shares:
 * a caption that says what and how many, a row-header cell with the year link,
 * a one-row header of sortable buttons, the tier as text (no pill), no column
 * hidden by CSS, and no text below the 14px floor.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ClubHistoryTable } from '../ClubHistoryTable'
import type { ClubHistoryRow } from '../../utils/clubHistory'

afterEach(() => cleanup())

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
    districtId: '61',
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
    districtId: '86',
  },
]

const setup = () =>
  render(
    <MemoryRouter>
      <ClubHistoryTable
        rows={rows}
        clubName="Test Club"
        clubId="123"
        showDistrict
      />
    </MemoryRouter>
  )

const getTable = () => screen.getByRole('table')

describe('ClubHistoryTable on the DataTable (#2733)', () => {
  it('is a DataTable with a caption that says what and how many', () => {
    setup()
    const table = getTable()
    expect(table).toHaveClass('dt')
    expect(table.querySelector('caption')?.textContent).toMatch(
      /test club.*program year.*2 program years/i
    )
  })

  it('makes the year the row header, with a real link', () => {
    setup()
    const cell = getTable().querySelector('tbody th')!
    expect(cell).toHaveAttribute('scope', 'row')
    expect(cell.querySelector('a')).toHaveAttribute(
      'href',
      '/district/61/club/123?py=2023'
    )
  })

  it('has one header row of scope=col headers and no Columns menu', () => {
    setup()
    const table = getTable()
    expect(table.querySelectorAll('thead tr')).toHaveLength(1)
    for (const th of table.querySelectorAll('thead th'))
      expect(th).toHaveAttribute('scope', 'col')
    expect(screen.queryByRole('button', { name: /^Columns/ })).toBeNull()
  })

  it('sets aria-sort on exactly the sorted column', () => {
    setup()
    const sorted = getTable().querySelectorAll('thead th[aria-sort]')
    expect(sorted).toHaveLength(1)
    expect(sorted[0]).toHaveTextContent(/program year/i)
  })

  it('shows the tier as plain text, with no pill', () => {
    setup()
    const table = getTable()
    expect(table.innerHTML).not.toMatch(/club-history-tier/)
    expect(table).toHaveTextContent("President's Distinguished")
  })

  it('hides no column with CSS', () => {
    setup()
    expect(getTable().innerHTML).not.toMatch(
      /class="(?:[^"]*\s)?(?:[a-z]+:)?(?:hidden|table-cell)(?:\s[^"]*)?"|__col--/
    )
  })

  it('sets no text below the 14px floor on the table', () => {
    setup()
    expect(getTable().innerHTML).not.toMatch(/\btext-(?:xs|\[(?:9|1[0-3])px\])/)
  })
})

describe('ClubHistoryTable year column (#2733)', () => {
  const inProgressRows = [{ ...rows[0]!, inProgress: true }, rows[1]!]
  const css = readFileSync(
    join(__dirname, '../../styles/components/club-history.css'),
    'utf-8'
  )
  const renderInProgress = () =>
    render(
      <MemoryRouter>
        <ClubHistoryTable rows={inProgressRows} clubName="C" clubId="123" />
      </MemoryRouter>
    )

  it('keeps the table at 920px with District, so it fits at 1024', () => {
    setup()
    expect(getTable().style.minWidth).toBe('920px')
  })

  it('keeps the year text on one line', () => {
    renderInProgress()
    expect(css).toMatch(
      /\.club-history-year-link\s*\{[^}]*white-space:\s*nowrap/
    )
  })

  it('puts the in-progress tag on its own line under the year', () => {
    renderInProgress()
    expect(screen.getByText('in progress')).toBeInTheDocument()
    expect(css).toMatch(/\.club-history-in-progress\s*\{[^}]*display:\s*block/)
  })
})
