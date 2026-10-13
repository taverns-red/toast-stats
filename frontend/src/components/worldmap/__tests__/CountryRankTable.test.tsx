/**
 * The ranked country table beside or below the choropleth (#1797): the
 * screen-reader and keyboard path to every value the map colours.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { CountryRankTable } from '../CountryRankTable'
import { buildChoroplethView } from '../countryChoroplethView'

const view = buildChoroplethView(
  [
    { country: 'United States', clubs: 5662 },
    { country: 'India', clubs: 1096 },
    { country: 'Canada', clubs: 922 },
    { country: 'Atlantis', clubs: 2 },
  ],
  342,
  8024,
  id => (id === '840' || id === '356' || id === '124' ? 'polygon' : undefined)
)

describe('CountryRankTable', () => {
  it('is a captioned table with rank, country, clubs and share', () => {
    render(
      <CountryRankTable view={view} selectedId={null} onSelect={vi.fn()} />
    )
    const table = screen.getByRole('table')
    expect(table).toHaveAccessibleName(/clubs by country/i)
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(h => h.textContent)
    expect(headers).toEqual(['#', 'Country', 'Clubs', 'Share'])
    const first = within(table).getAllByRole('row')[1]!
    expect(first).toHaveTextContent('1United States5,66270.6%')
  })

  it('ends with the Unknown row, stated against the same whole', () => {
    render(
      <CountryRankTable view={view} selectedId={null} onSelect={vi.fn()} />
    )
    const unknown = screen.getByTestId('wm-row-unknown')
    expect(unknown).toHaveTextContent('Unknown')
    expect(unknown).toHaveTextContent('342')
    expect(unknown).toHaveTextContent('4.3%')
  })

  it('selects a country with a button that reports its state', () => {
    const onSelect = vi.fn()
    render(
      <CountryRankTable view={view} selectedId="356" onSelect={onSelect} />
    )
    const india = screen.getByRole('button', { name: /show india on the map/i })
    expect(india).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /show canada/i }))
    expect(onSelect).toHaveBeenCalledWith('124')
  })

  it('flags a country the map cannot place instead of offering a button', () => {
    render(
      <CountryRankTable view={view} selectedId={null} onSelect={vi.fn()} />
    )
    expect(
      screen.queryByRole('button', { name: /atlantis/i })
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Atlantis/)).toBeInTheDocument()
    expect(screen.getByText(/not on map/i)).toBeInTheDocument()
  })

  it('prints every share with one decimal so the column aligns', () => {
    const even = buildChoroplethView(
      [{ country: 'India', clubs: 40 }],
      10,
      50,
      () => 'polygon'
    )
    render(
      <CountryRankTable view={even} selectedId={null} onSelect={vi.fn()} />
    )
    expect(screen.getByTestId('wm-row-356')).toHaveTextContent('80.0%')
    expect(screen.getByTestId('wm-row-unknown')).toHaveTextContent('20.0%')
  })

  it('can show only the top rows, still closing with Unknown', () => {
    render(
      <CountryRankTable
        view={view}
        selectedId={null}
        onSelect={vi.fn()}
        limit={2}
      />
    )
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map(r => r.getAttribute('data-testid'))).toEqual([
      'wm-row-840',
      'wm-row-356',
      'wm-row-unknown',
    ])
  })
})
