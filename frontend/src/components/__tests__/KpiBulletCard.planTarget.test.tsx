/**
 * KpiBulletCard Success Plan tick (#2297). A leader's own target, from the
 * `?targets=` link, rides the same bullet bar as TI's D/S/P/Sm thresholds.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render as rtlRender, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { KpiBulletCard } from '../KpiBulletCard'
import type { MetricRankings, RecognitionTargets } from '../../types/districts'

const targets: RecognitionTargets = {
  distinguished: 158,
  select: 161,
  presidents: 164,
  smedley: 169,
}

const rankings: MetricRankings = {
  worldRank: 30,
  worldPercentile: 77,
  regionRank: 3,
  totalDistricts: 128,
  totalInRegion: 11,
  region: '05',
}

const leftPct = (el: HTMLElement) => parseFloat(el.style.left)

// RegionRankChip renders a router Link.
const render = (ui: React.ReactElement) => {
  const r = rtlRender(<MemoryRouter>{ui}</MemoryRouter>)
  return {
    ...r,
    rerender: (next: React.ReactElement) =>
      r.rerender(<MemoryRouter>{next}</MemoryRouter>),
  }
}

afterEach(() => cleanup())

describe('KpiBulletCard plan target (#2297)', () => {
  it('draws no plan tick without a plan target', () => {
    render(
      <KpiBulletCard
        title="Paid Clubs"
        current={149}
        targets={targets}
        rankings={rankings}
      />
    )
    expect(screen.queryByTestId('plan-tick')).not.toBeInTheDocument()
    expect(screen.queryByTestId('plan-target')).not.toBeInTheDocument()
  })

  it('draws a plan tick and says how far there is to go', () => {
    render(
      <KpiBulletCard
        title="Paid Clubs"
        current={149}
        targets={targets}
        rankings={rankings}
        planTarget={165}
      />
    )
    expect(screen.getByTestId('plan-tick')).toBeInTheDocument()
    const line = screen.getByTestId('plan-target')
    expect(line).toHaveTextContent('Plan')
    expect(line).toHaveTextContent('165')
    expect(line).toHaveTextContent('16 to go')
    // The full name is announced, not just the short label.
    expect(line).toHaveTextContent('Success Plan target')
  })

  it('says the plan is met once current reaches it', () => {
    render(
      <KpiBulletCard
        title="Paid Clubs"
        current={166}
        targets={targets}
        rankings={rankings}
        planTarget={165}
      />
    )
    expect(screen.getByTestId('plan-target')).toHaveTextContent('met')
  })

  it('places the plan tick proportionally on the 0-based scale (#2387)', () => {
    // maxScale = 1.05 × 169 = 177.45; 165 / 177.45 ≈ 92.98%
    render(
      <KpiBulletCard
        title="Paid Clubs"
        current={149}
        targets={targets}
        rankings={rankings}
        planTarget={165}
      />
    )
    expect(screen.getByTestId('plan-tick')).toHaveStyle({ left: '92.98%' })
  })

  it('keeps a plan beyond Smedley on the bar', () => {
    render(
      <KpiBulletCard
        title="Paid Clubs"
        current={149}
        targets={targets}
        rankings={rankings}
        planTarget={200}
      />
    )
    const tick = screen.getByTestId('plan-tick')
    expect(leftPct(tick)).toBeLessThanOrEqual(100)
    expect(leftPct(tick)).toBeGreaterThan(
      leftPct(screen.getByTestId('tier-tick-smedley'))
    )
  })

  it('keeps a plan below the tier band on the bar', () => {
    render(
      <KpiBulletCard
        title="Paid Clubs"
        current={160}
        targets={targets}
        rankings={rankings}
        planTarget={100}
      />
    )
    expect(leftPct(screen.getByTestId('plan-tick'))).toBeGreaterThanOrEqual(0)
  })

  it('still states the plan when TI targets are unavailable', () => {
    render(
      <KpiBulletCard
        title="Paid Clubs"
        current={149}
        targets={null}
        rankings={rankings}
        planTarget={165}
      />
    )
    expect(screen.getByTestId('plan-target')).toHaveTextContent('165')
  })

  it('paints the tick in a legacy palette token', () => {
    render(
      <KpiBulletCard
        title="Paid Clubs"
        current={149}
        targets={targets}
        rankings={rankings}
        planTarget={165}
      />
    )
    expect(screen.getByTestId('plan-tick').getAttribute('style')).toContain(
      'var(--tm-true-maroon)'
    )
  })
})
