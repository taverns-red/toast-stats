/* #2554 (part): the district KPI card (desktop) and the phone hub tile show
 * the confirmed count as the headline with "+N provisional" beside it; the
 * rank beside the count is on the same confirmed basis. */
import { describe, it, expect, afterEach } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DistrictKpiStrip } from '../DistrictKpiStrip'
import { DistrictHubTiles } from '../DistrictHubTiles'
import { DistrictOverviewHub } from '../DistrictOverviewHub'
import { PROVISIONAL_NOTE } from '../DistinguishedCount'
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

const escapeRe = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The visible text, then the one sr-only sentence, and nothing else. */
const visibleThenNote = (visible: string): RegExp =>
  new RegExp(`^${escapeRe(visible)}\\s+${escapeRe(PROVISIONAL_NOTE)}$`)

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
      visibleThenNote('3 +3 provisional')
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
    const value = tile.querySelector('.district-hub__tile-value')
    expect(value).toHaveTextContent(visibleThenNote('3 +3 provisional'))
    // Rank sits on the same confirmed basis.
    expect(tile).toHaveTextContent('#30 of 128')
  })

  // #2580 review: phones render the hub, not the strip, so the step-3 label
  // has to reach the tile and its detail sheet too.
  describe('phone hub carries provisional and the step-3 basis (#2580)', () => {
    const step3 = {
      ...kpis,
      distinguishedClubs: {
        current: 6,
        provisional: 0,
        basis: 'qualifying-today' as const,
        targets,
        rankings,
      },
    }
    const renderHub = (k: typeof kpis | typeof step3) =>
      render(
        <MemoryRouter>
          <DistrictOverviewHub
            districtId="61"
            programYear="2026-2027"
            snapshotDate="2026-10-27"
            kpis={k}
            clubs={[]}
            interventionClubs={[]}
          />
        </MemoryRouter>
      )
    const openSheet = () => {
      fireEvent.click(
        screen.getByRole('button', { name: /^Distinguished Clubs/ })
      )
      return screen.getByRole('dialog', { name: 'Distinguished Clubs' })
    }

    it('tile labels a qualifying-today figure beside the rank', () => {
      render(<DistrictHubTiles kpis={step3} />)
      const tile = screen
        .getAllByTestId('district-hub-tile')
        .find(t => /Distinguished/.test(t.textContent ?? ''))!
      expect(within(tile).getByTestId('distinguished-basis')).toHaveTextContent(
        'qualifying today'
      )
    })

    it('sheet card labels a qualifying-today figure', () => {
      renderHub(step3)
      expect(
        within(openSheet()).getByTestId('distinguished-basis')
      ).toHaveTextContent('qualifying today')
    })

    it('sheet card shows +N provisional beside the confirmed count', () => {
      renderHub(kpis)
      expect(
        within(openSheet()).getByTestId('distinguished-provisional')
      ).toHaveTextContent('+3 provisional')
    })
  })
})
