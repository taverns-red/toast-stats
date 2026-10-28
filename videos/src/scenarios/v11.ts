import { DEFAULT_MUSIC } from './music'
import type { Scenario } from './types'

/**
 * V11 — "When do clubs meet?" (Club Growth Director, VP Membership, Program
 * Quality Director; also the club extension and new-source research chairs
 * and the Logistics Manager).
 *
 * Storyboard: .routine-tmp/video-scenarios-2026-10-25.md §4 V11, on District
 * 86 (§2: most of its clubs have a parsed meeting schedule), adapted to the
 * live site as checked on 2026-10-27 (v2.73.0):
 *
 *   - Ron (PR #2356): the clip opens on the district Overview and taps
 *     Meetings (the subnav on desktop, the bottom bar's More sheet on a
 *     phone); the closing card gives the Meetings page's deep link,
 *     `/district/86/meetings`, with a hint.
 *   - Beat 3 picks Monday 19:00 (the storyboard's Tuesday 19:00 has only a
 *     few online clubs, two of them in one city, so its map zooms to street
 *     level). Beat 4 follows the cell's "Show on the map" link
 *     (`/district/86/map?meets=mon-19-online`). Beat 5 reaches the region
 *     heatmap through Regions → Meetings and picks Region 05 in its select,
 *     because a capture cannot type a URL.
 *   - The storyboard's closing ("Never a meeting link, never a passcode")
 *     moved to the slot beat, where the club list is on screen; the cell's
 *     list shows names, day, time, cadence, mode and division/area only.
 *   - The site drops `?date=` when the tab changes, so the pages after the
 *     Overview show the latest snapshot. No caption quotes a number.
 *
 * Privacy: no club page, Find-a-Club listing or pin is opened. The region
 * heatmap is shown before any cell is picked, so no district is listed.
 *
 * Mobile (390×844): Meetings sits in the More sheet; the grid is one column
 * per weekday and one row per hour, so the beats scroll to the evening rows.
 * The site menu is behind the hamburger and the region pages keep Meetings
 * in their own More sheet.
 */
const DESKTOP_MEETINGS_TAB =
  '[data-testid="district-subnav"] a:has-text("Meetings")'
const MORE = 'nav.section-bar button:has-text("More")'
const MOBILE_MEETINGS_LINK =
  '[role="dialog"] a.section-sheet__link:has-text("Meetings")'
const GRID = '.meeting-grid'
const ONLINE = 'a.meetings-switch__link:has-text("Online")'
const SWITCH = 'nav.meetings-switch'
const MON_19 = '[data-testid="meeting-cell"][href*="slot=mon-19"]'
const SELECTION = 'section.meetings-selection'
const SHOW_ON_MAP = 'a.meetings-selection__action:has-text("Show on the map")'
const DESKTOP_MAP = '.district-map__canvas'
const REGIONS = '.app-shell-nav__link:has-text("Regions")'
const MENU = 'button.app-shell-nav-toggle'
// The regions pages reuse the district subnav's link styles.
const DESKTOP_REGION_MEETINGS = 'a.district-subnav__link:has-text("Meetings")'
const REGION_SELECT = 'select.meetings-filter__select'
const REGION_FILTER = '.meetings-filter'

export const v11: Scenario = {
  id: 'v11',
  role: 'Club Growth Director · VP Membership · PQD',
  url: 'https://ts.taverns.red/district/86?date=2026-10-24',
  fps: 30,
  durationSec: 33,
  titleCard: {
    startSec: 0,
    endSec: 3,
    caption: 'Which evenings have no club? Which have too many?',
  },
  beats: [
    {
      id: 'open',
      startSec: 3,
      endSec: 6,
      caption: 'From your district page, open Meetings.',
    },
    {
      id: 'heatmap',
      startSec: 6,
      endSec: 11,
      caption: "A heatmap of every club's meeting day and start hour.",
    },
    {
      id: 'online',
      startSec: 11,
      endSec: 15,
      caption: 'Online only: clubs that meet online or hybrid.',
    },
    {
      id: 'slot',
      startSec: 15,
      endSec: 20,
      caption: 'Pick a cell: who meets then. Never a meeting link.',
    },
    {
      id: 'map',
      startSec: 20,
      endSec: 24,
      caption: 'Show on the map: where those clubs are.',
    },
    {
      id: 'region',
      startSec: 24,
      endSec: 30,
      caption: 'The same view for a region, or the whole world.',
    },
  ],
  closing: {
    startSec: 30,
    endSec: 33,
    caption: 'Meeting times: ts.taverns.red/district/86/meetings',
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
          highlight: DESKTOP_MEETINGS_TAB,
        },
        heatmap: {
          steps: [
            { kind: 'click', selector: DESKTOP_MEETINGS_TAB },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: SWITCH, offsetTop: 72 },
          ],
          highlight: GRID,
        },
        online: {
          steps: [{ kind: 'click', selector: ONLINE }],
          highlight: GRID,
        },
        slot: {
          steps: [
            { kind: 'click', selector: MON_19 },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: SELECTION, offsetTop: 200 },
          ],
          highlight: SELECTION,
        },
        map: {
          steps: [
            { kind: 'click', selector: SHOW_ON_MAP },
            // Let the basemap tiles arrive and the map fit the pins.
            { kind: 'pause', ms: 1500 },
          ],
          highlight: DESKTOP_MAP,
        },
        region: {
          steps: [
            { kind: 'click', selector: REGIONS },
            { kind: 'pause', ms: 600 },
            { kind: 'click', selector: DESKTOP_REGION_MEETINGS },
            { kind: 'pause', ms: 600 },
            { kind: 'select', selector: REGION_SELECT, value: 'Region 05' },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: REGION_FILTER, offsetTop: 72 },
          ],
          highlight: GRID,
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
            { kind: 'click', selector: MORE },
            { kind: 'pause', ms: 400 },
          ],
          highlight: MOBILE_MEETINGS_LINK,
        },
        heatmap: {
          steps: [
            { kind: 'click', selector: MOBILE_MEETINGS_LINK },
            { kind: 'pause', ms: 800 },
            // The evening rows: where most clubs meet.
            { kind: 'scrollTo', selector: MON_19, offsetTop: 520 },
          ],
          highlight: GRID,
        },
        online: {
          steps: [
            { kind: 'scrollTo', selector: SWITCH, offsetTop: 120 },
            { kind: 'click', selector: ONLINE },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: MON_19, offsetTop: 520 },
          ],
          highlight: GRID,
        },
        slot: {
          steps: [
            { kind: 'click', selector: MON_19 },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: SELECTION, offsetTop: 120 },
          ],
          highlight: SELECTION,
        },
        map: {
          steps: [
            { kind: 'click', selector: SHOW_ON_MAP },
            { kind: 'pause', ms: 1500 },
          ],
          highlight: DESKTOP_MAP,
        },
        region: {
          steps: [
            { kind: 'click', selector: MENU },
            { kind: 'pause', ms: 400 },
            { kind: 'click', selector: REGIONS },
            { kind: 'pause', ms: 600 },
            { kind: 'click', selector: MORE },
            { kind: 'pause', ms: 400 },
            { kind: 'click', selector: MOBILE_MEETINGS_LINK },
            { kind: 'pause', ms: 600 },
            { kind: 'select', selector: REGION_SELECT, value: 'Region 05' },
            { kind: 'pause', ms: 400 },
            // The evening rows, as on the district grid.
            { kind: 'scrollTo', selector: MON_19, offsetTop: 520 },
          ],
          highlight: GRID,
        },
      },
    },
  },
  music: DEFAULT_MUSIC,
}
