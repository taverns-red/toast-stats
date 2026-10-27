import { DEFAULT_MUSIC } from './music'
import type { Scenario } from './types'

/**
 * V3 — "One nudge from Distinguished" (Program Quality Director, Area
 * Director, Club President).
 *
 * Storyboard: .routine-tmp/video-scenarios-2026-10-25.md §4 V3, adapted to
 * the live site as checked on 2026-10-27 (v2.72.0):
 *
 *   - Beats 2 and 3 quoted counts ("twelve clubs", "37 members, four goals")
 *     that change with every snapshot; their captions now say what is shown.
 *   - Beat 2 is 5 s, not 4 s, because on a phone the preset sits in the
 *     Filter sheet (three taps); beat 1 is 4 s instead.
 *
 * Example club: Confidently Speaking Toastmasters Club #5456 (D86, Area 42),
 * close to Distinguished on the pinned date. Its street address and contact
 * links are masked by the capture (`privacy.ts`).
 *
 * Mobile (390×844): the club list groups rows under collapsed division
 * headings, so beat 1 opens Division C; the preset is a chip in the
 * "Filter & sort" sheet.
 */
const CLUB = 'Confidently Speaking Toastmasters Club'
const STATS = '.club-stats-grid'
const GAP = 'section.club-panel:has(.gap-section)'
const GOALS = '.club-dcp-goals .goals-table'

export const v3: Scenario = {
  id: 'v3',
  role: 'Program Quality Director · Area Director · Club President',
  url: 'https://ts.taverns.red/district/86/clubs?date=2026-10-24',
  fps: 30,
  durationSec: 31,
  titleCard: {
    startSec: 0,
    endSec: 3,
    caption: 'Find the clubs one nudge from Distinguished.',
  },
  beats: [
    {
      id: 'all-clubs',
      startSec: 3,
      endSec: 7,
      caption: 'Every club: health, members, renewals and DCP goals.',
    },
    {
      id: 'close-preset',
      startSec: 7,
      endSec: 12,
      caption: 'One tap lists the clubs within reach of Distinguished.',
    },
    {
      id: 'club-page',
      startSec: 12,
      endSec: 17,
      caption: 'Open a club: members, goals met and CSP at a glance.',
    },
    {
      id: 'gap',
      startSec: 17,
      endSec: 23,
      caption: 'The gap to each tier, counted in goals.',
    },
    {
      id: 'per-goal',
      startSec: 23,
      endSec: 28,
      caption: 'Which goal, and exactly what it takes.',
    },
  ],
  closing: {
    startSec: 28,
    endSec: 31,
    caption: 'Share the club link with its President before the next visit.',
  },
  forms: {
    desktop: {
      device: {
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
      readySelector: '.clubs-name-link',
      setup: [],
      beats: {
        'all-clubs': {
          steps: [
            { kind: 'pause', ms: 400 },
            {
              kind: 'scrollTo',
              selector: 'button:has-text("Close to Distinguished")',
              offsetTop: 140,
            },
          ],
          highlight: 'table',
        },
        'close-preset': {
          steps: [
            { kind: 'pause', ms: 300 },
            {
              kind: 'click',
              selector: 'button:has-text("Close to Distinguished")',
            },
          ],
          highlight: 'button:has-text("Close to Distinguished")',
        },
        'club-page': {
          steps: [
            { kind: 'pause', ms: 300 },
            {
              kind: 'click',
              selector: `a.clubs-name-link:has-text("${CLUB}")`,
            },
          ],
          highlight: STATS,
        },
        gap: {
          steps: [{ kind: 'scrollTo', selector: GAP, offsetTop: 96 }],
          highlight: '.gap-section',
        },
        'per-goal': {
          steps: [{ kind: 'scrollTo', selector: GOALS, offsetTop: 120 }],
          highlight: GOALS,
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
      readySelector: 'button:has-text("Division C")',
      setup: [],
      beats: {
        'all-clubs': {
          steps: [
            { kind: 'pause', ms: 300 },
            { kind: 'click', selector: 'button:has-text("Division C")' },
            { kind: 'pause', ms: 300 },
            {
              kind: 'scrollTo',
              selector: 'button:has-text("Division C")',
              offsetTop: 120,
            },
          ],
          highlight: '.mobile-row-list',
        },
        'close-preset': {
          steps: [
            { kind: 'click', selector: 'button:has-text("Filter")' },
            { kind: 'pause', ms: 500 },
            {
              kind: 'click',
              selector:
                '[role="dialog"] button:has-text("Close to Distinguished")',
            },
            { kind: 'pause', ms: 500 },
            {
              kind: 'click',
              selector: '[role="dialog"] button:has-text("Show")',
            },
            { kind: 'pause', ms: 300 },
            {
              kind: 'scrollTo',
              selector: 'button:has-text("Filter")',
              offsetTop: 220,
            },
          ],
          highlight: '.mobile-row-list',
        },
        'club-page': {
          steps: [
            { kind: 'click', selector: `.mobile-row:has-text("${CLUB}")` },
            { kind: 'pause', ms: 300 },
            { kind: 'scrollTo', selector: STATS, offsetTop: 96 },
          ],
          highlight: STATS,
        },
        gap: {
          steps: [
            { kind: 'scrollTo', selector: '.gap-section', offsetTop: 140 },
          ],
          highlight: '.gap-section',
        },
        'per-goal': {
          // Low enough that the window's pan clamps at the viewport bottom and
          // shows the "Per-goal status" label whole above the list.
          steps: [{ kind: 'scrollTo', selector: GOALS, offsetTop: 360 }],
          highlight: GOALS,
        },
      },
    },
  },
  music: DEFAULT_MUSIC,
}
