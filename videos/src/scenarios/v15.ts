import { DEFAULT_MUSIC } from './music'
import type { Scenario } from './types'

/**
 * V15 — "Who hasn't filed?" (Program Quality Director, Area Director; also
 * the District Director, Division Director and club officers).
 *
 * Storyboard: .routine-tmp/video-scenarios-2026-10-25.md §4 V15, on District
 * 60 (§2: clubs without a Club Success Plan, several overdue), adapted to the
 * live site as checked on 2026-10-27 (v2.72.0):
 *
 *   - Ron (PR #2356): the clip opens on the district Overview, whose CSP
 *     sentence links to the Action List, and the closing card gives that
 *     list's deep link, `/district/60/action-list`, with a hint.
 *   - Beat 3 opens Map from the Action List and picks "Club Success Plan" in
 *     the Colour menu (`?color=csp`). Beat 4 reaches the overdue club from
 *     the map's list view, because a capture cannot type a URL and pins are
 *     too small to aim at.
 *   - Beat 5 shows the worldwide rollup, `/regions/health` (Regions, then
 *     Health & compliance), not `/region/05/health`: the club page has no
 *     region link, and the Region 05 page puts Ron's own district (D61,
 *     which the storyboard keeps out of the videos) in its "Needs attention"
 *     list. The compliance block is the same on both.
 *   - The storyboard's captions quoted counts ("Nine clubs…"); they now say
 *     what is shown.
 *
 * Example club: Le Cercle Toastmasters #1322 (D60, Area E52), with its CSP
 * overdue on the pinned date. Its address and contact links are masked by
 * the capture (`privacy.ts`).
 *
 * Mobile (390×844): Map sits in the bottom bar's More sheet, the Colour menu
 * is a bottom sheet, the site menu is behind the hamburger, and the region
 * pages have their own bottom bar with Health. The rollup blocks are folded,
 * so beat 5 opens Compliance.
 */
const CSP_LINE = '[data-testid="district-csp-line"]'
const CSP_LINK = `${CSP_LINE} a:has-text("See which clubs")`
const CSP_SECTION = '[data-testid="section-csp"]'
const DESKTOP_MAP_TAB = '[data-testid="district-subnav"] a:has-text("Map")'
const MORE = 'nav.section-bar button:has-text("More")'
const MOBILE_MAP_LINK = '[role="dialog"] a.section-sheet__link:has-text("Map")'
const COLOUR = 'button.map-pill:has-text("Colour:")'
const CSP_MODE = '.map-modes__btn:has-text("Club Success Plan")'
const LIST_VIEW = 'a.map-pill:has-text("List view")'
const CLUB = 'a.mobile-row:has-text("Le Cercle Toastmasters")'
const COMPLIANCE = 'section.club-compliance'
const REGIONS = '.app-shell-nav__link:has-text("Regions")'
const MENU = 'button.app-shell-nav-toggle'
// The regions pages reuse the district subnav's link styles.
const DESKTOP_HEALTH = 'a.district-subnav__link:has-text("Health & compliance")'
const MOBILE_HEALTH = 'nav.section-bar a:has-text("Health")'
const ROLLUP = '[data-testid="rollup-section-compliance"]'

export const v15: Scenario = {
  id: 'v15',
  role: 'Program Quality Director · Area Director',
  url: 'https://ts.taverns.red/district/60?date=2026-10-24',
  fps: 30,
  durationSec: 32,
  titleCard: {
    startSec: 0,
    endSec: 3,
    caption: 'CSP, dues, officer lists: who is missing, by when.',
  },
  beats: [
    {
      id: 'overview',
      startSec: 3,
      endSec: 7,
      caption: 'Your district page counts the missing Club Success Plans.',
    },
    {
      id: 'action-list',
      startSec: 7,
      endSec: 12,
      caption: 'See which clubs, each with its own due date.',
    },
    {
      id: 'map',
      startSec: 12,
      endSec: 17,
      caption: 'On the map: who still needs the call.',
    },
    {
      id: 'club',
      startSec: 17,
      endSec: 22,
      caption: "A club's compliance checklist, dated from TI's reports.",
    },
    {
      id: 'rollup',
      startSec: 22,
      endSec: 29,
      caption: 'The same checks rolled up, region by region.',
    },
  ],
  closing: {
    startSec: 29,
    endSec: 32,
    caption: 'Who has not filed: ts.taverns.red/district/60/action-list',
    hint: '60 = your district number',
  },
  forms: {
    desktop: {
      device: {
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
      readySelector: CSP_LINE,
      setup: [],
      beats: {
        overview: {
          // The KPI strip stays pinned (~370 px with the header) once
          // scrolled, as in V1, so the sentence sits below it.
          steps: [{ kind: 'scrollTo', selector: CSP_LINE, offsetTop: 440 }],
          highlight: CSP_LINE,
        },
        'action-list': {
          steps: [
            { kind: 'click', selector: CSP_LINK },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: CSP_SECTION, offsetTop: 72 },
          ],
          highlight: CSP_SECTION,
        },
        map: {
          steps: [
            { kind: 'scrollTo', selector: DESKTOP_MAP_TAB, offsetTop: 300 },
            { kind: 'click', selector: DESKTOP_MAP_TAB },
            { kind: 'pause', ms: 500 },
            { kind: 'click', selector: COLOUR },
            { kind: 'pause', ms: 400 },
            { kind: 'click', selector: CSP_MODE },
          ],
          highlight: '.map-legend',
        },
        club: {
          steps: [
            { kind: 'click', selector: LIST_VIEW },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: CLUB, offsetTop: 400 },
            { kind: 'click', selector: CLUB },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: COMPLIANCE, offsetTop: 96 },
          ],
          highlight: COMPLIANCE,
        },
        rollup: {
          steps: [
            { kind: 'click', selector: REGIONS },
            { kind: 'pause', ms: 600 },
            { kind: 'click', selector: DESKTOP_HEALTH },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: ROLLUP, offsetTop: 96 },
          ],
          highlight: ROLLUP,
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
      readySelector: CSP_LINE,
      setup: [],
      beats: {
        overview: {
          steps: [{ kind: 'scrollTo', selector: CSP_LINE, offsetTop: 260 }],
          highlight: CSP_LINE,
        },
        'action-list': {
          steps: [
            { kind: 'click', selector: CSP_LINK },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: CSP_SECTION, offsetTop: 120 },
          ],
          highlight: CSP_SECTION,
        },
        map: {
          steps: [
            { kind: 'click', selector: MORE },
            { kind: 'pause', ms: 400 },
            { kind: 'click', selector: MOBILE_MAP_LINK },
            { kind: 'pause', ms: 500 },
            { kind: 'click', selector: COLOUR },
            { kind: 'pause', ms: 400 },
            { kind: 'click', selector: CSP_MODE },
          ],
          // The legend sits under the bottom bar on a phone; the Colour pill
          // names the mode and the window pans down over the pins.
          highlight: COLOUR,
        },
        club: {
          steps: [
            { kind: 'click', selector: LIST_VIEW },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: CLUB, offsetTop: 400 },
            { kind: 'click', selector: CLUB },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: COMPLIANCE, offsetTop: 120 },
          ],
          highlight: COMPLIANCE,
        },
        rollup: {
          steps: [
            { kind: 'click', selector: MENU },
            { kind: 'pause', ms: 400 },
            { kind: 'click', selector: REGIONS },
            { kind: 'pause', ms: 600 },
            { kind: 'click', selector: MOBILE_HEALTH },
            { kind: 'pause', ms: 400 },
            { kind: 'click', selector: `${ROLLUP} > summary` },
            { kind: 'pause', ms: 300 },
            { kind: 'scrollTo', selector: ROLLUP, offsetTop: 120 },
          ],
          highlight: ROLLUP,
        },
      },
    },
  },
  music: DEFAULT_MUSIC,
}
