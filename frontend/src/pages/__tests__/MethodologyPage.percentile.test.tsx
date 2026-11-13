/* /methodology — KPI percentile meaning (#2581).
   worldPercentile = (districts - rank) / districts * 100 in analytics-core,
   so higher is better. The glossary must say so. */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MetricRankingsCalculator } from '@taverns-red/analytics-core'
import MethodologyPage from '../MethodologyPage'

describe('MethodologyPage — KPI percentile (#2581)', () => {
  it('the calculator makes rank 1 the highest percentile', () => {
    const calc = new MetricRankingsCalculator()
    expect(calc.calculateWorldPercentile(1, 100)).toBe(99)
    expect(calc.calculateWorldPercentile(100, 100)).toBe(0)
  })

  it('glossary says a higher percentile is better', () => {
    render(
      <MemoryRouter>
        <MethodologyPage />
      </MemoryRouter>
    )
    const term = screen.getByText('Percentile (KPI cards)', { selector: 'dt' })
    const definition = term.nextElementSibling?.textContent ?? ''
    expect(definition).toMatch(/higher is better/i)
    expect(definition).toMatch(/outperforms/i)
  })

  // #2613: the rank behind each card is by a different measure than the
  // figure the card prints, and a fully tied category is not a lead.
  it('glossary names the measure each KPI card is ranked by', () => {
    render(
      <MemoryRouter>
        <MethodologyPage />
      </MemoryRouter>
    )
    const term = screen.getByText('Percentile (KPI cards)', { selector: 'dt' })
    const definition = term.nextElementSibling?.textContent ?? ''
    expect(definition).toMatch(/Paid Clubs[^.]*club growth %/i)
    expect(definition).toMatch(/Membership Payments[^.]*payments growth %/i)
    expect(definition).toMatch(/Distinguished Clubs[^.]*distinguished %/i)
  })

  it('glossary says a fully tied category shows Tied', () => {
    render(
      <MemoryRouter>
        <MethodologyPage />
      </MemoryRouter>
    )
    const term = screen.getByText('Percentile (KPI cards)', { selector: 'dt' })
    const definition = term.nextElementSibling?.textContent ?? ''
    expect(definition).toMatch(/\bTied\b/)
  })
})
