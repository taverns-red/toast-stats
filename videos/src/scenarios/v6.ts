import { DEFAULT_MUSIC } from './music'
import type { Scenario } from './types'

/**
 * V6 — "Division and area recognition" (Division Director, Area Director).
 *
 * Storyboard: .routine-tmp/video-scenarios-2026-10-25.md §4 V6, on District
 * 86, Division C and Area 42 (§2), adapted to the live site as checked on
 * 2026-10-27 (v2.72.0):
 *
 *   - Ron (PR #2356): show the way to the view. The clip opens on the
 *     district Overview and taps Grid (the subnav on desktop, the bottom
 *     bar's More sheet on a phone); the closing card gives the deep link,
 *     `/district/86/divisions`, with a hint.
 *   - The grid beats come first, not last. The division and area pages have
 *     no district subnav (and no bottom bar on a phone), so after Area 42
 *     there is no one-tap way back to the grid; from the grid, Divisions is
 *     one tap. The clip therefore ends on the area's own sentence.
 *   - "Area 42: Distinguished now, Select one club away" and the closing
 *     "Round 1 by Nov 30. Round 2 by May 31." name a status and dates that
 *     move with the data and the program year; the captions say what is
 *     shown instead, and the area sentence on screen states the deadline.
 *   - The site drops `?date=` when the tab changes, so the pages after the
 *     Overview show the latest snapshot; the captions name no numbers.
 *
 * Mobile (390×844): the app bar and district bar stay pinned (~100 px), so
 * scroll targets sit 120 px down or lower. Divisions are stacked rows; the
 * area links are the "Area NN — …" headings under the division's sentence.
 */
const DESKTOP_GRID_TAB = '[data-testid="district-subnav"] a:has-text("Grid")'
const DESKTOP_DIVISIONS_TAB =
  '[data-testid="district-subnav"] a:has-text("Divisions")'
const MORE = 'nav.section-bar button:has-text("More")'
const MOBILE_GRID_LINK =
  '[role="dialog"] a.section-sheet__link:has-text("Grid")'
const MOBILE_DIVISIONS_TAB = 'nav.section-bar a:has-text("Divisions")'
const GRID_CONTROLS = '.club-grid-page__controls'
const TIER = 'button.club-grid-toggle__btn:has-text("Distinguished tier")'
const FIRST_DIVISION = 'section.club-grid-division'
const DIVISION_LINK = 'main a[href$="/district/86/division/C"]'
const DIVISION_CARD =
  '.tm-card:has(a.division-heading-link[href$="/district/86/division/C"])'
const DIVISION_TEXT = '[data-testid="division-progress-text"]'
const AREA_LINK = 'main a[href$="/division/C/area/42"]'
const AREA_TEXT = '[data-testid="area-progress-text"]'

export const v6: Scenario = {
  id: 'v6',
  role: 'Division Director · Area Director',
  url: 'https://ts.taverns.red/district/86?date=2026-10-24',
  fps: 30,
  durationSec: 33,
  titleCard: {
    startSec: 0,
    endSec: 3,
    caption: 'Distinguished Area and Division, tracked club by club.',
  },
  beats: [
    {
      id: 'open',
      startSec: 3,
      endSec: 6,
      caption: 'From your district page, open Grid.',
    },
    {
      id: 'grid',
      startSec: 6,
      endSec: 11,
      caption: 'The whole district on one screen, by division and area.',
    },
    {
      id: 'tier',
      startSec: 11,
      endSec: 15,
      caption: 'Colour by health or by tier. Print it for Division Council.',
    },
    {
      id: 'divisions',
      startSec: 15,
      endSec: 20,
      caption:
        'Every division and area against the Distinguished Area Program.',
    },
    {
      id: 'division',
      startSec: 20,
      endSec: 25,
      caption: 'Plain language: what the division must do to qualify.',
    },
    {
      id: 'area',
      startSec: 25,
      endSec: 30,
      caption: "An area's status, its next tier, and the Round 2 deadline.",
    },
  ],
  closing: {
    startSec: 30,
    endSec: 33,
    caption:
      'Division and area recognition: ts.taverns.red/district/86/divisions',
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
          highlight: DESKTOP_GRID_TAB,
        },
        grid: {
          steps: [
            { kind: 'click', selector: DESKTOP_GRID_TAB },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: GRID_CONTROLS, offsetTop: 72 },
          ],
          highlight: FIRST_DIVISION,
        },
        tier: {
          steps: [
            { kind: 'pause', ms: 300 },
            { kind: 'click', selector: TIER },
          ],
          highlight: FIRST_DIVISION,
        },
        divisions: {
          steps: [
            {
              kind: 'scrollTo',
              selector: DESKTOP_DIVISIONS_TAB,
              offsetTop: 300,
            },
            { kind: 'click', selector: DESKTOP_DIVISIONS_TAB },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: DIVISION_CARD, offsetTop: 72 },
          ],
          highlight: DIVISION_CARD,
        },
        division: {
          steps: [
            { kind: 'click', selector: DIVISION_LINK },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: DIVISION_TEXT, offsetTop: 360 },
          ],
          highlight: DIVISION_TEXT,
        },
        area: {
          steps: [
            { kind: 'scrollTo', selector: AREA_LINK, offsetTop: 400 },
            { kind: 'pause', ms: 300 },
            { kind: 'click', selector: AREA_LINK },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: AREA_TEXT, offsetTop: 300 },
          ],
          highlight: AREA_TEXT,
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
          highlight: MOBILE_GRID_LINK,
        },
        grid: {
          steps: [
            { kind: 'click', selector: MOBILE_GRID_LINK },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: GRID_CONTROLS, offsetTop: 120 },
          ],
          highlight: FIRST_DIVISION,
        },
        tier: {
          steps: [
            { kind: 'pause', ms: 300 },
            { kind: 'click', selector: TIER },
          ],
          highlight: GRID_CONTROLS,
        },
        divisions: {
          steps: [
            { kind: 'click', selector: MOBILE_DIVISIONS_TAB },
            { kind: 'pause', ms: 400 },
          ],
          highlight: DIVISION_LINK,
        },
        division: {
          steps: [
            { kind: 'click', selector: DIVISION_LINK },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: DIVISION_TEXT, offsetTop: 160 },
          ],
          highlight: DIVISION_TEXT,
        },
        area: {
          steps: [
            { kind: 'scrollTo', selector: AREA_LINK, offsetTop: 400 },
            { kind: 'pause', ms: 300 },
            { kind: 'click', selector: AREA_LINK },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: AREA_TEXT, offsetTop: 360 },
          ],
          highlight: AREA_TEXT,
        },
      },
    },
  },
  music: DEFAULT_MUSIC,
}
