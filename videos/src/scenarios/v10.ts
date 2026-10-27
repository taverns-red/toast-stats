import { DEFAULT_MUSIC } from './music'
import type { Scenario } from './types'

/**
 * V10 — "Realign without a spreadsheet" (District Director, Alignment
 * Committee; also Division Directors and the Club Growth Director).
 *
 * Storyboard: .routine-tmp/video-scenarios-2026-10-25.md §4 V10, on District
 * 86 (§2), adapted to the live site as checked on 2026-10-27 (v2.73.0):
 *
 *   - Ron (PR #2356): the clip opens on the district Overview and taps Map
 *     (the subnav on desktop, the bottom bar's More sheet on a phone); the
 *     closing card gives the sandbox's deep link, `/district/86/map?
 *     sandbox=1`, with a hint.
 *   - Beat 4 moves a club with the sandbox's "Assign clubs from a list"
 *     select, not by tapping a pin: the sandbox draws its pins on the map
 *     canvas, which a scripted capture cannot aim at. The move is
 *     Kitchener-Waterloo Toastmasters, T94 (six clubs) to T93 (four), and the
 *     beat then shows the changed rows of "Areas, as proposed".
 *   - Copy link has no clipboard in the capture's browser, so the panel shows
 *     its fallback ("Copy the address bar to share this plan."); Export CSV
 *     really downloads, and the capture discards the file.
 *   - The storyboard's closing ("TI's alignment proposal is still yours to
 *     file; this is the sketchpad.") is folded into the closing caption.
 *   - Its captions quoted counts; they now say what is shown. The site drops
 *     `?date=` when the tab changes, so the map shows the latest snapshot.
 *
 * No pin is tapped and no club page is opened, so no address or contact
 * link is on screen.
 *
 * Mobile (390×844): Map is in the More sheet, the Colour menu is a sheet,
 * the sandbox's way in is under "Legend and lists", and the sandbox's plan
 * (tables, list, Copy link, Export CSV) is in its "Open plan" sheet. Clicks
 * scroll that sheet, so each beat clicks what it shows.
 */
const DESKTOP_MAP_TAB = '[data-testid="district-subnav"] a:has-text("Map")'
const MORE = 'nav.section-bar button:has-text("More")'
const MOBILE_MAP_LINK = '[role="dialog"] a.section-sheet__link:has-text("Map")'
const COLOUR = 'button.map-pill:has-text("Colour:")'
const AREA_MODE = '.map-modes__btn:text-is("Area")'
const MAP = '.district-map__canvas'
const SANDBOX_LINK = 'a.map-club__link:has-text("Open the realignment sandbox")'
const LEGEND_AND_LISTS = 'button.map-pill:has-text("Legend and lists")'
const PANEL = 'section.realign'
const OPEN_PLAN = '.realign-bar button:has-text("Open plan")'
const LIST_TOGGLE = 'button.realign__toggle'
const CLUB_SELECT =
  '.realign__list select[aria-label="Area for Kitchener-Waterloo Toastmasters"]'
const CHANGED_ROW = '.realign__table tr.is-changed'
const AREAS_TABLE = '.realign__table-wrap:has(tr.is-changed)'
const ACTIONS = '.realign__actions'
const COPY_LINK = '.realign__actions button:has-text("Copy link")'
const EXPORT_CSV = '.realign__actions button:has-text("Export CSV")'

export const v10: Scenario = {
  id: 'v10',
  role: 'District Director · Alignment Committee',
  url: 'https://ts.taverns.red/district/86?date=2026-10-24',
  fps: 30,
  durationSec: 32,
  titleCard: {
    startSec: 0,
    endSec: 3,
    caption: 'Try a new area layout. Nothing is saved.',
  },
  beats: [
    {
      id: 'open',
      startSec: 3,
      endSec: 6,
      caption: 'From your district page, open Map.',
    },
    {
      id: 'area',
      startSec: 6,
      endSec: 12,
      caption: 'Colour by division or area to see the boundaries.',
    },
    {
      id: 'sandbox',
      startSec: 12,
      endSec: 17,
      caption: 'Open the realignment sandbox to move clubs between areas.',
    },
    {
      id: 'move',
      startSec: 17,
      endSec: 24,
      caption: "Move a club and watch each area's balance update.",
    },
    {
      id: 'share',
      startSec: 24,
      endSec: 29,
      caption: 'The plan lives in the link. Share it with the committee.',
    },
  ],
  closing: {
    startSec: 29,
    endSec: 32,
    caption:
      'A sketchpad, not a filing: ts.taverns.red/district/86/map?sandbox=1',
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
          highlight: DESKTOP_MAP_TAB,
        },
        area: {
          steps: [
            { kind: 'click', selector: DESKTOP_MAP_TAB },
            // Let the basemap tiles arrive before the pins change colour.
            { kind: 'pause', ms: 1500 },
            { kind: 'click', selector: COLOUR },
            { kind: 'pause', ms: 500 },
            { kind: 'click', selector: AREA_MODE },
            // "Area" is near the end of the long Colour menu, so the click
            // scrolls the page; bring the toolbar and the map back in view.
            { kind: 'pause', ms: 200 },
            { kind: 'scrollTo', selector: COLOUR, offsetTop: 72 },
          ],
          highlight: MAP,
        },
        sandbox: {
          steps: [
            { kind: 'scrollTo', selector: SANDBOX_LINK, offsetTop: 500 },
            { kind: 'pause', ms: 400 },
            { kind: 'click', selector: SANDBOX_LINK },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: PANEL, offsetTop: 72 },
          ],
          highlight: PANEL,
        },
        move: {
          steps: [
            { kind: 'click', selector: LIST_TOGGLE },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: CLUB_SELECT, offsetTop: 400 },
            { kind: 'pause', ms: 400 },
            { kind: 'select', selector: CLUB_SELECT, value: 'T|93' },
            { kind: 'pause', ms: 600 },
            { kind: 'scrollTo', selector: CHANGED_ROW, offsetTop: 360 },
          ],
          highlight: AREAS_TABLE,
        },
        share: {
          steps: [
            { kind: 'scrollTo', selector: ACTIONS, offsetTop: 200 },
            { kind: 'click', selector: COPY_LINK },
            { kind: 'pause', ms: 1200 },
            { kind: 'download', selector: EXPORT_CSV },
          ],
          highlight: ACTIONS,
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
          highlight: MOBILE_MAP_LINK,
        },
        area: {
          steps: [
            { kind: 'click', selector: MOBILE_MAP_LINK },
            { kind: 'pause', ms: 1500 },
            { kind: 'click', selector: COLOUR },
            { kind: 'pause', ms: 500 },
            { kind: 'click', selector: AREA_MODE },
          ],
          highlight: MAP,
        },
        sandbox: {
          steps: [
            { kind: 'click', selector: LEGEND_AND_LISTS },
            { kind: 'pause', ms: 500 },
            { kind: 'click', selector: SANDBOX_LINK },
            { kind: 'pause', ms: 800 },
          ],
          highlight: '.realign-bar',
        },
        move: {
          steps: [
            { kind: 'click', selector: OPEN_PLAN },
            { kind: 'pause', ms: 500 },
            { kind: 'click', selector: LIST_TOGGLE },
            { kind: 'pause', ms: 400 },
            { kind: 'select', selector: CLUB_SELECT, value: 'T|93' },
            { kind: 'pause', ms: 600 },
            // A click brings the changed row into the sheet's view.
            { kind: 'click', selector: CHANGED_ROW },
          ],
          highlight: AREAS_TABLE,
        },
        share: {
          steps: [
            { kind: 'click', selector: COPY_LINK },
            { kind: 'pause', ms: 1200 },
            { kind: 'download', selector: EXPORT_CSV },
          ],
          highlight: ACTIONS,
        },
      },
    },
  },
  music: DEFAULT_MUSIC,
}
