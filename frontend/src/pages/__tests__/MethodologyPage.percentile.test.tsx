/* /methodology — KPI percentile glossary (#2581, #2613).
   The glossary must say higher is better and name the ranked measures. The
   formula itself is asserted in analytics-core's MetricRankingsCalculator
   tests, not here. */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MethodologyPage from '../MethodologyPage'

describe('MethodologyPage — KPI percentile (#2581)', () => {
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
