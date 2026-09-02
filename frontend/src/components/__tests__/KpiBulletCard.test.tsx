import { describe, it, expect, afterEach } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { KpiBulletCard } from '../KpiBulletCard'
import type { MetricRankings, RecognitionTargets } from '../../types/districts'

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>)

const standardTargets: RecognitionTargets = {
  distinguished: 158,
  select: 161,
  presidents: 164,
  smedley: 169,
}

const standardRankings: MetricRankings = {
  worldRank: 30,
  worldPercentile: 77, // (128-30)/128 * 100 ≈ 77 → "23rd percentile"
  regionRank: 3,
  totalDistricts: 128,
  totalInRegion: 11,
  region: '05',
}

afterEach(() => cleanup())

describe('KpiBulletCard', () => {
  describe('basic rendering', () => {
    it('renders the title and current value', () => {
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={149}
          targets={standardTargets}
          rankings={standardRankings}
        />
      )
      expect(screen.getByText('Paid Clubs')).toBeInTheDocument()
      expect(screen.getByTestId('kpi-value')).toHaveTextContent('149')
    })

    it('formats large current values with locale separators', () => {
      renderWithRouter(
        <KpiBulletCard
          title="Membership Payments"
          current={5707}
          targets={{
            distinguished: 5822,
            select: 5937,
            presidents: 6053,
            smedley: 6226,
          }}
          rankings={standardRankings}
        />
      )
      expect(screen.getByTestId('kpi-value')).toHaveTextContent('5,707')
    })

    it('renders the info tooltip when tooltipContent is provided', () => {
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={149}
          targets={standardTargets}
          rankings={standardRankings}
          tooltipContent="How many clubs have paid this period."
        />
      )
      // The Tooltip wraps an <InfoIcon /> — assert by aria-label or role
      expect(screen.getByLabelText(/more info/i)).toBeInTheDocument()
    })
  })

  describe('inline rank line', () => {
    it('renders #rank of total, percentile, and region rank chips', () => {
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={149}
          targets={standardTargets}
          rankings={standardRankings}
        />
      )
      expect(screen.getByText(/#30 of 128/)).toBeInTheDocument()
      expect(screen.getByText(/23rd percentile/)).toBeInTheDocument()
      // Region chip — links to /region/05 when numeric
      const regionLink = screen.getByTestId('region-rank')
      expect(regionLink).toHaveTextContent('05')
      expect(regionLink).toHaveTextContent('#3')
    })

    it('shows "—" placeholders when rank data is missing', () => {
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={149}
          targets={standardTargets}
          rankings={{
            worldRank: null,
            worldPercentile: null,
            regionRank: null,
            totalDistricts: 0,
            totalInRegion: 0,
            region: null,
          }}
        />
      )
      // World rank chip shows an em-dash fallback
      expect(screen.getByTestId('world-rank')).toHaveTextContent('—')
      // No region chip when region is null
      expect(screen.queryByTestId('region-rank')).not.toBeInTheDocument()
    })
  })

  describe('bullet bar', () => {
    it('renders a single progressbar with current as aria-valuenow', () => {
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={149}
          targets={standardTargets}
          rankings={standardRankings}
        />
      )
      const bar = screen.getByRole('progressbar')
      expect(bar).toHaveAttribute('aria-valuenow', '149')
      expect(bar).toHaveAttribute('aria-valuemin', '0')
      expect(bar).toHaveAttribute('aria-valuemax', '169') // Smedley
    })

    it('places each tier-tick as a direct child of the progressbar (no positioned Tooltip wrapper between)', () => {
      // Regression — the Tooltip component wraps children in
      // `<div className="relative inline-block">`. If the tier tick is
      // INSIDE the Tooltip wrapper instead of OUTSIDE it, its
      // `position: absolute` resolves against the zero-width Tooltip
      // wrapper rather than the progressbar — all four ticks collapse
      // to ~left:0 visually even though the inline `style.left` is
      // correct. (Shipped briefly with PR #559; caught by audit of
      // the live site, hotfixed.)
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={149}
          targets={standardTargets}
          rankings={standardRankings}
        />
      )
      const bar = screen.getByRole('progressbar')
      const distinguishedTick = screen.getByTestId('tier-tick-distinguished')
      // The positioned element (the one carrying style.left) must be a
      // direct child of the bar so its % offset resolves in the bar's
      // coordinate space.
      expect(distinguishedTick.parentElement).toBe(bar)
    })

    it('renders four tier readouts with short labels D, S, P, Sm', () => {
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={149}
          targets={standardTargets}
          rankings={standardRankings}
        />
      )
      const legend = screen.getByTestId('tier-legend')
      expect(
        within(legend).getByTestId('tier-legend-distinguished')
      ).toHaveTextContent('D')
      expect(
        within(legend).getByTestId('tier-legend-select')
      ).toHaveTextContent('S')
      expect(
        within(legend).getByTestId('tier-legend-presidents')
      ).toHaveTextContent('P')
      expect(
        within(legend).getByTestId('tier-legend-smedley')
      ).toHaveTextContent('Sm')
    })

    it('renders each tier threshold value in its tier readout', () => {
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={149}
          targets={standardTargets}
          rankings={standardRankings}
        />
      )
      const legend = screen.getByTestId('tier-legend')
      expect(
        within(legend).getByTestId('tier-legend-distinguished')
      ).toHaveTextContent('158')
      expect(
        within(legend).getByTestId('tier-legend-select')
      ).toHaveTextContent('161')
      expect(
        within(legend).getByTestId('tier-legend-presidents')
      ).toHaveTextContent('164')
      expect(
        within(legend).getByTestId('tier-legend-smedley')
      ).toHaveTextContent('169')
    })

    it('positions the marker on a zoom-scale focused on the tier band', () => {
      // Scale = [max(0, min(current, 0.9 × Distinguished)), max(current, 1.05 × Smedley)]
      // For current=149, targets D=158/Sm=169:
      //   minScale = min(149, 142.2) = 142.2
      //   maxScale = max(149, 177.45) = 177.45
      //   position(149) = (149 - 142.2) / 35.25 * 100 ≈ 19.29%
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={149}
          targets={standardTargets}
          rankings={standardRankings}
        />
      )
      const marker = screen.getByTestId('current-marker')
      expect(marker).toHaveStyle({ left: '19.29%' })
    })

    it('spreads tier ticks across the bar so labels do not collide', () => {
      // Same scale calc; tier ticks land at:
      //   D=158 → (158-142.2)/35.25*100 ≈ 44.82%
      //   S=161 → ≈ 53.33%
      //   P=164 → ≈ 61.84%
      //   Sm=169 → (169-142.2)/35.25*100 ≈ 76.03%
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={149}
          targets={standardTargets}
          rankings={standardRankings}
        />
      )
      const bar = screen.getByRole('progressbar')
      expect(within(bar).getByTestId('tier-tick-distinguished')).toHaveStyle({
        left: '44.82%',
      })
      expect(within(bar).getByTestId('tier-tick-select')).toHaveStyle({
        left: '53.33%',
      })
      expect(within(bar).getByTestId('tier-tick-presidents')).toHaveStyle({
        left: '61.84%',
      })
      expect(within(bar).getByTestId('tier-tick-smedley')).toHaveStyle({
        left: '76.03%',
      })
    })

    it('pins marker at 0% when current is far below the tier band', () => {
      // For Distinguished Clubs on D61 (D=71, Sm=94, current=49):
      //   minScale = min(49, 63.9) = 49 (current < 0.9 × D)
      //   maxScale = max(49, 98.7) = 98.7
      //   position(49) = 0%
      renderWithRouter(
        <KpiBulletCard
          title="Distinguished Clubs"
          current={49}
          targets={{
            distinguished: 71,
            select: 78,
            presidents: 86,
            smedley: 94,
          }}
          rankings={standardRankings}
        />
      )
      const marker = screen.getByTestId('current-marker')
      expect(marker).toHaveStyle({ left: '0%' })
    })

    it('pins marker at 100% when current is exactly at Smedley (you-made-it signal)', () => {
      // For current=169 (= Smedley):
      //   allAchieved = true → maxScale = current = 169
      //   minScale = min(169, 142.2) = 142.2
      //   position(169) = (169-142.2)/(169-142.2) * 100 = 100%
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={169}
          targets={standardTargets}
          rankings={standardRankings}
        />
      )
      const marker = screen.getByTestId('current-marker')
      expect(marker).toHaveStyle({ left: '100%' })
      expect(marker).toHaveAttribute('data-all-achieved', 'true')
    })

    it('expands maxScale to include current when current exceeds Smedley', () => {
      // For current=200, targets D=158/Sm=169:
      //   minScale = min(200, 142.2) = 142.2
      //   maxScale = max(200, 177.45) = 200
      //   position(200) = (200-142.2)/57.8*100 ≈ 100%
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={200}
          targets={standardTargets}
          rankings={standardRankings}
        />
      )
      const marker = screen.getByTestId('current-marker')
      expect(marker).toHaveStyle({ left: '100%' })
    })

    it('marks the marker as "all tiers achieved" when current >= Smedley', () => {
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={170}
          targets={standardTargets}
          rankings={standardRankings}
        />
      )
      const marker = screen.getByTestId('current-marker')
      expect(marker).toHaveAttribute('data-all-achieved', 'true')
    })

    it('does not render the bullet bar when Smedley threshold is zero', () => {
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={0}
          targets={{
            distinguished: 0,
            select: 0,
            presidents: 0,
            smedley: 0,
          }}
          rankings={standardRankings}
        />
      )
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    })

    it('does not render a bullet bar when targets is null', () => {
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={149}
          targets={null}
          rankings={standardRankings}
        />
      )
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
      // Fallback message lives in a testable element
      expect(screen.getByTestId('targets-unavailable')).toBeInTheDocument()
    })
  })

  /* #1517 — the tier scale was unreadable in every district: `DSPSm` and
     overlapping values under the bar.
     The geometric proof lives in `e2e/kpi-tier-labels.smoke.ts`, which
     measures getBoundingClientRect() in a real engine — JSDOM has no layout,
     so nothing here can see the pixels. What these tests pin is the STRUCTURAL
     invariant the fix rests on, computed from live D61 numbers: the tier
     positions are demonstrably too crowded to carry text, therefore no text
     may be positioned by them. That is falsifiable in JSDOM and it is what
     stops the layout from regressing into per-tick absolute stacks again. */
  describe('tier scale layout (#1517)', () => {
    // D61 Membership Payments, live snapshot 2026-08-31 (CDN
    // snapshots/2026-08-31/analytics/district_61_performance-targets.json).
    // The reported card: #22 of 94, 23rd percentile, current 2,274.
    const d61Payments: RecognitionTargets = {
      distinguished: 5945,
      select: 6063,
      presidents: 6181,
      smedley: 6357,
    }
    const D61_PAYMENTS_CURRENT = 2274

    const tickPercent = (key: string): number => {
      const tick = screen.getByTestId(`tier-tick-${key}`)
      return Number.parseFloat(tick.style.left)
    }

    const renderD61Payments = () =>
      renderWithRouter(
        <KpiBulletCard
          title="Membership Payments"
          current={D61_PAYMENTS_CURRENT}
          targets={d61Payments}
          rankings={standardRankings}
        />
      )

    it('leaves the four tiers crowded into a sliver of the bar — the premise', () => {
      // Not a bug to fix by widening: #558's zoom scale must also reach down
      // to `current`, and a district far below Distinguished drags minScale
      // to itself. D→Sm spans ~9.4% of the bar, which on the 2-column mobile
      // card grid is ~12px for four ~30px labels. This test exists so the
      // premise of the fix is asserted, not assumed.
      renderD61Payments()
      const span = tickPercent('smedley') - tickPercent('distinguished')
      expect(span).toBeLessThan(10)
      expect(span).toBeGreaterThan(0)
    })

    it('positions no text on that crowded scale', () => {
      // The defect in one sentence: text was centred on a coordinate with no
      // width budget. Every element the bar positions by percentage must now
      // be a bare mark.
      renderD61Payments()
      const bar = screen.getByRole('progressbar')
      const positioned = Array.from(
        bar.querySelectorAll<HTMLElement>('[style*="left"]')
      ).filter(el => el.dataset['testid'] !== 'current-marker')
      expect(positioned.length).toBeGreaterThan(0)
      for (const el of positioned) {
        expect(
          el.textContent?.trim(),
          `${el.dataset['testid'] ?? el.className} carries text on the tier scale`
        ).toBe('')
      }
    })

    it('lays the tier readouts out in normal flow, outside the bar', () => {
      // Flow layout is what makes overlap impossible by construction at every
      // width and for every data shape — no width budget to tune, no scale to
      // re-zoom. Anything absolutely positioned in here reopens the bug.
      renderD61Payments()
      const legend = screen.getByTestId('tier-legend')
      expect(screen.getByRole('progressbar').contains(legend)).toBe(false)
      expect(legend.querySelectorAll('[style*="left"]')).toHaveLength(0)
      expect(legend.querySelectorAll('[style*="translateX"]')).toHaveLength(0)
      expect(legend.className).toContain('flex-wrap')
    })

    it('keeps every threshold value visible without interaction', () => {
      renderD61Payments()
      const legend = screen.getByTestId('tier-legend')
      for (const value of ['5,945', '6,063', '6,181', '6,357']) {
        expect(legend).toHaveTextContent(value)
      }
    })

    it('names each tier in full for assistive tech, with no hover required', () => {
      renderD61Payments()
      const smedley = screen.getByTestId('tier-legend-smedley')
      // `Sm` is aria-hidden; the full name is in the accessible text.
      expect(smedley).toHaveTextContent('Smedley Distinguished')
    })

    it('reaches the full tier label and value by keyboard', async () => {
      renderD61Payments()
      const trigger = within(
        screen.getByTestId('tier-legend-select')
      ).getByTestId('tier-readout-select')
      expect(trigger).toHaveAttribute('tabindex', '0')
      fireEvent.focus(trigger)
      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toHaveTextContent(
          /Select Distinguished — 6,063/
        )
      })
    })

    it('renders the same flow legend when every tier is achieved', () => {
      // D122 at the close of PY 2025-26 — paid clubs over Smedley, so
      // allAchieved collapses maxScale onto current and the marker pins to
      // 100%. The tier ticks bunch at the far left; the readouts must not.
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={51}
          targets={{
            distinguished: 47,
            select: 48,
            presidents: 49,
            smedley: 50,
          }}
          rankings={standardRankings}
        />
      )
      expect(screen.getByTestId('current-marker')).toHaveAttribute(
        'data-all-achieved',
        'true'
      )
      const legend = screen.getByTestId('tier-legend')
      for (const value of ['47', '48', '49', '50']) {
        expect(legend).toHaveTextContent(value)
      }
      expect(legend.querySelectorAll('[style*="left"]')).toHaveLength(0)
    })
  })

  describe('aria labelling', () => {
    it('uses a sensible default aria-label that includes the title', () => {
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={149}
          targets={standardTargets}
          rankings={standardRankings}
        />
      )
      const bar = screen.getByRole('progressbar')
      expect(bar).toHaveAccessibleName(/paid clubs/i)
    })

    it('honors an explicit barAriaLabel prop when provided', () => {
      renderWithRouter(
        <KpiBulletCard
          title="Paid Clubs"
          current={149}
          targets={standardTargets}
          rankings={standardRankings}
          barAriaLabel="District 61 paid clubs progress to Distinguished tiers"
        />
      )
      const bar = screen.getByRole('progressbar')
      expect(bar).toHaveAccessibleName(
        'District 61 paid clubs progress to Distinguished tiers'
      )
    })
  })
})
