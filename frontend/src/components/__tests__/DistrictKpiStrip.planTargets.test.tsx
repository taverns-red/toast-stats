/**
 * DistrictKpiStrip Success Plan ticks (#2297): the page hands the strip the
 * goals for the year on screen (R3); each tiered card gets its own.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import {
  cleanup,
  render as rtlRender,
  screen,
  within,
} from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { DistrictKpiStrip } from '../DistrictKpiStrip'
import type { MetricRankings, RecognitionTargets } from '../../types/districts'

const rankings: MetricRankings = {
  worldRank: 30,
  worldPercentile: 77,
  regionRank: 3,
  totalDistricts: 128,
  totalInRegion: 11,
  region: '05',
}
const targets: RecognitionTargets = {
  distinguished: 158,
  select: 161,
  presidents: 164,
  smedley: 169,
}
const kpis = {
  paidClubs: { current: 149, targets, rankings },
  membershipPayments: { current: 160, targets, rankings },
  distinguishedClubs: { current: 84, targets, rankings },
  netMemberChange: { current: 312 },
}

const card = (title: string) =>
  screen
    .getAllByTestId('kpi-bullet-card')
    .find(c => within(c).queryByText(title)) as HTMLElement

beforeEach(() => window.sessionStorage.clear())
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

describe('DistrictKpiStrip plan targets (#2297)', () => {
  it('draws no plan ticks without goals', () => {
    render(<DistrictKpiStrip kpis={kpis} />)
    expect(screen.queryAllByTestId('plan-tick')).toHaveLength(0)
  })

  it('gives each tiered card its own goal', () => {
    render(
      <DistrictKpiStrip
        kpis={kpis}
        planGoals={{ paidClubs: 165, payments: 166, distinguishedClubs: 90 }}
      />
    )
    expect(
      within(card('Paid Clubs')).getByTestId('plan-target')
    ).toHaveTextContent('165')
    expect(
      within(card('Membership Payments')).getByTestId('plan-target')
    ).toHaveTextContent('166')
    expect(
      within(card('Distinguished Clubs')).getByTestId('plan-target')
    ).toHaveTextContent('90')
  })

  it('leaves a card without a goal untouched', () => {
    render(<DistrictKpiStrip kpis={kpis} planGoals={{ payments: 166 }} />)
    expect(screen.getAllByTestId('plan-tick')).toHaveLength(1)
    expect(
      within(card('Paid Clubs')).queryByTestId('plan-target')
    ).not.toBeInTheDocument()
  })

  it('adds Plan to the tier-marker legend only when a goal is set', () => {
    const { rerender } = render(<DistrictKpiStrip kpis={kpis} />)
    const legend = () => screen.getByTestId('district-kpi-strip-legend')
    expect(legend()).not.toHaveTextContent('Plan')
    rerender(<DistrictKpiStrip kpis={kpis} planGoals={{ payments: 166 }} />)
    expect(legend()).toHaveTextContent('Plan Success Plan target')
  })
})
