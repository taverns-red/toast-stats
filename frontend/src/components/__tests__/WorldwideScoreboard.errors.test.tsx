/**
 * A failed worldwide-series or clubs-by-country load shows the shared error
 * panel with Try again, inside the reserved slot.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { WorldwideScoreboard } from '../WorldwideScoreboard'
import {
  globalHistoryFixture,
  globalTotalsFixture,
} from '../../__tests__/fixtures/globalHistory'

const renderBoard = (
  props: Partial<React.ComponentProps<typeof WorldwideScoreboard>>
) =>
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
        {...props}
      />
    </MemoryRouter>
  )

describe('WorldwideScoreboard error states', () => {
  it('shows the shared panel with Try again when the series fails', async () => {
    const onRetryHistory = vi.fn()
    renderBoard({ history: null, historyError: true, onRetryHistory })
    const slot = screen.getByTestId('worldwide-scoreboard-error')
    expect(within(slot).getByRole('alert')).toHaveTextContent(
      /couldn't load the worldwide series/i
    )
    await userEvent.click(
      within(slot).getByRole('button', { name: /try again/i })
    )
    expect(onRetryHistory).toHaveBeenCalledTimes(1)
  })

  it('shows the shared panel with Try again when clubs by country fails', async () => {
    const onRetryCountry = vi.fn()
    renderBoard({
      clubsByCountry: null,
      clubsCounted: null,
      countryError: true,
      onRetryCountry,
    })
    const slot = screen.getByTestId('wws-country-error')
    expect(within(slot).getByRole('alert')).toHaveTextContent(
      /couldn't load clubs by country/i
    )
    await userEvent.click(
      within(slot).getByRole('button', { name: /try again/i })
    )
    expect(onRetryCountry).toHaveBeenCalledTimes(1)
  })
})
