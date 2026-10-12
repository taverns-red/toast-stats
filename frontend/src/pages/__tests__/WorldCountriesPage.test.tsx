/**
 * `/history/countries` — the worldwide country choropleth (#1797, epic #1781).
 *
 * A routed subpage of `/history` (ADR-005; #1426 ruled the worldwide view
 * extends `/history`). The selected country lives in `?country=<ISO numeric>`
 * so the back button and a shared link restore it. The Unknown residual is
 * stated in the page summary, not only in the table.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import WorldCountriesPage from '../WorldCountriesPage'
import fixture from '../../components/worldmap/__tests__/fixtures/clubsByCountry-2026-10-11.json'

const state = {
  clubsByCountry: fixture.clubsByCountry,
  clubsCounted: fixture.clubsCounted,
  snapshotDate: fixture.date,
  isLoading: false,
  isError: false,
}

vi.mock('../../hooks/useGlobalHistory', () => ({
  useGlobalClubsByCountry: () => state,
}))

vi.mock('../../contexts/DarkModeContext', () => ({
  useDarkMode: () => ({ isDark: false }),
}))

let isPhone = false
vi.mock('../../hooks/useMediaQuery', () => ({
  useMediaQuery: () => isPhone,
}))

function LocationProbe() {
  const loc = useLocation()
  return <output data-testid="location">{loc.pathname + loc.search}</output>
}

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/history/countries"
          element={
            <>
              <WorldCountriesPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  )

beforeEach(() => {
  isPhone = false
  state.isLoading = false
  state.isError = false
  state.clubsByCountry = fixture.clubsByCountry
})

describe('/history/countries (#1797)', () => {
  it('has a heading, a way back to History and the snapshot date', () => {
    renderAt('/history/countries')
    expect(
      screen.getByRole('heading', { level: 1, name: /clubs by country/i })
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /history/i })).toHaveAttribute(
      'href',
      '/history'
    )
    expect(screen.getByTestId('wm-summary')).toHaveTextContent('2026-10-11')
  })

  it('states the Unknown clubs that are not on the map', () => {
    renderAt('/history/countries')
    expect(screen.getByTestId('wm-summary')).toHaveTextContent(
      /158 countries.*342 clubs \(2\.4%\).*not matched to a country/i
    )
  })

  it('draws the map once the geometry has loaded', async () => {
    renderAt('/history/countries')
    await waitFor(() =>
      expect(document.querySelector('[data-iso="840"]')).not.toBeNull()
    )
  })

  it('restores the selected country from the URL', async () => {
    renderAt('/history/countries?country=356')
    await waitFor(() =>
      expect(screen.getByTestId('wm-readout')).toHaveTextContent('India')
    )
  })

  it('writes a selection from the table to the URL', async () => {
    renderAt('/history/countries')
    fireEvent.click(
      await screen.findByRole('button', { name: /show canada on the map/i })
    )
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/history/countries?country=124'
    )
  })

  it('on a phone shows the top ten and the full list in a sheet', async () => {
    isPhone = true
    renderAt('/history/countries')
    const inline = screen.getByRole('table')
    // ten countries + Unknown, under the header row
    expect(within(inline).getAllByRole('row')).toHaveLength(12)
    fireEvent.click(screen.getByRole('button', { name: /all 158 countries/i }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getAllByRole('row')).toHaveLength(160)
  })

  it('reserves the map slot while loading and says so on error', () => {
    state.isLoading = true
    const { unmount } = renderAt('/history/countries')
    expect(screen.getByTestId('wm-skeleton')).toBeInTheDocument()
    unmount()
    state.isLoading = false
    state.isError = true
    renderAt('/history/countries')
    expect(screen.getByRole('status')).toHaveTextContent(/isn’t available/i)
  })
})
