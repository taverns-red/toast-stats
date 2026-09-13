import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ClubsSubnav } from '../ClubsSubnav'

/**
 * #1556 — the `/clubs` lateral section nav mirrors `DistrictSubnav`
 * (ADR-005 §3): a `nav` landmark with its own label, every item a REAL
 * route, `aria-current="page"` on the active one only.
 */
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ClubsSubnav />
    </MemoryRouter>
  )

describe('ClubsSubnav (#1556)', () => {
  it('is a labelled nav landmark listing Overview and the four tier races', () => {
    renderAt('/clubs')
    const nav = screen.getByRole('navigation', {
      name: 'Clubs worldwide sections',
    })
    const links = within(nav).getAllByRole('link')
    expect(links.map(l => l.textContent)).toEqual([
      'Overview',
      'Distinguished',
      'Select',
      "President's",
      'Smedley',
    ])
    expect(links.map(l => l.getAttribute('href'))).toEqual([
      '/clubs',
      '/clubs/race/distinguished',
      '/clubs/race/select',
      '/clubs/race/presidents',
      '/clubs/race/smedley',
    ])
  })

  it('marks only the active route with aria-current', () => {
    renderAt('/clubs/race/select')
    const nav = screen.getByRole('navigation', {
      name: 'Clubs worldwide sections',
    })
    const current = within(nav)
      .getAllByRole('link')
      .filter(l => l.getAttribute('aria-current') === 'page')
    expect(current.map(l => l.textContent)).toEqual(['Select'])
  })

  it('Overview is active only at the exact hub URL', () => {
    renderAt('/clubs/race/smedley')
    const overview = screen.getByRole('link', { name: 'Overview' })
    expect(overview.getAttribute('aria-current')).toBeNull()
  })
})
