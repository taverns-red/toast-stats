import { describe, it, expect, afterEach, beforeEach } from 'vitest'
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
import { PROVISIONAL_NOTE } from '../DistinguishedCount'
import type { MetricRankings, RecognitionTargets } from '../../types/districts'

/* #572 — sticky KPI strip extracted from DistrictOverview. Presentational
   only: takes already-loaded KPI values + targets and renders three
   KpiBulletCards inside a sticky-positioned container. Mobile gets a
   collapsible affordance persisted via sessionStorage. */

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

const sampleKpis = {
  paidClubs: { current: 149, targets, rankings },
  membershipPayments: { current: 12500, targets, rankings },
  distinguishedClubs: { current: 84, targets, rankings },
  netMemberChange: { current: 312 },
}

const renderStrip = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => {
  window.sessionStorage.clear()
})
afterEach(() => cleanup())

describe('DistrictKpiStrip (#572)', () => {
  it('renders the three KPI cards inside a labelled landmark', () => {
    renderStrip(<DistrictKpiStrip kpis={sampleKpis} />)
    const strip = screen.getByRole('region', { name: /key district metrics/i })
    expect(within(strip).getByText('Paid Clubs')).toBeInTheDocument()
    expect(within(strip).getByText('Membership Payments')).toBeInTheDocument()
    expect(within(strip).getByText('Distinguished Clubs')).toBeInTheDocument()
  })

  // #2613: each card's rank is by a different measure than the figure it
  // shows (analytics-core MetricRankingsCalculator.getMetricValue).
  it.each([
    ['Paid Clubs', /ranked by club growth %/i],
    ['Membership Payments', /ranked by payments growth %/i],
    ['Distinguished Clubs', /ranked by distinguished % of the club base/i],
  ])('%s names the measure its rank is based on (#2613)', (title, pattern) => {
    renderStrip(<DistrictKpiStrip kpis={sampleKpis} />)
    const card = screen
      .getAllByTestId('kpi-bullet-card')
      .find(c => within(c).queryByText(title))
    expect(card).toBeDefined()
    expect(
      within(card as HTMLElement).getByTestId('ranked-by')
    ).toHaveTextContent(pattern)
  })

  it('applies the sticky-positioning hook class', () => {
    const { container } = renderStrip(<DistrictKpiStrip kpis={sampleKpis} />)
    expect(container.querySelector('.district-kpi-strip')).toBeInTheDocument()
  })

  it('shows a collapse toggle button on the strip', () => {
    renderStrip(<DistrictKpiStrip kpis={sampleKpis} />)
    expect(
      screen.getByRole('button', { name: /collapse kpi/i })
    ).toBeInTheDocument()
  })

  it('toggles to the compact summary row when the chevron is clicked', () => {
    renderStrip(<DistrictKpiStrip kpis={sampleKpis} />)
    const toggle = screen.getByRole('button', { name: /collapse kpi/i })
    fireEvent.click(toggle)
    // After collapse the cards are gone; a summary row replaces them.
    expect(screen.queryByText('Paid Clubs')).not.toBeInTheDocument()
    expect(screen.getByTestId('district-kpi-strip-summary')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /expand kpi/i })
    ).toBeInTheDocument()
  })

  it('collapsed summary shows confirmed with +N qualifying today when provisional > 0 (#2554)', () => {
    window.sessionStorage.setItem('district-kpi-strip-collapsed', 'true')
    renderStrip(
      <DistrictKpiStrip
        kpis={{
          ...sampleKpis,
          distinguishedClubs: {
            ...sampleKpis.distinguishedClubs,
            provisional: 3,
          },
        }}
      />
    )
    expect(screen.getByTestId('district-kpi-strip-summary')).toHaveTextContent(
      '84 dist. +3 qualifying today'
    )
  })

  it('explains "qualifying today" to screen readers in the collapsed summary (#2776)', () => {
    window.sessionStorage.setItem('district-kpi-strip-collapsed', 'true')
    renderStrip(
      <DistrictKpiStrip
        kpis={{
          ...sampleKpis,
          distinguishedClubs: {
            ...sampleKpis.distinguishedClubs,
            provisional: 3,
          },
        }}
      />
    )
    const note = screen.getByTestId('distinguished-provisional-note')
    expect(note).toHaveClass('sr-only')
    expect(note).toHaveTextContent(PROVISIONAL_NOTE)
  })

  it('collapsed summary has no provisional part when there is none', () => {
    window.sessionStorage.setItem('district-kpi-strip-collapsed', 'true')
    renderStrip(<DistrictKpiStrip kpis={sampleKpis} />)
    expect(
      screen.getByTestId('district-kpi-strip-summary')
    ).not.toHaveTextContent(/prov\.|qualifying today/)
  })

  it('persists the collapsed state in sessionStorage', () => {
    renderStrip(<DistrictKpiStrip kpis={sampleKpis} />)
    fireEvent.click(screen.getByRole('button', { name: /collapse kpi/i }))
    expect(window.sessionStorage.getItem('district-kpi-strip-collapsed')).toBe(
      'true'
    )
  })

  it('restores the collapsed state from sessionStorage on mount', () => {
    window.sessionStorage.setItem('district-kpi-strip-collapsed', 'true')
    renderStrip(<DistrictKpiStrip kpis={sampleKpis} />)
    expect(screen.queryByText('Paid Clubs')).not.toBeInTheDocument()
    expect(screen.getByTestId('district-kpi-strip-summary')).toBeInTheDocument()
  })

  it('renders a compact loading skeleton when kpis is null', () => {
    renderStrip(<DistrictKpiStrip kpis={null} />)
    expect(
      screen.getByTestId('district-kpi-strip-skeleton')
    ).toBeInTheDocument()
  })

  // #1647 — the old 64px bar swapped for a 312px (desktop) / 750px (mobile)
  // strip, the largest single shift on /district/:id. The skeleton now lays
  // out the loaded strip's own structure (Lesson 158) so its height emerges
  // from the same CSS.
  it('reserves the loaded strip structure while kpis is null (#1647)', () => {
    renderStrip(<DistrictKpiStrip kpis={null} />)
    const skeleton = screen.getByTestId('district-kpi-strip-skeleton')
    const ghost = skeleton.querySelector('.district-kpi-strip__expanded')
    expect(ghost).not.toBeNull()
    expect(ghost).toHaveAttribute('aria-hidden', 'true')
    expect(
      ghost?.querySelector('.district-kpi-strip__cards')?.children
    ).toHaveLength(4)
    expect(ghost?.querySelector('.district-kpi-strip__legend')).not.toBeNull()
    // The <980px collapse chevron occupies a 44px column in the loaded strip.
    expect(skeleton.querySelector('.district-kpi-strip__toggle')).not.toBeNull()
    // Nothing in the reserved slot is reachable by AT or keyboard.
    expect(within(skeleton).queryAllByRole('button')).toHaveLength(0)
  })

  it('reserves the collapsed summary row when the strip was collapsed (#1647)', () => {
    window.sessionStorage.setItem('district-kpi-strip-collapsed', 'true')
    renderStrip(<DistrictKpiStrip kpis={null} />)
    const skeleton = screen.getByTestId('district-kpi-strip-skeleton')
    expect(
      skeleton.querySelector('.district-kpi-strip__summary')
    ).not.toBeNull()
    expect(skeleton.querySelector('.district-kpi-strip__cards')).toBeNull()
  })

  // #681 — KPI strip to spec: 4th card + legible gauge.
  it('renders the 4th Net Member Change card with its signed value', () => {
    renderStrip(<DistrictKpiStrip kpis={sampleKpis} />)
    const strip = screen.getByRole('region', { name: /key district metrics/i })
    expect(within(strip).getByText('Net Member Change')).toBeInTheDocument()
    expect(within(strip).getByTestId('kpi-delta-value')).toHaveTextContent(
      '+312'
    )
  })

  it('includes the net member change in the collapsed summary row', () => {
    window.sessionStorage.setItem('district-kpi-strip-collapsed', 'true')
    renderStrip(<DistrictKpiStrip kpis={sampleKpis} />)
    const summary = screen.getByTestId('district-kpi-strip-summary')
    expect(within(summary).getByText(/\+312/)).toBeInTheDocument()
  })

  it('renders a legend expanding the D/S/P/Sm tier abbreviations', () => {
    renderStrip(<DistrictKpiStrip kpis={sampleKpis} />)
    const legend = screen.getByTestId('district-kpi-strip-legend')
    expect(legend).toHaveTextContent(/Distinguished/)
    expect(legend).toHaveTextContent(/Select/)
    expect(legend).toHaveTextContent(/President/)
    expect(legend).toHaveTextContent(/Smedley/)
  })

  it('hides the tier legend in the collapsed summary view', () => {
    window.sessionStorage.setItem('district-kpi-strip-collapsed', 'true')
    renderStrip(<DistrictKpiStrip kpis={sampleKpis} />)
    expect(
      screen.queryByTestId('district-kpi-strip-legend')
    ).not.toBeInTheDocument()
  })

  // #1023 — disambiguate the Overview "Net Member Change" (payments vs. payment
  // base) from the Trends "Net Change" (member counts vs. first PY snapshot).
  // #2580 (#2579 review): with no confirmed source the card holds the
  // qualifying-today figure. It must say so beside a confirmed-basis rank.
  describe('qualifying-today basis (#2580)', () => {
    const kpis = {
      ...sampleKpis,
      distinguishedClubs: {
        ...sampleKpis.distinguishedClubs,
        current: 6,
        basis: 'qualifying-today' as const,
      },
    }

    it('labels the Distinguished value as qualifying today', () => {
      renderStrip(<DistrictKpiStrip kpis={kpis} />)
      expect(screen.getByTestId('distinguished-basis')).toHaveTextContent(
        'qualifying today'
      )
    })

    it('labels it in the collapsed summary too', () => {
      window.sessionStorage.setItem('district-kpi-strip-collapsed', 'true')
      renderStrip(<DistrictKpiStrip kpis={kpis} />)
      expect(
        screen.getByTestId('district-kpi-strip-summary')
      ).toHaveTextContent(/6 dist\. qualifying today/)
    })

    it('adds no "+N" to the collapsed summary even if a provisional figure comes with it (#2776)', () => {
      window.sessionStorage.setItem('district-kpi-strip-collapsed', 'true')
      renderStrip(
        <DistrictKpiStrip
          kpis={{
            ...kpis,
            distinguishedClubs: { ...kpis.distinguishedClubs, provisional: 4 },
          }}
        />
      )
      const summary = screen.getByTestId('district-kpi-strip-summary')
      expect(summary).toHaveTextContent(/6 dist\. qualifying today/)
      expect(summary).not.toHaveTextContent('+4')
    })

    it('draws no basis label for a confirmed count', () => {
      renderStrip(<DistrictKpiStrip kpis={sampleKpis} />)
      expect(screen.queryByTestId('distinguished-basis')).toBeNull()
    })
  })

  describe('net-change disambiguation (#1023)', () => {
    it('names the metric AND baseline in the secondary line (payments vs. program-year base)', () => {
      renderStrip(<DistrictKpiStrip kpis={sampleKpis} />)
      expect(
        screen.getByText('payments vs. program-year base')
      ).toBeInTheDocument()
    })

    it('tooltip contrasts the payment-base delta with the Trends member-count metric', async () => {
      renderStrip(<DistrictKpiStrip kpis={sampleKpis} />)
      const deltaCard = screen.getByTestId('kpi-delta-card')
      const infoBtn = within(deltaCard).getByRole('button', {
        name: /more info/i,
      })
      fireEvent.focus(infoBtn)
      const tip = await waitFor(() => within(deltaCard).getByRole('tooltip'))
      // Overview basis: payments minus the program-year payment base.
      expect(tip).toHaveTextContent(/payment base/i)
      // Explicitly distinguished from the Trends "Net Change" member-count metric.
      expect(tip).toHaveTextContent(/member counts/i)
      expect(tip).toHaveTextContent(/first snapshot/i)
    })

    it('drift guard: the card value still derives from the passed delta source', () => {
      // The page wires netMemberChange.current ← analytics.membershipChange
      // (DistrictDetailPage.tsx). The strip must render exactly that value,
      // never re-derive it. −8 is the documented payments−paymentBase delta.
      renderStrip(
        <DistrictKpiStrip
          kpis={{ ...sampleKpis, netMemberChange: { current: -8 } }}
        />
      )
      const strip = screen.getByRole('region', {
        name: /key district metrics/i,
      })
      expect(within(strip).getByTestId('kpi-delta-value')).toHaveTextContent(
        '−8'
      )
    })
  })
})
