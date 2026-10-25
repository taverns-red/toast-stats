import { DEFAULT_MUSIC } from './music'
import type { Scenario } from './types'

/**
 * V2 — "What should I do this week?" (Area Director).
 *
 * Storyboard: .routine-tmp/video-scenarios-2026-10-25.md §4 V2, adapted to the
 * live Action List as captured on 2026-10-25 (v2.68.0):
 *
 *   - The page shows four collapsible sections, not four counters, so beat 1
 *     collapses the first one to show all four lists with their counts.
 *   - Area 42 (the storyboard's pick) has no outstanding club visits on the
 *     pinned date, which would leave beat 4 empty. Area 43 (also Division C)
 *     has both clubs close to Distinguished and Round 1 visits outstanding.
 *   - The site shows no download toast after Export CSV; the beat highlights
 *     the button the viewer clicks.
 *
 * Captions are the storyboard's, which state *what* is shown rather than a
 * number, so they survive the data drifting day to day.
 */
export const v2: Scenario = {
  id: 'v2',
  role: 'Area Director',
  url: 'https://ts.taverns.red/district/86/action-list?date=2026-10-24',
  viewport: { width: 1280, height: 800 },
  fps: 30,
  durationSec: 30,
  readySelector: '[data-testid="table-close"] tbody tr',
  setup: [
    // Opening state: all four lists collapsed so their headings and counts
    // fit on one screen.
    { kind: 'click', selector: '#action-close' },
    { kind: 'pause', ms: 400 },
  ],
  titleCard: {
    startSec: 0,
    endSec: 3,
    caption: "Your area's to-do list, built from the data.",
  },
  beats: [
    {
      id: 'four-lists',
      startSec: 3,
      endSec: 8,
      caption:
        'Four lists. Close to Distinguished, visits due, intervention, no CSP.',
      steps: [
        { kind: 'pause', ms: 600 },
        {
          kind: 'scrollTo',
          selector: '[data-testid="action-list-page"]',
          offsetTop: 24,
        },
      ],
      highlight: '.action-list-sections',
    },
    {
      id: 'filter-area',
      startSec: 8,
      endSec: 13,
      caption: 'Filter to your area. The link remembers it.',
      steps: [
        { kind: 'pause', ms: 500 },
        {
          kind: 'select',
          selector: '.action-list-scope__select >> nth=0',
          value: 'C',
        },
        { kind: 'pause', ms: 900 },
        {
          kind: 'select',
          selector: '.action-list-scope__select >> nth=1',
          value: '43',
        },
      ],
      highlight: '.action-list-scope',
    },
    {
      id: 'close-to-distinguished',
      startSec: 13,
      endSec: 18,
      caption: 'Each club: how many members and goals it still needs.',
      steps: [
        { kind: 'pause', ms: 400 },
        { kind: 'click', selector: '#action-close' },
      ],
      highlight: '[data-testid="table-close"]',
    },
    {
      id: 'visits-due',
      startSec: 18,
      endSec: 23,
      caption: 'Round 1 visits still unreported, before the November deadline.',
      steps: [
        { kind: 'pause', ms: 400 },
        { kind: 'click', selector: '#action-visits' },
        { kind: 'pause', ms: 300 },
        {
          kind: 'scrollTo',
          selector: '[data-testid="section-close"]',
          offsetTop: 24,
        },
      ],
      highlight: '[data-testid="table-visits"]',
    },
    {
      id: 'export',
      startSec: 23,
      endSec: 27,
      caption: 'Export it. Paste it into your Area Council agenda.',
      steps: [
        {
          kind: 'scrollTo',
          selector: '[data-testid="action-list-page"]',
          offsetTop: 24,
        },
        { kind: 'pause', ms: 500 },
        { kind: 'download', selector: '.action-list-page__export' },
      ],
      highlight: '.action-list-page__export',
    },
  ],
  closing: {
    startSec: 27,
    endSec: 30,
    caption:
      'Area Directors: ts.taverns.red/district/YOUR-DISTRICT/action-list',
  },
  music: DEFAULT_MUSIC,
}
