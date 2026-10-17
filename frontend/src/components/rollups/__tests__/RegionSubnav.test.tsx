/**
 * RegionSubnav (#1815) — the routed Rankings / Health & compliance nav for
 * `/regions` and `/region/:n` (ADR-005: real routes, no tabs). Carries the
 * page's `?py=` / `?date=` so switching subpage keeps the selected year.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RegionSubnav } from '../RegionSubnav'

afterEach(cleanup)

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
})
