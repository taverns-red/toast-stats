/**
 * #2174 — online-only clubs have no pin (Ron, 2026-10-19: no proxy point).
 * An "N online clubs" chip near the legend says how many and opens their
 * list, so every club in scope stays reachable from the map page.
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OnlineClubsChip from '../OnlineClubsChip'

const CLUBS = [
  { clubId: '20', clubName: 'Zeta Online' },
  { clubId: '10', clubName: 'Alpha Online' },
]

const renderChip = (clubs = CLUBS) =>
  render(
    <MemoryRouter>
      <OnlineClubsChip clubs={clubs} districtId="61" />
    </MemoryRouter>
  )

describe('OnlineClubsChip', () => {
  it('counts the online clubs and opens their list, sorted by name', () => {
    renderChip()
    const chip = screen.getByRole('button', { name: '2 online clubs' })
    expect(chip).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list')).toBeNull()
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-expanded', 'true')
    const links = screen.getAllByRole('link')
    expect(links.map(l => l.textContent)).toEqual([
      'Alpha Online',
      'Zeta Online',
    ])
    expect(links[0]).toHaveAttribute('href', '/district/61/club/10')
  })

  it('says "1 online club" in the singular', () => {
    renderChip([CLUBS[0]!])
    expect(
      screen.getByRole('button', { name: '1 online club' })
    ).toBeInTheDocument()
  })

  it('renders nothing when no club in scope meets online', () => {
    const { container } = renderChip([])
    expect(container).toBeEmptyDOMElement()
  })

  it('links a club elsewhere through its own district when given one', () => {
    render(
      <MemoryRouter>
        <OnlineClubsChip
          clubs={[{ clubId: '7', clubName: 'Far Online', districtId: '80' }]}
        />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: '1 online club' }))
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/district/80/club/7'
    )
  })
})
