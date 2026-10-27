import { DEFAULT_MUSIC } from './music'
import type { Scenario } from './types'

/**
 * V1 — "How far from Distinguished District?" (District Director).
 *
 * Storyboard: .routine-tmp/video-scenarios-2026-10-25.md §4 V1, adapted to
 * the live site as checked on 2026-10-27 (v2.72.0):
 *
 *   - Beat 1 types the district number into the landing search and presses
 *     Enter; the site opens the district on its latest snapshot, so the rest
 *     of the clip shows the latest data rather than the pinned date.
 *   - The phone layout shows the KPIs as tiles with the world rank and the
 *     count still needed for Distinguished, not threshold ticks, so beat 2's
 *     caption names what both layouts show.
 *   - The phone shows the rank chart as a sparkline that opens full screen
 *     on a tap, so the mobile beat 5 taps it. Beats 3–5 are 5 s each.
 *   - The rank chart covers the current program year (one point per
 *     snapshot); the eleven-year table sits below it. Beat 5 says so.
 *
 * Captions state *what* is shown, not the numbers, which drift daily.
 *
 * Mobile (390×844): the app bar and district bar stay pinned (~100 px), so
 * scroll targets sit 112 px down. The subnav is a bottom bar, and Rankings sits under
 * "More", so beat 5 opens that sheet first.
 */
const STATUS = '.redesign-panel:has([data-testid="distinguished-status-pill"])'
const GROWTH = '[data-testid="club-growth-achievement"]'
const RANK_CHART =
  'section.redesign-panel:has(h2:has-text("Ranking Progression"))'

export const v1: Scenario = {
  id: 'v1',
  role: 'District Director',
  url: 'https://ts.taverns.red/?date=2026-10-24',
  fps: 30,
  durationSec: 31,
  titleCard: {
    startSec: 0,
    endSec: 3,
    caption: "Your district's gap to Distinguished, on one page.",
  },
  beats: [
    {
      id: 'search',
      startSec: 3,
      endSec: 8,
      caption: "Type a district number. That's the whole login.",
    },
    {
      id: 'kpis',
      startSec: 8,
      endSec: 13,
      caption: 'Every metric with its world rank and the Distinguished bar.',
    },
    {
      id: 'status',
      startSec: 13,
      endSec: 18,
      caption: 'Prerequisites checked. The exact gap, in clubs and payments.',
    },
    {
      id: 'club-growth',
      startSec: 18,
      endSec: 23,
      caption: "Charter milestones tracked against TI's two checkpoint dates.",
    },
    {
      id: 'rankings',
      startSec: 23,
      endSec: 28,
      caption: 'Your world rank at every snapshot this program year.',
    },
  ],
  closing: {
    startSec: 28,
    endSec: 31,
    caption: "ts.taverns.red · free · updated daily from TI's dashboards.",
  },
  forms: {
    desktop: {
      device: {
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
      readySelector: '#landing-search-input',
      setup: [],
      beats: {
        search: {
          steps: [
            { kind: 'pause', ms: 300 },
            { kind: 'type', selector: '#landing-search-input', text: '86' },
            { kind: 'pause', ms: 600 },
            { kind: 'press', key: 'Enter' },
          ],
          highlight: 'section.district-kpi-strip',
        },
        kpis: {
          steps: [
            {
              kind: 'scrollTo',
              selector: 'section.district-kpi-strip',
              offsetTop: 24,
            },
          ],
          highlight: 'section.district-kpi-strip',
        },
        status: {
          // The KPI strip stays pinned (~370 px with the header) once scrolled.
          steps: [{ kind: 'scrollTo', selector: STATUS, offsetTop: 390 }],
          highlight: STATUS,
        },
        'club-growth': {
          steps: [{ kind: 'scrollTo', selector: GROWTH, offsetTop: 390 }],
          highlight: GROWTH,
        },
        rankings: {
          steps: [
            {
              kind: 'click',
              selector:
                '[data-testid="district-subnav"] a:has-text("Rankings")',
            },
            { kind: 'pause', ms: 300 },
            { kind: 'scrollTo', selector: RANK_CHART, offsetTop: 24 },
          ],
          highlight: RANK_CHART,
        },
      },
    },
    mobile: {
      device: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
      readySelector: '#landing-search-input',
      setup: [],
      beats: {
        search: {
          steps: [
            { kind: 'pause', ms: 300 },
            { kind: 'type', selector: '#landing-search-input', text: '86' },
            { kind: 'pause', ms: 600 },
            { kind: 'press', key: 'Enter' },
          ],
          highlight: '[data-testid="district-hub-tiles"]',
        },
        kpis: {
          steps: [
            {
              kind: 'scrollTo',
              selector: '[data-testid="district-hub-tiles"]',
              offsetTop: 112,
            },
          ],
          highlight: '[data-testid="district-hub-tiles"]',
        },
        status: {
          steps: [{ kind: 'scrollTo', selector: STATUS, offsetTop: 112 }],
          highlight: STATUS,
        },
        'club-growth': {
          steps: [{ kind: 'scrollTo', selector: GROWTH, offsetTop: 112 }],
          highlight: GROWTH,
        },
        rankings: {
          steps: [
            {
              kind: 'click',
              selector: 'nav.section-bar button:has-text("More")',
            },
            { kind: 'pause', ms: 400 },
            {
              kind: 'click',
              selector: '[role="dialog"] a:has-text("Rankings")',
            },
            { kind: 'pause', ms: 300 },
            // The phone shows the chart as a sparkline; tap opens it.
            { kind: 'click', selector: ':text("Tap to expand")' },
          ],
          highlight: '[role="dialog"] .recharts-wrapper',
        },
      },
    },
  },
  music: DEFAULT_MUSIC,
}
