import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

import { KpiDeltaCard } from '../KpiDeltaCard'

/* #681 — Net Member Change KPI card. Unlike KpiBulletCard, this metric is a
   signed delta with no Distinguished tiers, so it renders a signed value with
   a directional cue (not colour alone) instead of a bullet bar. */

afterEach(() => cleanup())

describe('KpiDeltaCard (#681)', () => {
  it('renders the title', () => {
    render(<KpiDeltaCard title="Net Member Change" current={312} />)
    expect(screen.getByText('Net Member Change')).toBeInTheDocument()
  })

  it('formats a positive delta with a leading + and green colour', () => {
    render(<KpiDeltaCard title="Net Member Change" current={312} />)
    const value = screen.getByTestId('kpi-delta-value')
    expect(value).toHaveTextContent('+312')
    expect(value.className).toContain('text-green-700')
  })

  it('formats a negative delta with a minus sign and red colour', () => {
    render(<KpiDeltaCard title="Net Member Change" current={-87} />)
    const value = screen.getByTestId('kpi-delta-value')
    // Uses a typographic minus (U+2212), not a hyphen.
    expect(value).toHaveTextContent('−87')
    expect(value.className).toContain('text-red-700')
  })

  it('renders zero as a neutral value with no sign and no arrow', () => {
    render(<KpiDeltaCard title="Net Member Change" current={0} />)
    const value = screen.getByTestId('kpi-delta-value')
    expect(value).toHaveTextContent('0')
    expect(value.textContent).not.toContain('+')
    expect(value.className).not.toContain('text-green-700')
    expect(value.className).not.toContain('text-red-700')
    expect(screen.queryByTestId('kpi-delta-arrow')).not.toBeInTheDocument()
  })

  it('conveys direction without relying on colour alone (arrow + sr text)', () => {
    render(<KpiDeltaCard title="Net Member Change" current={312} />)
    expect(screen.getByTestId('kpi-delta-arrow')).toBeInTheDocument()
    // A screen-reader-only word makes the direction non-visual too.
    expect(screen.getByText(/increase/i)).toBeInTheDocument()
  })

  it('says "decrease" for a negative delta', () => {
    render(<KpiDeltaCard title="Net Member Change" current={-87} />)
    expect(screen.getByText(/decrease/i)).toBeInTheDocument()
  })

  it('formats thousands with locale separators', () => {
    render(<KpiDeltaCard title="Net Member Change" current={1234} />)
    expect(screen.getByTestId('kpi-delta-value')).toHaveTextContent('+1,234')
  })

  it('renders an optional secondary context line', () => {
    render(
      <KpiDeltaCard
        title="Net Member Change"
        current={312}
        secondaryLabel="members vs. base"
      />
    )
    expect(screen.getByText('members vs. base')).toBeInTheDocument()
  })

  it('exposes an info tooltip trigger when tooltipContent is given', () => {
    render(
      <KpiDeltaCard
        title="Net Member Change"
        current={312}
        tooltipContent="Net change in total membership since the program-year base."
      />
    )
    const card = screen.getByTestId('kpi-delta-card')
    expect(
      within(card).getByRole('button', { name: /more info/i })
    ).toBeInTheDocument()
  })

  /* #2425 — the What Changed "Active clubs" tile adds a per-status breakdown
     under the from -> to line, and must never show a silent 0 when the value
     cannot be computed. */
  it('renders optional sub-lines as a list under the secondary label', () => {
    render(
      <KpiDeltaCard
        title="Active clubs"
        current={-2}
        secondaryLabel="141 → 139"
        subLines={['Low 5 (+1)', 'Ineligible 2', 'All clubs 158 (−2)']}
      />
    )
    const list = screen.getByTestId('kpi-delta-sublines')
    const items = within(list).getAllByRole('listitem')
    expect(items.map(i => i.textContent)).toEqual([
      'Low 5 (+1)',
      'Ineligible 2',
      'All clubs 158 (−2)',
    ])
  })

  it('renders no sub-line list when subLines is absent', () => {
    render(<KpiDeltaCard title="Membership" current={3} />)
    expect(screen.queryByTestId('kpi-delta-sublines')).toBeNull()
  })

  it('renders a dash, not 0, when the value is unavailable (null)', () => {
    render(<KpiDeltaCard title="Active clubs" current={null} />)
    const value = screen.getByTestId('kpi-delta-value')
    expect(value).toHaveTextContent('—')
    expect(value).toHaveTextContent('not available')
    expect(value).not.toHaveTextContent('0')
    expect(screen.queryByTestId('kpi-delta-arrow')).toBeNull()
  })
})
