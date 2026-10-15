/**
 * GrowthSurvivalLink (#1817) — the Club Growth page's way into charter
 * cohort survival (`/district/:id/growth/survival`), keeping the page's
 * program year and date in the URL (R3: the target reads them from there).
 */
import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GrowthSurvivalLink } from '../GrowthSurvivalLink'

afterEach(cleanup)

describe('GrowthSurvivalLink', () => {
  it('links to the survival subpage with the PY and date kept', () => {
    render(
      <MemoryRouter
        initialEntries={['/district/61/growth?py=2025&date=2026-06-30&x=1']}
      >
        <GrowthSurvivalLink districtId="61" />
      </MemoryRouter>
    )
    const link = screen.getByRole('link', {
      name: /club survival by charter year/i,
    })
    expect(link.getAttribute('href')).toBe(
      '/district/61/growth/survival?py=2025&date=2026-06-30'
    )
  })

  it('links without a query when the page has none', () => {
    render(
      <MemoryRouter initialEntries={['/district/61/growth']}>
        <GrowthSurvivalLink districtId="61" />
      </MemoryRouter>
    )
    expect(
      screen.getByRole('link', { name: /club survival/i }).getAttribute('href')
    ).toBe('/district/61/growth/survival')
  })
})
