/* #2554 (part): the district KPI card (desktop) and the phone hub tile show
 * the confirmed count as the headline with "+N provisional" beside it; the
 * rank beside the count is on the same confirmed basis. */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DistrictKpiStrip } from '../DistrictKpiStrip'
import { DistrictHubTiles } from '../DistrictHubTiles'
import type { MetricRankings, RecognitionTargets } from '../../types/districts'

afterEach(() => cleanup())

const rankings: MetricRankings = {
  worldRank: 30,
  worldPercentile: 77,
  regionRank: 3,
  totalDistricts: 128,
  totalInRegion: 11,
  region: '05',
}
const targets: RecognitionTargets = {
  distinguished: 72,
  select: 79,
  presidents: 86,
  smedley: 93,
}
// D61: 3 confirmed + 3 provisional (6 qualifying today).
const kpis = {
  paidClubs: { current: 149, targets, rankings },
  membershipPayments: { current: 4200, targets, rankings },
  distinguishedClubs: { current: 3, provisional: 3, targets, rankings },
  netMemberChange: { current: -12 },
}

describe('district Distinguished KPI: confirmed headline (#2554)', () => {
  it('desktop card: headline is confirmed, provisional beside it, not summed', () => {
    render(
      <MemoryRouter>
        <DistrictKpiStrip kpis={kpis} />
      </MemoryRouter>
    )
    const card = screen
      .getByText('Distinguished Clubs')
      .closest('[data-testid="kpi-bullet-card"]') as HTMLElement
    expect(within(card).getByTestId('kpi-value')).toHaveTextContent(
      /^3\s*\+3 provisional$/
    )
    expect(within(card).getByTestId('world-rank')).toHaveTextContent(
      '#30 of 128'
    )
  })

  it('desktop card: other cards are unchanged', () => {
    render(
      <MemoryRouter>
        <DistrictKpiStrip kpis={kpis} />
      </MemoryRouter>
    )
    const cards = screen.getAllByTestId('kpi-bullet-card')
    expect(within(cards[0]!).getByTestId('kpi-value')).toHaveTextContent(
      /^149$/
    )
    expect(
      within(cards[0]!).queryByTestId('distinguished-provisional')
    ).toBeNull()
  })

  it('phone tile: headline is confirmed with +N provisional beside it', () => {
    render(<DistrictHubTiles kpis={kpis} />)
    const tile = screen
      .getAllByTestId('district-hub-tile')
      .find(t => /Distinguished/.test(t.textContent ?? ''))!
    expect(tile).toHaveTextContent(/^Distinguished\s*3\s*\+3 provisional/)
  })
})
