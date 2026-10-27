import { DEFAULT_MUSIC } from './music'
import type { Scenario } from './types'

/**
 * V4 — "Your club's page" (club officers).
 *
 * Storyboard: .routine-tmp/video-scenarios-2026-10-25.md §4 V4, adapted to
 * the live site as checked on 2026-10-27 (v2.72.0):
 *
 *   - Beat 1 uses the landing page's search box rather than Cmd/Ctrl-K: the
 *     phone layout has no keyboard shortcut, and one flow keeps the two
 *     formats alike. The site's search opens the club when its suggestion is
 *     picked, so the beat clicks the suggestion.
 *   - The storyboard's beat 5 (worldwide standing, then the history page) is
 *     split into two beats, so each has time to read; the other beats are
 *     4–5 s to keep the clip under 34 s.
 *   - Captions that quoted the stat strip or "Top 6%" now say what is shown;
 *     those numbers change with every snapshot.
 *   - The closing shows a concrete URL plus what the number means, like V2
 *     (Ron, PR #2295), instead of the storyboard's YOUR-CLUB-NUMBER.
 *
 * Example club: Cambridge Toastmasters Club #2728 (D86, Area 92). Its street
 * address and its website and contact links are masked by the capture
 * (`privacy.ts`); the clip never opens either link.
 */
const SEARCH = '#landing-search-input'
const SUGGESTION = '[role="option"]:has-text("Cambridge Toastmasters Club")'
const STATS = '.club-stats-grid'
const TREND = 'section.club-panel:has(h2:has-text("Membership Trend"))'
const COMPLIANCE = 'section.club-compliance'
const STANDING = '[data-testid="worldwide-standing"]'
const HISTORY_LINK = 'a.club-hero__history-link'
// On a phone the hero link is hidden; the history is a row further down.
const MOBILE_HISTORY_LINK = 'a.mobile-row[href$="/history"]'
const SPARK = 'section.club-panel button.chart-spark__trigger'

export const v4: Scenario = {
  id: 'v4',
  role: 'Club officers',
  url: 'https://ts.taverns.red/?date=2026-10-24',
  fps: 30,
  durationSec: 33,
  titleCard: {
    startSec: 0,
    endSec: 3,
    caption: 'Everything TI publishes about your club, on one page.',
  },
  beats: [
    {
      id: 'search',
      startSec: 3,
      endSec: 8,
      caption: 'Search by club name or number.',
    },
    {
      id: 'stats',
      startSec: 8,
      endSec: 13,
      caption:
        "Members, renewals, DCP goals and CSP, from TI's latest dashboard.",
    },
    {
      id: 'trend',
      startSec: 13,
      endSec: 17,
      caption: "This year's membership against every prior year.",
    },
    {
      id: 'compliance',
      startSec: 17,
      endSec: 22,
      caption: 'Officer list, dues, CSP, visits: each with its date.',
    },
    {
      id: 'standing',
      startSec: 22,
      endSec: 26,
      caption: 'Where your club stands among every club worldwide.',
    },
    {
      id: 'history',
      startSec: 26,
      endSec: 30,
      caption: 'Every program year on record, on one screen.',
    },
  ],
  closing: {
    startSec: 30,
    endSec: 33,
    caption: 'Club officers: ts.taverns.red/club/2728',
    hint: '2728 = your club number',
  },
  forms: {
    desktop: {
      device: {
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
      readySelector: SEARCH,
      setup: [],
      beats: {
        search: {
          steps: [
            { kind: 'pause', ms: 200 },
            { kind: 'type', selector: SEARCH, text: 'Cambridge Toast' },
            { kind: 'pause', ms: 700 },
            { kind: 'click', selector: SUGGESTION },
          ],
          highlight: 'header.club-hero',
        },
        stats: {
          steps: [{ kind: 'scrollTo', selector: STATS, offsetTop: 240 }],
          highlight: STATS,
        },
        trend: {
          steps: [{ kind: 'scrollTo', selector: TREND, offsetTop: 72 }],
          highlight: TREND,
        },
        compliance: {
          steps: [{ kind: 'scrollTo', selector: COMPLIANCE, offsetTop: 72 }],
          highlight: COMPLIANCE,
        },
        standing: {
          steps: [{ kind: 'scrollTo', selector: STANDING, offsetTop: 240 }],
          highlight: STANDING,
        },
        history: {
          steps: [
            { kind: 'click', selector: HISTORY_LINK },
            { kind: 'pause', ms: 300 },
            { kind: 'scrollTo', selector: 'table', offsetTop: 120 },
          ],
          highlight: 'table',
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
      readySelector: SEARCH,
      setup: [],
      beats: {
        search: {
          steps: [
            { kind: 'pause', ms: 200 },
            { kind: 'type', selector: SEARCH, text: 'Cambridge Toast' },
            { kind: 'pause', ms: 700 },
            { kind: 'click', selector: SUGGESTION },
          ],
          highlight: 'h1',
        },
        stats: {
          steps: [{ kind: 'scrollTo', selector: STATS, offsetTop: 96 }],
          highlight: STATS,
        },
        trend: {
          // The phone shows the trend as a sparkline; a tap opens the full
          // chart with the prior years.
          steps: [
            { kind: 'scrollTo', selector: SPARK, offsetTop: 160 },
            { kind: 'click', selector: SPARK },
          ],
          highlight: '[role="dialog"]',
        },
        compliance: {
          steps: [
            {
              kind: 'click',
              selector: '[role="dialog"] button.chart-expand-sheet__close',
            },
            { kind: 'pause', ms: 300 },
            { kind: 'scrollTo', selector: COMPLIANCE, offsetTop: 112 },
          ],
          highlight: COMPLIANCE,
        },
        standing: {
          steps: [{ kind: 'scrollTo', selector: STANDING, offsetTop: 120 }],
          highlight: STANDING,
        },
        history: {
          steps: [
            { kind: 'click', selector: MOBILE_HISTORY_LINK },
            { kind: 'pause', ms: 300 },
            { kind: 'scrollTo', selector: 'table', offsetTop: 140 },
          ],
          highlight: 'table',
        },
      },
    },
  },
  music: DEFAULT_MUSIC,
}
