import { DEFAULT_MUSIC } from './music'
import type { Scenario } from './types'

/**
 * V9 — "Trends and rank, year over year" (District Director, Club Growth
 * Director, Immediate Past District Director; also the PQD and Region
 * Advisors).
 *
 * Storyboard: .routine-tmp/video-scenarios-2026-10-25.md §4 V9, on District
 * 86 (§2), adapted to the live site as checked on 2026-10-27 (v2.73.0):
 *
 *   - Ron (PR #2356): the clip opens on the district Overview and taps
 *     Trends (the subnav on desktop, the bottom bar on a phone); the closing
 *     card gives the Trends page's deep link, `/district/86/trends`, with a
 *     hint.
 *   - The storyboard's captions quoted numbers ("Current 1,674", "Eleven
 *     years"); they now say what is shown. Its closing ("Program years are
 *     July–June; the chart knows.") moved to the membership beat, where the
 *     chart's own subtitle says it.
 *   - The site drops `?date=` when the tab changes, so the pages after the
 *     Overview show the latest snapshot.
 *
 * Mobile (390×844): the Trends page folds both charts into "Tap to expand"
 * sparklines that open a sheet; beat 2 opens the membership sheet and taps
 * its hint line to bring the chart into view, beat 3 opens the payments
 * sheet. Rankings is in the More sheet, and the Overview shows payment
 * composition as a spark bar.
 */
const DESKTOP_TRENDS_TAB =
  '[data-testid="district-subnav"] a:has-text("Trends")'
const DESKTOP_RANKINGS_TAB =
  '[data-testid="district-subnav"] a:has-text("Rankings")'
const DESKTOP_OVERVIEW_TAB =
  '[data-testid="district-subnav"] a:has-text("Overview")'
const MEMBERSHIP =
  '.redesign-panel:has(h2:text-is("District Membership Trend"))'
const PAYMENTS = '.redesign-panel:has(h2:text-is("Membership Payments Trend"))'
const YOY = '.redesign-panel:has(h2:text-is("Year-Over-Year Comparison"))'
const MULTI_YEAR =
  'section.redesign-panel:has(h2:text-is("Multi-Year Comparison"))'
const COMPOSITION = '[data-testid="payment-composition"]'
const MOBILE_TRENDS_TAB = 'nav.section-bar a:has-text("Trends")'
const MOBILE_OVERVIEW_TAB = 'nav.section-bar a:has-text("Overview")'
const MORE = 'nav.section-bar button:has-text("More")'
const MOBILE_RANKINGS_LINK =
  '[role="dialog"] a.section-sheet__link:has-text("Rankings")'
const MEMBERS_SPARK = 'button.chart-spark__trigger:has-text("members")'
const PAYMENTS_SPARK = 'button.chart-spark__trigger:has-text("payments")'
const SHEET = '.chart-expand-sheet'
const SHEET_HINT = `${SHEET} .chart-readout__hint`
const SHEET_CHART = `${SHEET} svg.recharts-surface`
const SHEET_CLOSE = `${SHEET} .chart-expand-sheet__close`
const MOBILE_COMPOSITION = '[data-testid="payment-composition-sparkbar"]'

export const v9: Scenario = {
  id: 'v9',
  role: 'District Director · Club Growth Director · IPDD',
  url: 'https://ts.taverns.red/district/86?date=2026-10-24',
  fps: 30,
  durationSec: 32,
  titleCard: {
    startSec: 0,
    endSec: 3,
    caption: 'This year against the years before it.',
  },
  beats: [
    {
      id: 'open',
      startSec: 3,
      endSec: 6,
      caption: 'From your district page, open Trends.',
    },
    {
      id: 'membership',
      startSec: 6,
      endSec: 11,
      caption: 'Membership by snapshot, July to June, against prior years.',
    },
    {
      id: 'payments',
      startSec: 11,
      endSec: 16,
      caption: 'Payments to date versus the base and last year.',
    },
    {
      id: 'yoy',
      startSec: 16,
      endSec: 20,
      caption: 'Three measures, against the same date last year.',
    },
    {
      id: 'rankings',
      startSec: 20,
      endSec: 25,
      caption: 'Rankings: every year of rank, the climbs and the falls.',
    },
    {
      id: 'composition',
      startSec: 25,
      endSec: 29,
      caption: 'Where the dues came from: new, April, October, late.',
    },
  ],
  closing: {
    startSec: 29,
    endSec: 32,
    caption: 'Trends and rank: ts.taverns.red/district/86/trends',
    hint: '86 = your district number',
  },
  forms: {
    desktop: {
      device: {
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
      readySelector: '[data-testid="district-subnav"]',
      setup: [],
      beats: {
        open: {
          steps: [{ kind: 'pause', ms: 300 }],
          highlight: DESKTOP_TRENDS_TAB,
        },
        membership: {
          steps: [
            { kind: 'click', selector: DESKTOP_TRENDS_TAB },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: MEMBERSHIP, offsetTop: 72 },
          ],
          highlight: MEMBERSHIP,
        },
        payments: {
          steps: [{ kind: 'scrollTo', selector: PAYMENTS, offsetTop: 72 }],
          highlight: PAYMENTS,
        },
        yoy: {
          steps: [{ kind: 'scrollTo', selector: YOY, offsetTop: 72 }],
          highlight: YOY,
        },
        rankings: {
          steps: [
            {
              kind: 'scrollTo',
              selector: DESKTOP_RANKINGS_TAB,
              offsetTop: 300,
            },
            { kind: 'click', selector: DESKTOP_RANKINGS_TAB },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: MULTI_YEAR, offsetTop: 72 },
          ],
          highlight: MULTI_YEAR,
        },
        composition: {
          steps: [
            {
              kind: 'scrollTo',
              selector: DESKTOP_OVERVIEW_TAB,
              offsetTop: 300,
            },
            { kind: 'click', selector: DESKTOP_OVERVIEW_TAB },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: COMPOSITION, offsetTop: 440 },
          ],
          highlight: COMPOSITION,
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
      readySelector: 'nav.section-bar',
      setup: [],
      beats: {
        open: {
          steps: [{ kind: 'pause', ms: 300 }],
          highlight: MOBILE_TRENDS_TAB,
        },
        membership: {
          steps: [
            { kind: 'click', selector: MOBILE_TRENDS_TAB },
            { kind: 'pause', ms: 800 },
            { kind: 'click', selector: MEMBERS_SPARK },
            { kind: 'pause', ms: 1200 },
            // A click brings the chart's hint line, and so the chart, into
            // the sheet's view.
            { kind: 'click', selector: SHEET_HINT },
          ],
          highlight: SHEET_CHART,
        },
        payments: {
          steps: [
            { kind: 'click', selector: SHEET_CLOSE },
            { kind: 'pause', ms: 500 },
            { kind: 'click', selector: PAYMENTS_SPARK },
            { kind: 'pause', ms: 600 },
          ],
          highlight: SHEET,
        },
        yoy: {
          steps: [
            { kind: 'click', selector: SHEET_CLOSE },
            { kind: 'pause', ms: 500 },
            { kind: 'scrollTo', selector: YOY, offsetTop: 120 },
          ],
          highlight: YOY,
        },
        rankings: {
          steps: [
            { kind: 'click', selector: MORE },
            { kind: 'pause', ms: 400 },
            { kind: 'click', selector: MOBILE_RANKINGS_LINK },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: MULTI_YEAR, offsetTop: 120 },
          ],
          highlight: MULTI_YEAR,
        },
        composition: {
          steps: [
            { kind: 'click', selector: MOBILE_OVERVIEW_TAB },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: MOBILE_COMPOSITION, offsetTop: 300 },
          ],
          highlight: MOBILE_COMPOSITION,
        },
      },
    },
  },
  music: DEFAULT_MUSIC,
}
