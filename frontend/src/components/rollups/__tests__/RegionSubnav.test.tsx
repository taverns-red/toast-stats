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

  it('links the world club explorer from the all-regions subnav (#1809)', () => {
    render(
      <MemoryRouter initialEntries={['/regions/map?date=2026-10-16&region=05']}>
        <RegionSubnav base="/regions" label="Regions sections" />
      </MemoryRouter>
    )
    const map = screen.getByRole('link', { name: 'Club map' })
    expect(map).toHaveAttribute('href', '/regions/map?date=2026-10-16')
    expect(map).toHaveAttribute('aria-current', 'page')
  })

  it('links the world education page (#1811) from the all-regions subnav', () => {
    render(
      <MemoryRouter
        initialEntries={['/regions/education?py=2025-2026&by=path']}
      >
        <RegionSubnav base="/regions" label="Regions sections" />
      </MemoryRouter>
    )
    const education = screen.getByRole('link', { name: 'Education' })
    expect(education).toHaveAttribute('href', '/regions/education?py=2025-2026')
    expect(education).toHaveAttribute('aria-current', 'page')
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

  it('links a region’s Education subpage (#1810), keeping py and date', () => {
    render(
      <MemoryRouter initialEntries={['/region/07/education?py=2025-2026']}>
        <RegionSubnav base="/region/07" label="Region 07 sections" />
      </MemoryRouter>
    )
    const education = screen.getByRole('link', { name: 'Education' })
    expect(education).toHaveAttribute(
      'href',
      '/region/07/education?py=2025-2026'
    )
    expect(education).toHaveAttribute('aria-current', 'page')
  })

  it('links Club growth (#1812, #1813), current only on the funnel itself', () => {
    render(
      <MemoryRouter initialEntries={['/region/07/growth?py=2025-2026']}>
        <RegionSubnav base="/region/07" label="Region 07 sections" />
      </MemoryRouter>
    )
    const growth = screen.getByRole('link', { name: 'Club growth' })
    expect(growth).toHaveAttribute('href', '/region/07/growth?py=2025-2026')
    expect(growth).toHaveAttribute('aria-current', 'page')
  })

  it('carries Club growth into the phone section bar', () => {
    phone.value = true
    render(
      <MemoryRouter initialEntries={['/regions/growth']}>
        <RegionSubnav base="/regions" label="Regions sections" />
      </MemoryRouter>
    )
    expect(screen.getByRole('link', { name: 'Club growth' })).toHaveAttribute(
      'href',
      '/regions/growth'
    )
  })
})
