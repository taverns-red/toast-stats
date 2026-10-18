/**
 * RegionSubnav (#1815) — the routed Rankings / Health & compliance nav for
 * `/regions` and `/region/:n` (ADR-005: real routes, no tabs). Carries the
 * page's `?py=` / `?date=` so switching subpage keeps the selected year.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RegionSubnav } from '../RegionSubnav'

const phone = vi.hoisted(() => ({ value: false }))
vi.mock('../../../hooks/useMediaQuery', () => ({
  useMediaQuery: () => phone.value,
}))

afterEach(() => {
  cleanup()
  phone.value = false
})

describe('RegionSubnav', () => {
  it('links the two subpages, keeping py and date and dropping the rest', () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/region/07/health?py=2025-2026&date=2026-06-30&cols=a,b',
        ]}
      >
        <RegionSubnav base="/region/07" label="Region 07 sections" />
      </MemoryRouter>
    )
    const nav = screen.getByRole('navigation', { name: 'Region 07 sections' })
    const rankings = screen.getByRole('link', { name: 'Rankings' })
    const health = screen.getByRole('link', { name: 'Health & compliance' })
    expect(nav).toContainElement(rankings)
    expect(rankings).toHaveAttribute(
      'href',
      '/region/07?py=2025-2026&date=2026-06-30'
    )
    expect(health).toHaveAttribute(
      'href',
      '/region/07/health?py=2025-2026&date=2026-06-30'
    )
    expect(health).toHaveAttribute('aria-current', 'page')
    expect(rankings).not.toHaveAttribute('aria-current')
  })

  it('links a region’s club map (#1808), keeping py and date', () => {
    render(
      <MemoryRouter initialEntries={['/region/07/map?py=2025-2026&q=x']}>
        <RegionSubnav base="/region/07" label="Region 07 sections" />
      </MemoryRouter>
    )
    const map = screen.getByRole('link', { name: 'Club map' })
    expect(map).toHaveAttribute('href', '/region/07/map?py=2025-2026')
    expect(map).toHaveAttribute('aria-current', 'page')
  })

  it('has no club map on the all-regions subnav (the world explorer is #1809)', () => {
    render(
      <MemoryRouter initialEntries={['/regions']}>
        <RegionSubnav base="/regions" label="Regions sections" />
      </MemoryRouter>
    )
    expect(screen.queryByRole('link', { name: 'Club map' })).toBeNull()
  })

  it('is the bottom section bar on an upright phone, so content starts under the context bar', () => {
    phone.value = true
    render(
      <MemoryRouter initialEntries={['/region/07?py=2025-2026']}>
        <RegionSubnav base="/region/07" label="Region 07 sections" />
      </MemoryRouter>
    )
    const nav = screen.getByRole('navigation', { name: 'Region 07 sections' })
    expect(nav).toHaveClass('section-bar')
    expect(screen.getByRole('link', { name: 'Rankings' })).toHaveAttribute(
      'href',
      '/region/07?py=2025-2026'
    )
    expect(screen.queryByRole('button', { name: /^More/ })).toBeNull()
  })
})
