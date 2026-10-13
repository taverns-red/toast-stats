/**
 * The `/history` country table links to the full country map (#1797).
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { WorldwideScoreboard } from '../WorldwideScoreboard'
import {
  globalHistoryFixture,
  globalTotalsFixture,
} from '../../__tests__/fixtures/globalHistory'

describe('WorldwideScoreboard → country map link', () => {
  it('links the Clubs by country table to /history/countries', () => {
    render(
      <MemoryRouter>
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
      </MemoryRouter>
    )
    expect(
      screen.getByRole('link', { name: /map of all 9 countries/i })
    ).toHaveAttribute('href', '/history/countries')
  })
})
