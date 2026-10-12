import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { axe, toHaveNoViolations } from 'jest-axe'
import {
  PriorityColumnsTable,
  type PriorityMetric,
} from '../PriorityColumnsTable'
import { useUrlSort } from '../../hooks/useUrlSort'

expect.extend(toHaveNoViolations)

/* #1834 (mobile epic #1827 Phase 1) — priority columns for compare-across-
   rows tables on phones (review §5.2, Lesson 105). Below 768: identity column
   + 2 metric columns chosen by a chip row (`?cols=`), sortable through the
   shared SortableHeader, no horizontal scroll; "Full table" opens the
   complete table in the shared BottomSheet (#1860), full-screen. ≥768 renders
   the caller's full table unchanged. */

let mobile = true
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => mobile,
}))

beforeEach(() => {
  mobile = true
})
afterEach(cleanup)

interface Row {
  id: string
  name: string
  clubs: number
  payments: number
  tier: string
}
const ROWS: Row[] = [
  { id: '1', name: 'Alpha', clubs: 10, payments: 300, tier: 'Select' },
  { id: '2', name: 'Bravo', clubs: 30, payments: 100, tier: '—' },
  { id: '3', name: 'Charlie', clubs: 20, payments: 200, tier: "President's" },
]
type F = 'name' | 'clubs' | 'payments'
const METRICS: PriorityMetric<Row, F>[] = [
  { id: 'clubs', label: 'Clubs', render: r => r.clubs, sortField: 'clubs' },
  {
    id: 'payments',
    label: 'Payments',
    render: r => r.payments,
    sortField: 'payments',
  },
  { id: 'tier', label: 'Tier', render: r => r.tier },
]

const Where = () => {
  const l = useLocation()
  return <output data-testid="where">{l.search}</output>
}

const Harness = () => {
  const { sort, toggleSort } = useUrlSort<F>({
    fields: ['name', 'clubs', 'payments'],
    defaultField: 'name',
  })
  const dir = sort.direction === 'asc' ? 1 : -1
  const sorted = [...ROWS].sort((a, b) =>
    sort.field === 'name'
      ? a.name.localeCompare(b.name) * dir
      : (a[sort.field] - b[sort.field]) * dir
  )
  return (
    <PriorityColumnsTable<Row, F>
      label="Test rankings"
      rows={sorted}
      rowKey={r => r.id}
      identityHeader="District"
      renderIdentity={r => r.name}
      identitySortField="name"
      metrics={METRICS}
      defaultMetricIds={['clubs', 'payments']}
      sort={sort}
      onSort={toggleSort}
      fullTableTitle="All test columns"
      fullTable={
        <div data-testid="full-table">
          <table aria-label="full">
            <tbody>
              <tr>
                <td>full</td>
              </tr>
            </tbody>
          </table>
        </div>
      }
    />
  )
}

const renderAt = (search = '') =>
  render(
    <MemoryRouter initialEntries={[`/x${search}`]}>
      <Harness />
      <Where />
    </MemoryRouter>
  )

const table = () => screen.getByRole('table', { name: 'Test rankings' })
const headers = () =>
  within(table())
    .getAllByRole('columnheader')
    .map(th => th.textContent?.trim())
const firstColumn = () =>
  within(table())
    .getAllByRole('row')
    .slice(1)
    .map(r => within(r).getAllByRole('cell')[0]?.textContent)

describe('PriorityColumnsTable (#1834)', () => {
  it('renders identity + the 2 default metrics below 768, not the full table', () => {
    renderAt()
    expect(headers()).toEqual(['District', 'Clubs', 'Payments'])
    expect(within(table()).getAllByRole('row')).toHaveLength(4)
    expect(screen.queryByTestId('full-table')).toBeNull()
  })

  it('renders the caller full table unchanged at ≥768 (no chips, no priority table)', () => {
    mobile = false
    renderAt()
    expect(screen.getByTestId('full-table')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Test rankings' })).toBeNull()
    expect(screen.queryByRole('group', { name: /columns/i })).toBeNull()
  })

  it('offers every metric as a pressed/unpressed chip in a labelled group', () => {
    renderAt()
    const group = screen.getByRole('group', { name: /columns/i })
    const chips = within(group).getAllByRole('button')
    expect(chips.map(c => c.textContent)).toEqual(['Clubs', 'Payments', 'Tier'])
    expect(chips.map(c => c.getAttribute('aria-pressed'))).toEqual([
      'true',
      'true',
      'false',
    ])
  })

  it('choosing a chip shows it as the newest column, drops the oldest, and writes ?cols=', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Tier' }))
    expect(headers()).toEqual(['District', 'Payments', 'Tier'])
    expect(screen.getByTestId('where').textContent).toBe(
      '?cols=payments%2Ctier'
    )
  })

  it('tapping an already-shown chip is a no-op', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Clubs' }))
    expect(headers()).toEqual(['District', 'Clubs', 'Payments'])
    expect(screen.getByTestId('where').textContent).toBe('')
  })

  it('reads the chosen metrics from ?cols= (deep link) and ignores unknown ids', () => {
    renderAt('?cols=tier,bogus')
    expect(headers()).toEqual(['District', 'Tier', 'Clubs'])
  })

  it('returning to the defaults removes ?cols= from the URL', () => {
    renderAt('?cols=payments,tier')
    fireEvent.click(screen.getByRole('button', { name: 'Clubs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }))
    expect(headers()).toEqual(['District', 'Clubs', 'Payments'])
    expect(screen.getByTestId('where').textContent).toBe('')
  })

  it('sorts through the shared SortableHeader (aria-sort, URL sort param)', () => {
    renderAt()
    expect(firstColumn()).toEqual(['Alpha', 'Bravo', 'Charlie'])
    fireEvent.click(screen.getByRole('button', { name: /Sort by Clubs/ }))
    expect(firstColumn()).toEqual(['Alpha', 'Charlie', 'Bravo'])
    const clubsTh = within(table()).getAllByRole('columnheader')[1]!
    expect(clubsTh.getAttribute('aria-sort')).toBe('ascending')
    expect(screen.getByTestId('where').textContent).toContain('sort=clubs')
  })

  it('a metric without a sortField gets a plain (non-button) header', () => {
    renderAt('?cols=tier,clubs')
    const tierTh = within(table()).getAllByRole('columnheader')[1]!
    expect(within(tierTh).queryByRole('button')).toBeNull()
  })

  it('keeps the sort and the chosen columns together in the URL', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Tier' }))
    fireEvent.click(screen.getByRole('button', { name: /Sort by Payments/ }))
    const search = screen.getByTestId('where').textContent ?? ''
    expect(search).toContain('cols=payments%2Ctier')
    expect(search).toContain('sort=payments')
  })

  it('"Full table" opens a full-screen sheet with the complete table in a focusable labelled region', () => {
    renderAt()
    const open = screen.getByRole('button', { name: /full table/i })
    expect(open).toHaveAttribute('aria-haspopup', 'dialog')
    fireEvent.click(open)
    const dialog = screen.getByRole('dialog', { name: 'All test columns' })
    expect(dialog.className).toContain('bottom-sheet--full')
    const region = within(dialog).getByRole('region')
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region).toHaveAttribute('aria-label')
    expect(within(region).getByTestId('full-table')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = renderAt()
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('PriorityColumnsTable row groups (#1834)', () => {
  it('renders a full-width colgroup heading row each time the group changes', () => {
    render(
      <MemoryRouter>
        <PriorityColumnsTable<Row, F>
          label="Grouped"
          rows={ROWS}
          rowKey={r => r.id}
          identityHeader="Metric"
          renderIdentity={r => r.name}
          identityWraps
          groupOf={r =>
            r.id === '3'
              ? { key: 'b', title: 'Group B' }
              : { key: 'a', title: 'Group A' }
          }
          metrics={METRICS}
          defaultMetricIds={['clubs', 'payments']}
          fullTableTitle="All"
          fullTable={<table aria-label="full" />}
        />
      </MemoryRouter>
    )
    const t = screen.getByRole('table', { name: 'Grouped' })
    const groupHeads = within(t)
      .getAllByRole('columnheader')
      .filter(th => th.getAttribute('scope') === 'colgroup')
    expect(groupHeads.map(th => th.textContent)).toEqual(['Group A', 'Group B'])
    groupHeads.forEach(th => expect(th).toHaveAttribute('colspan', '3'))
    const identity = within(t).getByText('Alpha').closest('td')!
    expect(identity.className).toContain('priority-columns__identity--wrap')
  })
})
