import { DEFAULT_MUSIC } from './music'
import type { Scenario } from './types'

/**
 * V12 — "The world and the region" (Region Advisors; also International
 * Directors and Officers, WHQ).
 *
 * Storyboard: .routine-tmp/video-scenarios-2026-10-25.md §4 V12, on Region 05
 * (§2), adapted to the live site as captured on 2026-10-27 (v2.72.0):
 *
 *   - Beat 1 stops with World pulse filling the screen and the Red Vote
 *     block below the fold, so the clip stays product-neutral (§7).
 *   - Beat 3's caption is about ranking, not the storyboard's "remaining to
 *     Distinguished" count: those columns sit off the right edge of the
 *     desktop table and do not exist on a phone, where the table shows two
 *     columns at a time and the viewer picks them.
 *   - The closing card gives the region URL and what its number means, as
 *     V2 does (Ron, PR #2295), instead of "Public data, daily, free."
 *   - Beat 5 goes from the region's growth funnel to the region's own club
 *     map via the region subnav rather than cutting to /regions/map: a
 *     capture follows links in one tab and has no hard cut.
 *   - The region pages' links do not carry `?date=`, so beats 2–5 show the
 *     latest snapshot. Captions name what is shown, never a number.
 *
 * Mobile (390×844): the region tabs are a bottom section bar (Rankings,
 * Health, Growth, Map), and the region table is a two-column comparison,
 * so beat 3 taps "Dist. clubs" to swap one in.
 */
const SUBNAV = '[data-testid="region-subnav"]'
/** On a phone the region tabs move to a bottom section bar. */
const SECTION_BAR = '[data-testid="region-section-bar"]'
const COLUMN_CHIP = '.priority-columns__chip:has-text("Dist. clubs")'

export const v12: Scenario = {
  id: 'v12',
  role: 'Region Advisor',
  url: 'https://ts.taverns.red/?date=2026-10-24',
  fps: 30,
  durationSec: 31,
  titleCard: {
    startSec: 0,
    endSec: 3,
    caption: 'Every district, every region, one scoreboard.',
  },
  beats: [
    {
      id: 'world-pulse',
      startSec: 3,
      endSec: 7,
      caption: 'The world this program year, at a glance.',
    },
    {
      id: 'regions',
      startSec: 7,
      endSec: 12,
      caption: 'Fourteen regions ranked, with membership sparklines.',
    },
    {
      id: 'region',
      startSec: 12,
      endSec: 17,
      caption: "Your region's districts, ranked metric by metric.",
    },
    {
      id: 'health',
      startSec: 17,
      endSec: 22,
      caption: 'Health and compliance per district: CSP, dues, officer lists.',
    },
    {
      id: 'growth-map',
      startSec: 22,
      endSec: 28,
      caption: 'Growth funnel by district; every club on one map.',
    },
  ],
  closing: {
    startSec: 28,
    endSec: 31,
    // A real URL plus what the number means, as V2 (Ron, PR #2295).
    caption: 'Region Advisors: ts.taverns.red/region/05',
    hint: '05 = your region number',
  },
  forms: {
    desktop: {
      device: {
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
      readySelector: '[data-testid="pulse-attention"]',
      setup: [],
      beats: {
        'world-pulse': {
          // 350 px down keeps the whole pulse on screen and the Red Vote
          // block that follows it just below the fold.
          steps: [
            { kind: 'pause', ms: 300 },
            { kind: 'scrollTo', selector: '.world-pulse', offsetTop: 350 },
          ],
          highlight: '.world-pulse',
        },
        regions: {
          steps: [
            { kind: 'click', selector: 'a.world-pulse__all' },
            { kind: 'pause', ms: 300 },
          ],
          highlight: 'table:has(a[href="/region/05"])',
        },
        region: {
          steps: [
            { kind: 'click', selector: 'a[href="/region/05"]' },
            { kind: 'pause', ms: 300 },
            {
              kind: 'scrollTo',
              selector: '.region-rankings__scroll',
              offsetTop: 64,
            },
          ],
          highlight: '.region-rankings__scroll',
        },
        health: {
          steps: [
            { kind: 'click', selector: `${SUBNAV} a:has-text("Health")` },
            { kind: 'pause', ms: 300 },
            { kind: 'scrollTo', selector: '#rollup-compliance', offsetTop: 72 },
          ],
          highlight: '.rollup-breakdown',
        },
        'growth-map': {
          steps: [
            { kind: 'click', selector: `${SUBNAV} a:has-text("Club growth")` },
            { kind: 'pause', ms: 2000 },
            { kind: 'click', selector: `${SUBNAV} a:has-text("Club map")` },
            { kind: 'pause', ms: 300 },
            { kind: 'scrollTo', selector: '.maplibregl-map', offsetTop: 200 },
          ],
          highlight: '.maplibregl-map',
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
      readySelector: '[data-testid="pulse-attention"]',
      setup: [],
      beats: {
        'world-pulse': {
          steps: [
            { kind: 'pause', ms: 300 },
            { kind: 'scrollTo', selector: '.world-pulse', offsetTop: 96 },
          ],
          highlight: '.world-pulse__grid',
        },
        regions: {
          steps: [
            { kind: 'click', selector: 'a.world-pulse__all' },
            { kind: 'pause', ms: 300 },
            {
              kind: 'scrollTo',
              selector: '.priority-columns__table',
              offsetTop: 120,
            },
          ],
          highlight: 'table:has(a[href="/region/05"])',
        },
        region: {
          steps: [
            { kind: 'click', selector: 'a[href="/region/05"]' },
            { kind: 'pause', ms: 300 },
            {
              kind: 'scrollTo',
              selector: '.priority-columns__chip',
              offsetTop: 140,
            },
            { kind: 'click', selector: COLUMN_CHIP },
          ],
          highlight: '.priority-columns',
        },
        health: {
          // The phone folds Compliance into an accordion; the district table
          // shows two columns at a time, so swap in CSP and October dues.
          steps: [
            { kind: 'click', selector: `${SECTION_BAR} a:has-text("Health")` },
            { kind: 'pause', ms: 300 },
            {
              kind: 'scrollTo',
              selector: '.priority-columns__chip',
              offsetTop: 140,
            },
            {
              kind: 'click',
              selector: '.priority-columns__chip:has-text("CSP")',
            },
            { kind: 'pause', ms: 300 },
            {
              kind: 'click',
              selector: '.priority-columns__chip:has-text("Oct. dues")',
            },
          ],
          highlight: '.priority-columns',
        },
        'growth-map': {
          steps: [
            { kind: 'click', selector: `${SECTION_BAR} a:has-text("Growth")` },
            { kind: 'pause', ms: 1500 },
            { kind: 'click', selector: `${SECTION_BAR} a:has-text("Map")` },
            { kind: 'pause', ms: 300 },
            // The phone opens the club list first; its Map button shows the map.
            { kind: 'click', selector: '.region-map__map-fab' },
          ],
          highlight: '.maplibregl-map',
        },
      },
    },
  },
  music: DEFAULT_MUSIC,
}
