/**
 * CharterSurvivalView at region and world scope (#1818) — the same
 * component as the district page (#1817), with the copy and the
 * moved-away column fitted to the scope. Models: the pipeline fold's
 * Region 09 and world files over the recorded prod histories.
 */
import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { render, screen, within, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  CharterCohortSurvivalRollupFileSchema,
  charterCohortSurvivalFromRollupFile,
} from '@taverns-red/shared-contracts'
import r09File from '../../__tests__/fixtures/charter-cohort-survival-region-09.json'
import worldFile from '../../__tests__/fixtures/charter-cohort-survival-world.json'
import { CharterSurvivalView } from '../CharterSurvivalView'

const r09 = charterCohortSurvivalFromRollupFile(
  CharterCohortSurvivalRollupFileSchema.parse(r09File),
  '2026-2027'
)
const world = charterCohortSurvivalFromRollupFile(
  CharterCohortSurvivalRollupFileSchema.parse(worldFile),
  '2026-2027'
)

afterEach(cleanup)

const table = () =>
  screen.getByRole('table', { name: /survival by charter year/i })

describe('CharterSurvivalView — region scope (#1818)', () => {
  it("says the cohorts are the region's, by each year's own membership", () => {
    render(
      <MemoryRouter initialEntries={['/region/09/growth/survival']}>
        <CharterSurvivalView
          survival={r09}
          scope={{ kind: 'region', regionId: '09' }}
        />
      </MemoryRouter>
    )
    expect(
      screen.getByText(/chartered in Region 09 in each program year/i)
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(/now in another region/i).length
    ).toBeGreaterThan(0)
    expect(
      within(table()).getByRole('columnheader', { name: /other region/i })
    ).toBeInTheDocument()
    expect(screen.queryByText(/district/i)).not.toBeInTheDocument()
  })

  it('counts a cohort from the region file, never 0 for a year not reached', () => {
    render(
      <MemoryRouter>
        <CharterSurvivalView
          survival={r09}
          scope={{ kind: 'region', regionId: '09' }}
        />
      </MemoryRouter>
    )
    const row = within(table()).getByRole('row', { name: /^2019-20/ })
    expect(row).toHaveTextContent('14')
    const latest = within(table()).getByRole('row', { name: /^2023-24/ })
    expect(within(latest).getAllByText('not reached').length).toBeGreaterThan(0)
  })
})

describe('CharterSurvivalView — world scope (#1818)', () => {
  it('speaks of clubs worldwide and drops the moved-away column', () => {
    render(
      <MemoryRouter initialEntries={['/regions/growth/survival']}>
        <CharterSurvivalView survival={world} scope={{ kind: 'world' }} />
      </MemoryRouter>
    )
    expect(
      screen.getByText(/chartered worldwide in each program year/i)
    ).toBeInTheDocument()
    expect(
      within(table()).queryByRole('columnheader', { name: /moved|other/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/district/i)).not.toBeInTheDocument()
  })
})
