/**
 * Worldwide scoreboard below 768 (#1834, mobile epic #1827).
 *
 * The /history worldwide table was 1,451px in a 325px scroller at 375 (78 %
 * hidden). Its rows are metrics and its columns are program years, so below
 * 768 the priority columns are YEARS: metric + 2 chosen years (?cols=,
 * newest two by default), with the group headings kept as full-width rows
 * and the complete table in the full-screen sheet. ≥768 is unchanged.
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
import { WorldwideScoreboard } from '../WorldwideScoreboard'
import { buildScoreboardModel } from '../../utils/globalHistoryView'
import {
  globalHistoryFixture,
  globalTotalsFixture,
} from '../../__tests__/fixtures/globalHistory'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => true }))

afterEach(() => cleanup())

const model = buildScoreboardModel(globalHistoryFixture)
const [y0, y1, y2] = model.years

const Where = () => <output data-testid="where">{useLocation().search}</output>

const renderAt = (url = '/history') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <WorldwideScoreboard
        history={globalHistoryFixture}
        historyLoading={false}
        historyError={false}
        clubsByCountry={globalTotalsFixture.clubsByCountry}
        clubsCounted={globalTotalsFixture.membership.clubsCounted}
        countrySnapshotDate={globalTotalsFixture.date}
        countryLoading={false}
        countryError={false}
      />
      <Where />
    </MemoryRouter>
  )

const table = () =>
  screen.getByRole('table', { name: 'Worldwide scoreboard by program year' })
// Column headers only — group headings are colgroup headers in the body.
const colHeads = (t: HTMLElement) => [...t.querySelectorAll('thead th')]
const headers = () => colHeads(table()).map(th => th.textContent?.trim())

describe('WorldwideScoreboard priority columns below 768 (#1834)', () => {
  it('fixture has at least three years to choose between', () => {
    expect(y2).toBeDefined()
  })

  it('shows metric + the two newest years, no horizontal scroll region', () => {
    renderAt()
    expect(headers()).toEqual(['Metric', y0!.label, y1!.label])
    expect(
      screen.queryByRole('region', {
        name: 'Worldwide scoreboard by program year',
      })
    ).toBeNull()
  })

  it('keeps every group heading as a full-width row', () => {
    renderAt()
    const groupHeads = [
      ...table().querySelectorAll('tbody th[scope="colgroup"]'),
    ]
    expect(groupHeads.map(th => th.textContent)).toEqual(
      model.groups.map(g => g.title)
    )
    groupHeads.forEach(th => expect(th).toHaveAttribute('colspan', '3'))
  })

  it('renders each chosen year’s cell for a metric, absent markers intact', () => {
    renderAt()
    const row = model.groups[0]!.rows[0]!
    const tr = within(table()).getByText(row.label).closest('tr')!
    const cells = within(tr).getAllByRole('cell')
    expect(cells.slice(-2).map(c => c.textContent)).toEqual([
      row.cells[0]!.text,
      row.cells[1]!.text,
    ])
  })

  it('a year chip swaps that year in and persists it as ?cols=', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: y2!.label }))
    expect(headers()).toEqual(['Metric', y1!.label, y2!.label])
    expect(screen.getByTestId('where').textContent).toBe(
      `?cols=${encodeURIComponent(`${y1!.programYear},${y2!.programYear}`)}`
    )
  })

  it('opens the complete year table in the full-screen sheet', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: /full table/i }))
    const dialog = screen.getByRole('dialog', { name: /Worldwide scoreboard/ })
    const full = within(within(dialog).getByRole('region')).getByRole('table')
    expect(colHeads(full)).toHaveLength(model.years.length + 1)
  })
})
