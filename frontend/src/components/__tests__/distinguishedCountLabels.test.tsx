/* The Overview shows two Distinguished-club counts (#2390). Ron decided on
 * 2026-10-28 to keep both and label them; the counting rules don't change.
 *
 *  - The KPI card (performance-targets `currentProgress.distinguished`)
 *    counts clubs QUALIFYING TODAY. Desktop says so in the card's info
 *    tooltip; phones say so in the hub tile's detail sheet (the hub carries
 *    no tooltips, and the 375 page has a hard height budget).
 *  - The trophy case's gap (competitive-awards `distinguishedClubsRemaining`,
 *    from `countConfirmedDistinguishedClubs`) counts CONFIRMED clubs, the
 *    #2304 share card's wording ("more confirmed Distinguished clubs"),
 *    with a one-line note and a Methodology link on the tile's existing
 *    sub-item row (no added height).
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
  fireEvent,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { DistrictKpiStrip } from '../DistrictKpiStrip'
import { DistrictOverviewHub } from '../DistrictOverviewHub'
import {
  DistinguishedDistrictTrophyCase,
  type DistinguishedDistrictStatus,
} from '../DistinguishedDistrictTrophyCase'
import { HUB_BULLET_TILES } from '../districtHubTileMeta'
import type { MetricRankings, RecognitionTargets } from '../../types/districts'

afterEach(() => cleanup())

const METHODOLOGY_HREF = '/methodology#distinguished-club-counts'

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
// D61 on 2026-10-27: 6 qualifying today, 3 confirmed (gap 69).
const kpis = {
  paidClubs: { current: 149, targets, rankings },
  membershipPayments: { current: 4200, targets, rankings },
  distinguishedClubs: { current: 6, targets, rankings },
  netMemberChange: { current: -12 },
}

const status: DistinguishedDistrictStatus = {
  districtId: '61',
  currentTier: 'NotDistinguished',
  allPrerequisitesMet: true,
  prerequisites: {
    dspSubmitted: true,
    trainingMet: true,
    marketAnalysisSubmitted: true,
    communicationPlanSubmitted: true,
    regionAdvisorVisitMet: true,
  },
  nextTierGap: {
    tier: 'Distinguished',
    paymentGrowthGap: 2,
    clubGrowthGap: 1.5,
    distinguishedPercentGap: 47.9,
    netClubGrowthGap: 2,
  },
  paidClubsRemaining: 2,
  paymentsRemaining: 169,
  distinguishedClubsRemaining: 69,
}

describe('KPI card: "qualifying today" (#2390)', () => {
  it('the desktop card tooltip says the count is clubs qualifying today', async () => {
    render(
      <MemoryRouter>
        <DistrictKpiStrip kpis={kpis} />
      </MemoryRouter>
    )
    const title = screen.getByText('Distinguished Clubs')
    const card = title.closest('[data-testid="kpi-bullet-card"]') as HTMLElement
    expect(card).not.toBeNull()
    fireEvent.focus(within(card).getByRole('button', { name: /more info/i }))
    const tip = await waitFor(() => within(card).getByRole('tooltip'))
    expect(tip).toHaveTextContent(/qualifying today/i)
    // Points the reader at the other count, so 66 vs 69 reads as two things.
    expect(tip).toHaveTextContent(/confirmed/i)
  })

  it('the phone tile sheet says the same', () => {
    const meta = HUB_BULLET_TILES.find(t => t.key === 'distinguishedClubs')!
    expect(meta.about).toMatch(/qualifying today/i)
    expect(meta.about).toMatch(/confirmed/i)

    render(
      <MemoryRouter>
        <DistrictOverviewHub
          districtId="61"
          programYear="2026-2027"
          snapshotDate="2026-10-27"
          kpis={kpis}
          clubs={[]}
          interventionClubs={[]}
        />
      </MemoryRouter>
    )
    fireEvent.click(
      screen.getByRole('button', { name: /^Distinguished Clubs/ })
    )
    const sheet = screen.getByRole('dialog', { name: 'Distinguished Clubs' })
    expect(sheet).toHaveTextContent(/qualifying today/i)
  })

  it('the other two cards keep their wording', () => {
    for (const key of ['paidClubs', 'membershipPayments'] as const) {
      const meta = HUB_BULLET_TILES.find(t => t.key === key)!
      expect(meta.about).not.toMatch(/qualifying today/i)
    }
  })
})

describe('Trophy case gap: "confirmed" (#2390)', () => {
  const renderCase = (s: DistinguishedDistrictStatus = status) =>
    render(
      <DistinguishedDistrictTrophyCase status={s} programYear="2026-2027" />
    )
  const distTile = () =>
    within(screen.getByTestId('distinguished-gap-tiles'))
      .getAllByTestId('gap-tile-label')
      .find(l => l.textContent === 'Distinguished Clubs')!
      .closest('[data-testid="gap-tile"]') as HTMLElement

  it('names the count as confirmed clubs, the share card noun (#2304)', () => {
    renderCase()
    expect(within(distTile()).getByTestId('gap-tile-value')).toHaveTextContent(
      /^69 confirmed clubs$/
    )
  })

  it('uses the singular for one club', () => {
    renderCase({ ...status, distinguishedClubsRemaining: 1 })
    expect(within(distTile()).getByTestId('gap-tile-value')).toHaveTextContent(
      /^1 confirmed club$/
    )
  })

  it('keeps the percentage and puts a Methodology link on its row', () => {
    renderCase()
    const tile = distTile()
    expect(within(tile).getByTestId('gap-tile-subitem')).toHaveTextContent(
      /^\+47\.9%$/
    )
    const link = within(tile).getByRole('link', { name: /how we count/i })
    expect(link).toHaveAttribute('href', METHODOLOGY_HREF)
  })

  /* No row may be added or wrap at 375 (PAGE_MAX_H). The CI renderer
     resolves the body stack (system-ui) to a wider face than macOS, and the
     phone type floor lifts these 11px rows to 14px: "+x% · confirmed only ·
     How we count" wrapped there (4008 > 4000), and the label row has no
     room for the link either. So the phone gets the noun ("confirmed
     clubs") and the link on the percentage row; the sentence is md+ only. */
  it('adds no row on phones: the link shares the percentage row', () => {
    renderCase()
    const tile = distTile()
    const subRow = within(tile).getByTestId('gap-tile-subitem').parentElement!
    expect(subRow).toContainElement(
      within(tile).getByRole('link', { name: /how we count/i })
    )
    expect(subRow).toHaveTextContent(/^\+47\.9% · How we count$/)
    // label · value · sub-item row: the tile's three rows, as before.
    expect(tile.children).toHaveLength(3)
  })

  it('explains the count in one line from 768 up, hidden on phones', () => {
    renderCase()
    const line = screen.getByTestId('distinguished-gap-explainer')
    expect(line).toHaveClass('hidden', 'md:block')
    expect(line).toHaveTextContent(/confirmed clubs only/i)
    expect(line).toHaveTextContent(/qualifying today/i)
  })

  it('paid clubs and payments tiles carry no note and keep their nouns', () => {
    renderCase()
    const tiles = screen.getByTestId('distinguished-gap-tiles')
    expect(within(tiles).getAllByRole('link')).toHaveLength(1)
    const values = within(tiles).getAllByTestId('gap-tile-value')
    expect(values[0]).toHaveTextContent(/^2 clubs$/)
    expect(values[1]).toHaveTextContent(/^169 payments$/)
  })
})
