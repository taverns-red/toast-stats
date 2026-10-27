import { DEFAULT_MUSIC } from './music'
import type { Scenario } from './types'

/**
 * V8 — "What changed since the last meeting?" (District Director; also the
 * Administration Manager and Area Directors).
 *
 * Storyboard: .routine-tmp/video-scenarios-2026-10-25.md §4 V8, on District
 * 86 (§2), adapted to the live What Changed page as captured on 2026-10-27
 * (v2.72.0):
 *
 *   - Ron (PR #2356): show the way to the view. The clip opens on the
 *     district Overview and taps What Changed (the subnav on desktop, the
 *     bottom bar's More sheet on a phone); the closing card gives the deep
 *     link, `/district/86/changes`, with a hint.
 *   - Beat 3 picks From (24 September) and To (24 October) instead of
 *     tapping "~1 month": the presets always compare against the latest
 *     snapshot, so a retake would show different data. The range must start
 *     before 30 September for the CSP submissions and area status changes
 *     to show.
 *   - Each change type is a collapsible group and "Membership changes" is
 *     long, so beat 5 folds it to bring "Payment changes" up under "Area
 *     status changes".
 *   - The closing card gives the page's URL and what its number means, as
 *     V2 does (Ron, PR #2295), instead of "Every club name links to its
 *     page."
 *
 * Captions state what is shown, not counts, so they survive the data moving.
 */
/** Ron (PR #2356): show the way to the view from a page the viewer knows. */
const DESKTOP_TAB = '[data-testid="district-subnav"] a:has-text("What Changed")'
const MORE = 'nav.section-bar button:has-text("More")'
const MOBILE_LINK =
  '[role="dialog"] a.section-sheet__link:has-text("What Changed")'
const FROM = '[data-testid="changes-from-chip-select"]'
const TO = '[data-testid="changes-to-chip-select"]'
const KPIS = '.district-changes__kpis'
const group = (title: string): string =>
  `details.changes-group:has(summary:has-text("${title}"))`
const EXPORT = 'button:has-text("Export CSV")'

export const v8: Scenario = {
  id: 'v8',
  role: 'District Director',
  url: 'https://ts.taverns.red/district/86?date=2026-10-24',
  fps: 30,
  durationSec: 33,
  titleCard: {
    startSec: 0,
    endSec: 3,
    caption: 'What changed since the last DEC, in one feed.',
  },
  beats: [
    {
      id: 'open',
      startSec: 3,
      endSec: 6,
      caption: 'From your district page, open What Changed.',
    },
    {
      id: 'pick-range',
      startSec: 6,
      endSec: 10,
      caption: 'Compare any two snapshots. Pick a range.',
    },
    {
      id: 'month',
      startSec: 10,
      endSec: 15,
      caption: 'A month of October renewals, summarised.',
    },
    {
      id: 'status-csp',
      startSec: 15,
      endSec: 20,
      caption: 'Status drops and CSP submissions, club by club.',
    },
    {
      id: 'areas-payments',
      startSec: 20,
      endSec: 25,
      caption: 'Area movement and payments by type: October, April, new, late.',
    },
    {
      id: 'export',
      startSec: 25,
      endSec: 30,
      caption: 'Export the feed. Attach it to the minutes.',
    },
  ],
  closing: {
    startSec: 30,
    endSec: 33,
    caption: 'District Directors: ts.taverns.red/district/86/changes',
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
          highlight: DESKTOP_TAB,
        },
        'pick-range': {
          steps: [
            { kind: 'click', selector: DESKTOP_TAB },
            { kind: 'pause', ms: 400 },
            {
              kind: 'scrollTo',
              selector: '[data-testid="district-subnav"]',
              offsetTop: 72,
            },
          ],
          highlight: '[data-testid="changes-preset-chips"]',
        },
        month: {
          steps: [
            { kind: 'pause', ms: 300 },
            { kind: 'select', selector: FROM, value: '2026-09-24' },
            { kind: 'pause', ms: 300 },
            { kind: 'select', selector: TO, value: '2026-10-24' },
          ],
          highlight: KPIS,
        },
        'status-csp': {
          steps: [
            {
              kind: 'scrollTo',
              selector: group('Club status changes'),
              offsetTop: 72,
            },
          ],
          highlight: group('Club Success Plan submissions'),
        },
        'areas-payments': {
          steps: [
            {
              kind: 'click',
              selector: `${group('Membership changes')} > summary`,
            },
            { kind: 'pause', ms: 300 },
            {
              kind: 'scrollTo',
              selector: group('Area status changes'),
              offsetTop: 72,
            },
          ],
          highlight: group('Payment changes'),
        },
        export: {
          steps: [
            { kind: 'scrollTo', selector: EXPORT, offsetTop: 300 },
            { kind: 'pause', ms: 400 },
            { kind: 'download', selector: EXPORT },
          ],
          highlight: EXPORT,
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
          steps: [
            { kind: 'pause', ms: 300 },
            { kind: 'click', selector: MORE },
          ],
          highlight: MOBILE_LINK,
        },
        'pick-range': {
          steps: [
            { kind: 'click', selector: MOBILE_LINK },
            { kind: 'pause', ms: 400 },
            {
              kind: 'scrollTo',
              selector: '[data-testid="changes-preset-chips"]',
              offsetTop: 120,
            },
          ],
          highlight: '[data-testid="changes-preset-chips"]',
        },
        month: {
          steps: [
            { kind: 'pause', ms: 300 },
            { kind: 'select', selector: FROM, value: '2026-09-24' },
            { kind: 'pause', ms: 300 },
            { kind: 'select', selector: TO, value: '2026-10-24' },
            { kind: 'pause', ms: 300 },
            { kind: 'scrollTo', selector: KPIS, offsetTop: 120 },
          ],
          highlight: KPIS,
        },
        'status-csp': {
          steps: [
            {
              kind: 'scrollTo',
              selector: group('Club status changes'),
              offsetTop: 96,
            },
          ],
          // The window is ~520 px tall on a phone: centring it on the short
          // status group shows the CSP submissions starting below it.
          highlight: group('Club status changes'),
        },
        'areas-payments': {
          steps: [
            {
              kind: 'click',
              selector: `${group('Membership changes')} > summary`,
            },
            { kind: 'pause', ms: 300 },
            {
              kind: 'scrollTo',
              selector: group('Area status changes'),
              offsetTop: 96,
            },
          ],
          // Centred on the area group: folded membership and the start of
          // the payment changes sit just below it.
          highlight: group('Area status changes'),
        },
        export: {
          steps: [
            { kind: 'scrollTo', selector: EXPORT, offsetTop: 300 },
            { kind: 'pause', ms: 400 },
            { kind: 'download', selector: EXPORT },
          ],
          highlight: EXPORT,
        },
      },
    },
  },
  music: DEFAULT_MUSIC,
}
