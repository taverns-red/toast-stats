// Axe scan of KpiBulletCard (#1517).
//
// The tier scale moved out of four absolutely positioned per-tick stacks and
// into one flow list beneath the bar, so the semantics moved with it: the
// ticks are now decorative marks (`aria-hidden`), each readout abbreviates the
// tier visually (`D`, aria-hidden) and names it in full for assistive tech
// (`sr-only`). This guards the structural WCAG 2.1 AA rules across that
// change — ARIA, labels, list semantics — and pins the `progressbar`
// contract the card has always exposed.
//
// As with the other axe suites, axe-core auto-disables `color-contrast` under
// JSDOM. Tier-scale legibility in both themes is verified geometrically in a
// real engine by `e2e/kpi-tier-labels.smoke.ts`.

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe, toHaveNoViolations } from 'jest-axe'
import { KpiBulletCard } from '../../components/KpiBulletCard'
import type { MetricRankings, RecognitionTargets } from '../../types/districts'

expect.extend(toHaveNoViolations)

const rankings: MetricRankings = {
  worldRank: 22,
  worldPercentile: 76.6,
  regionRank: 3,
  totalDistricts: 94,
  totalInRegion: 7,
  region: '05',
}

// D61 Membership Payments, live snapshot 2026-08-31 — the reported card.
const belowDistinguished: RecognitionTargets = {
  distinguished: 5945,
  select: 6063,
  presidents: 6181,
  smedley: 6357,
}

// D122 Paid Clubs at the close of PY 2025-26 — every tier achieved.
const allAchieved: RecognitionTargets = {
  distinguished: 47,
  select: 48,
  presidents: 49,
  smedley: 50,
}

const renderCard = (
  current: number,
  targets: RecognitionTargets,
  title: string
) =>
  render(
    <MemoryRouter>
      <KpiBulletCard
        title={title}
        current={current}
        targets={targets}
        rankings={rankings}
        tooltipContent="Total membership payments with thresholds for each recognition level."
      />
    </MemoryRouter>
  )

describe('KpiBulletCard — accessibility (#1517)', () => {
  afterEach(() => cleanup())

  it('has no axe violations far below Distinguished', async () => {
    const { container } = renderCard(
      2274,
      belowDistinguished,
      'Membership Payments'
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations with every tier achieved', async () => {
    const { container } = renderCard(51, allAchieved, 'Paid Clubs')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('keeps the progressbar contract the tier scale hangs off', async () => {
    renderCard(2274, belowDistinguished, 'Membership Payments')
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '2274')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '6357')
    expect(bar).toHaveAccessibleName(/membership payments/i)
  })

  it('names every tier in full in the accessibility tree', () => {
    renderCard(2274, belowDistinguished, 'Membership Payments')
    // The visible `D`/`S`/`P`/`Sm` are aria-hidden abbreviations; the full
    // names are the ones AT reads, alongside the threshold value.
    const legend = screen.getByTestId('tier-legend')
    expect(legend).toHaveTextContent('Distinguished 5,945')
    expect(legend).toHaveTextContent('Select Distinguished 6,063')
    expect(legend).toHaveTextContent("President's Distinguished 6,181")
    expect(legend).toHaveTextContent('Smedley Distinguished 6,357')
  })
})
