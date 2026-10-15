/**
 * CharterSurvivalView (#1817) — the district's charter cohort survival:
 * headline 1/3/5-year rates, a chart (pooled line + one highlighted cohort,
 * the cohort chosen by `?cohort=` links, no tabs) and the data table that is
 * its accessible alternative. Model built from the recorded prod history
 * fixture (D61 / D01, 2026-10-15).
 */
import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { render, screen, within, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  ClubDistrictHistoryIndexSchema,
  ClubDistrictHistoryShardSchema,
  type ClubDistrictHistoryClub,
} from '@taverns-red/shared-contracts'
import recorded from '../../__tests__/fixtures/club-district-history-d61-d01.recorded.json'
import { buildCharterCohortSurvival } from '../../utils/charterCohortSurvival'
import { CharterSurvivalView } from '../CharterSurvivalView'

const index = ClubDistrictHistoryIndexSchema.parse(recorded.index)
const clubs: Record<string, ClubDistrictHistoryClub> = {}
for (const raw of Object.values(recorded.shards)) {
  Object.assign(clubs, ClubDistrictHistoryShardSchema.parse(raw).clubs)
}
const build = (districtId: string, throughProgramYear = '2026-2027') =>
  buildCharterCohortSurvival({ index, clubs, districtId, throughProgramYear })

function renderAt(url: string, districtId = '61', through?: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <CharterSurvivalView survival={build(districtId, through)} />
    </MemoryRouter>
  )
}

afterEach(cleanup)

describe('CharterSurvivalView', () => {
  it('headlines pooled 1-, 3- and 5-year survival with the club counts', () => {
    renderAt('/district/61/survival')
    const kpis = screen.getByRole('list', { name: /survival after/i })
    const items = within(kpis).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent(/1 year/i)
    expect(items[0]).toHaveTextContent('100%')
    expect(items[0]).toHaveTextContent('51 of 51 clubs')
  })

  it('gives every cohort a table row with counts, moved-away clubs and each year', () => {
    renderAt('/district/01/survival', '01')
    const table = screen.getByRole('table', {
      name: /survival by charter year/i,
    })
    const row = within(table).getByRole('row', { name: /2017-18/ })
    expect(row).toHaveTextContent('11')
    // Year 9 (2026-27): 3 of 11 survive, all three now in another district.
    expect(row).toHaveTextContent('3 of 11')
    expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('3')
  })

  it('prints an unreached year as not reached, never 0%', () => {
    renderAt('/district/61/survival')
    const row = screen.getByRole('row', { name: /2025-26/ })
    expect(row).toHaveTextContent(/not reached/i)
    expect(row).not.toHaveTextContent(/\b0%/)
  })

  it('marks the in-progress program year as so far', () => {
    renderAt('/district/61/survival')
    const row = screen.getByRole('row', { name: /2025-26/ })
    expect(row).toHaveTextContent(/so far/i)
  })

  it('lists a program year with no charters as none chartered', () => {
    renderAt('/district/61/survival')
    const row = screen.getByRole('row', { name: /2021-22/ })
    expect(row).toHaveTextContent(/none chartered/i)
  })

  it('explains the left-censored first program year and moved clubs', () => {
    renderAt('/district/61/survival')
    expect(screen.getByText(/2016-17 are left out/i)).toBeInTheDocument()
    expect(
      screen.getAllByText(/moved to another district count as active/i).length
    ).toBeGreaterThan(0)
  })

  it('highlights a cohort through ?cohort= links that keep the other params', () => {
    renderAt('/district/61/survival?py=2026-2027&cohort=2019-2020')
    const nav = screen.getByRole('navigation', { name: /highlight a cohort/i })
    const current = within(nav).getByRole('link', { current: true })
    expect(current).toHaveTextContent('2019-20')
    const all = within(nav).getByRole('link', { name: /all cohorts/i })
    expect(all.getAttribute('href')).toBe('/district/61/survival?py=2026-2027')
    const other = within(nav).getByRole('link', { name: /2017-18/ })
    expect(other.getAttribute('href')).toBe(
      '/district/61/survival?py=2026-2027&cohort=2017-2018'
    )
    // No link for a PY that chartered nothing.
    expect(within(nav).queryByRole('link', { name: /2021-22/ })).toBeNull()
    expect(screen.getByTestId('survival-legend')).toHaveTextContent(
      '2019-20 (14 clubs)'
    )
  })

  it('describes the chart for screen readers', () => {
    renderAt('/district/61/survival?cohort=2019-2020')
    const img = screen.getByRole('img', { name: /survival/i })
    expect(img.getAttribute('aria-label')).toMatch(/all cohorts/i)
    expect(img.getAttribute('aria-label')).toMatch(/2019-20/)
  })

  it('shows an empty state when the district chartered no clubs in range', () => {
    renderAt('/district/999/survival', '999')
    expect(
      screen.getByText(/no clubs were chartered in this district/i)
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
