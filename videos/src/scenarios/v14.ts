import { DEFAULT_MUSIC } from './music'
import type { Scenario } from './types'

/**
 * V14 — "Clubs that need intervention" (Club Growth Director, Division
 * Director; also Area Directors and club coaches).
 *
 * Storyboard: .routine-tmp/video-scenarios-2026-10-25.md §4 V14, on District
 * 86 (§2), adapted to the live site as checked on 2026-10-27 (v2.73.0):
 *
 *   - Ron (PR #2356): the clip opens on the district Overview and taps Clubs
 *     (the subnav on desktop, the bottom bar on a phone); the closing card
 *     gives the filtered list's deep link, `/district/86/clubs?status=
 *     intervention`, with a hint.
 *   - The storyboard's beat 3 (Coach = Active on top of the status filter)
 *     is dropped: on the pinned date no D86 club that needs intervention has
 *     an active coach, so it would end on "No clubs match your filters". Coach
 *     coverage is shown on the map instead (beat 5, Colour: Club coach).
 *   - The storyboard's closing ("Coach by April 1 to count this year") was
 *     flagged as unverified against the Club Coach Program rules, so the
 *     closing card gives the deep link instead.
 *   - Its captions quoted counts ("Thirty-five clubs…"); they now say what
 *     is shown. The site drops `?date=` when the tab changes, so the pages
 *     after the Overview show the latest snapshot.
 *
 * No club page is opened: the list shows names and figures only, and the
 * map pins are never tapped, so no address or contact link is on screen.
 *
 * Mobile (390×844): Clubs is in the bottom bar; one "Filter & sort" sheet
 * holds the status chips and the sort select, applied with "Show N clubs".
 * Map sits in the bottom bar's More sheet and the Colour menu is a sheet.
 */
const DESKTOP_CLUBS_TAB = '[data-testid="district-subnav"] a:has-text("Clubs")'
const DESKTOP_MAP_TAB = '[data-testid="district-subnav"] a:has-text("Map")'
const FILTERS = 'main button:has-text("Filters")'
const STATUS_INTERVENTION =
  '[role="dialog"] .clubs-filter-popover:has(.clubs-filter-heading:text-is("Status")) [role="checkbox"]:has-text("intervention-required")'
const CLOSE_FILTERS = 'button[aria-label="Close filters"]'
const TREND_HEADER = 'main th:has-text("Trend")'
const TABLE = 'main table'
const MOBILE_CLUBS_TAB = 'nav.section-bar a:has-text("Clubs")'
const MOBILE_FILTER = 'main button[aria-label^="Filter"]'
const MOBILE_INTERVENTION =
  '[role="dialog"] button.filter-sheet__chip:has-text("Intervention required")'
const MOBILE_SORT = '[role="dialog"] select.filter-sheet__select'
const MOBILE_APPLY = '[role="dialog"] button.filter-sheet__apply'
const FIRST_ROW = 'main a.mobile-row'
const MORE = 'nav.section-bar button:has-text("More")'
const MOBILE_MAP_LINK = '[role="dialog"] a.section-sheet__link:has-text("Map")'
const COLOUR = 'button.map-pill:has-text("Colour:")'
const COACH_MODE = '.map-modes__btn:has-text("Club coach")'
const MAP = '.district-map__canvas'

export const v14: Scenario = {
  id: 'v14',
  role: 'Club Growth Director · Division Director',
  url: 'https://ts.taverns.red/district/86?date=2026-10-24',
  fps: 30,
  durationSec: 30,
  titleCard: {
    startSec: 0,
    endSec: 3,
    caption: 'Find the clubs that need help, and who is coaching.',
  },
  beats: [
    {
      id: 'open',
      startSec: 3,
      endSec: 6,
      caption: 'From your district page, open Clubs.',
    },
    {
      id: 'filter',
      startSec: 6,
      endSec: 12,
      caption: 'Filter to clubs that need intervention, each with its trend.',
    },
    {
      id: 'sort',
      startSec: 12,
      endSec: 16,
      caption: 'Sort by trend to see who is falling fastest.',
    },
    {
      id: 'map',
      startSec: 16,
      endSec: 22,
      caption: 'On the map, red badges flag where those clubs cluster.',
    },
    {
      id: 'coach',
      startSec: 22,
      endSec: 27,
      caption: 'Colour by club coach: coverage at a glance, never names.',
    },
  ],
  closing: {
    startSec: 27,
    endSec: 30,
    caption:
      'Clubs needing intervention: ts.taverns.red/district/86/clubs?status=intervention',
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
          highlight: DESKTOP_CLUBS_TAB,
        },
        filter: {
          steps: [
            { kind: 'click', selector: DESKTOP_CLUBS_TAB },
            { kind: 'pause', ms: 600 },
            { kind: 'click', selector: FILTERS },
            { kind: 'pause', ms: 700 },
            { kind: 'click', selector: STATUS_INTERVENTION },
            { kind: 'pause', ms: 900 },
            { kind: 'click', selector: CLOSE_FILTERS },
            { kind: 'pause', ms: 300 },
          ],
          highlight: TABLE,
        },
        sort: {
          steps: [
            { kind: 'click', selector: TREND_HEADER },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: TABLE, offsetTop: 72 },
          ],
          highlight: TREND_HEADER,
        },
        map: {
          steps: [
            { kind: 'scrollTo', selector: DESKTOP_MAP_TAB, offsetTop: 300 },
            { kind: 'click', selector: DESKTOP_MAP_TAB },
            // Let the basemap tiles arrive before the beat settles.
            { kind: 'pause', ms: 1500 },
          ],
          highlight: MAP,
        },
        coach: {
          steps: [
            { kind: 'click', selector: COLOUR },
            { kind: 'pause', ms: 500 },
            { kind: 'click', selector: COACH_MODE },
          ],
          highlight: '.map-legend',
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
          highlight: MOBILE_CLUBS_TAB,
        },
        filter: {
          steps: [
            { kind: 'click', selector: MOBILE_CLUBS_TAB },
            { kind: 'pause', ms: 600 },
            { kind: 'click', selector: MOBILE_FILTER },
            { kind: 'pause', ms: 600 },
            { kind: 'click', selector: MOBILE_INTERVENTION },
            { kind: 'pause', ms: 900 },
            { kind: 'click', selector: MOBILE_APPLY },
            { kind: 'pause', ms: 300 },
          ],
          highlight: FIRST_ROW,
        },
        sort: {
          steps: [
            { kind: 'click', selector: MOBILE_FILTER },
            { kind: 'pause', ms: 500 },
            { kind: 'select', selector: MOBILE_SORT, value: 'netChange' },
            { kind: 'pause', ms: 700 },
            { kind: 'click', selector: MOBILE_APPLY },
            { kind: 'pause', ms: 300 },
          ],
          highlight: FIRST_ROW,
        },
        map: {
          steps: [
            { kind: 'click', selector: MORE },
            { kind: 'pause', ms: 400 },
            { kind: 'click', selector: MOBILE_MAP_LINK },
            { kind: 'pause', ms: 1500 },
          ],
          highlight: MAP,
        },
        coach: {
          steps: [
            { kind: 'click', selector: COLOUR },
            { kind: 'pause', ms: 500 },
            { kind: 'click', selector: COACH_MODE },
          ],
          // The legend sits under the bottom bar on a phone; centring the
          // window on the map keeps the pins in view.
          highlight: MAP,
        },
      },
    },
  },
  music: DEFAULT_MUSIC,
}
