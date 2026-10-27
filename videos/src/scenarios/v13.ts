import { DEFAULT_MUSIC } from './music'
import type { Scenario } from './types'

/**
 * V13 — "Stories worth telling" (District PR Manager, VP Public Relations;
 * also the Awards and Newsletter committees).
 *
 * Storyboard: .routine-tmp/video-scenarios-2026-10-25.md §4 V13, adapted to
 * the live site as checked on 2026-10-27 (v2.73.0):
 *
 *   - Ron (PR #2356): the clip opens on the District 86 Overview (the
 *     storyboard opened on `/clubs`), so its anniversaries beat comes first,
 *     followed by the Milestones panel; the closing card gives the Overview's
 *     deep link, `/district/86`, with a hint.
 *   - Clubs (site menu) → the Distinguished tile → the race list, scrolled to
 *     Milton Club (D86, among the first to reach Distinguished). The
 *     storyboard's club, Cambridge #2728, is not on the race list, so the
 *     standing beat opens Milton Club from its race row: the same "brag line"
 *     card, reached by a click instead of a typed URL.
 *   - Awards (site menu) closes the path. The storyboard's captions quoted
 *     counts and dates ("Two District 86 clubs… in August"); they now say
 *     what is shown.
 *
 * Privacy: the only club page opened is Milton Club's; the capture masks its
 * address and contact links (`privacy.ts`), and the beat scrolls straight to
 * the Worldwide standing card.
 *
 * Mobile (390×844): the Milestones panel is folded under a summary row, the
 * site menu is behind the hamburger, and the race list uses compact rows
 * whose whole row is the club link.
 */
const ANNIVERSARIES =
  'section[aria-labelledby="upcoming-anniversaries-heading"]'
const MILESTONES = 'section[aria-labelledby="milestones-heading"]'
const ANNIVERSARIES_SHOW_ALL = `${ANNIVERSARIES} :text("Show all")`
const MILESTONES_SUMMARY = 'summary:has-text("Milestones")'
const MENU = 'button.app-shell-nav-toggle'
const CLUBS = '.app-shell-nav__link:has-text("Clubs")'
const AWARDS = '.app-shell-nav__link:has-text("Awards")'
const PODIUM = 'ol.race-podium'
const DISTINGUISHED_TILE = 'a.clubs-kpi[href="/clubs/race/distinguished"]'
const RACE_ROW = '#race-row-4778'
const DESKTOP_RACE_LINK = `${RACE_ROW} a[href="/district/86/club/4778"]`
const STANDING = '[data-testid="worldwide-standing"]'
const EXTENSION_AWARD = 'section[aria-labelledby="award-extensionAward-title"]'

export const v13: Scenario = {
  id: 'v13',
  role: 'VP Public Relations · District PR Manager',
  url: 'https://ts.taverns.red/district/86?date=2026-10-24',
  fps: 30,
  durationSec: 33,
  titleCard: {
    startSec: 0,
    endSec: 3,
    caption: 'Good news, with the receipts.',
  },
  beats: [
    {
      id: 'anniversaries',
      startSec: 3,
      endSec: 7,
      caption: 'Your district page lists club anniversaries coming up.',
    },
    {
      id: 'milestones',
      startSec: 7,
      endSec: 11,
      caption: 'Clubs reaching a milestone year this program year.',
    },
    {
      id: 'podium',
      startSec: 11,
      endSec: 15,
      caption: 'Clubs: the first in the world to reach each tier.',
    },
    {
      id: 'race',
      startSec: 15,
      endSec: 20,
      caption: "The whole race, with your district's clubs in it.",
    },
    {
      id: 'standing',
      startSec: 20,
      endSec: 25,
      caption: 'Open a club: its worldwide standing, ready to quote.',
    },
    {
      id: 'awards',
      startSec: 25,
      endSec: 30,
      caption: 'District award standings, from the same public data.',
    },
  ],
  closing: {
    startSec: 30,
    endSec: 33,
    caption: 'Link the page; it updates itself: ts.taverns.red/district/86',
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
      readySelector: ANNIVERSARIES,
      setup: [],
      beats: {
        anniversaries: {
          steps: [
            { kind: 'scrollTo', selector: ANNIVERSARIES, offsetTop: 440 },
          ],
          highlight: ANNIVERSARIES,
        },
        milestones: {
          steps: [{ kind: 'scrollTo', selector: MILESTONES, offsetTop: 440 }],
          highlight: MILESTONES,
        },
        podium: {
          steps: [
            { kind: 'click', selector: CLUBS },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: PODIUM, offsetTop: 200 },
          ],
          highlight: PODIUM,
        },
        race: {
          steps: [
            { kind: 'click', selector: DISTINGUISHED_TILE },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: RACE_ROW, offsetTop: 400 },
          ],
          highlight: RACE_ROW,
        },
        standing: {
          steps: [
            { kind: 'click', selector: DESKTOP_RACE_LINK },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: STANDING, offsetTop: 200 },
          ],
          highlight: STANDING,
        },
        awards: {
          steps: [
            { kind: 'click', selector: AWARDS },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: EXTENSION_AWARD, offsetTop: 96 },
          ],
          highlight: EXTENSION_AWARD,
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
      readySelector: ANNIVERSARIES,
      setup: [],
      beats: {
        anniversaries: {
          // The Red Vote block sits a screen below the panel on a phone
          // (storyboard §7: keep the clips product-neutral). Show the panel's
          // top first, expand its list with "Show all", then frame it.
          steps: [
            { kind: 'scrollTo', selector: ANNIVERSARIES, offsetTop: 520 },
            { kind: 'click', selector: ANNIVERSARIES_SHOW_ALL },
            { kind: 'pause', ms: 300 },
            { kind: 'scrollTo', selector: ANNIVERSARIES, offsetTop: 160 },
          ],
          highlight: ANNIVERSARIES,
        },
        milestones: {
          // Unfold the panel before scrolling to it, so its list pushes the
          // Red Vote block out of the frame.
          steps: [
            { kind: 'click', selector: MILESTONES_SUMMARY },
            { kind: 'pause', ms: 300 },
            { kind: 'scrollTo', selector: MILESTONES_SUMMARY, offsetTop: 160 },
          ],
          highlight: MILESTONES,
        },
        podium: {
          steps: [
            { kind: 'click', selector: MENU },
            { kind: 'pause', ms: 400 },
            { kind: 'click', selector: CLUBS },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: PODIUM, offsetTop: 160 },
          ],
          highlight: PODIUM,
        },
        race: {
          steps: [
            { kind: 'scrollTo', selector: DISTINGUISHED_TILE, offsetTop: 300 },
            { kind: 'click', selector: DISTINGUISHED_TILE },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: RACE_ROW, offsetTop: 400 },
          ],
          highlight: RACE_ROW,
        },
        standing: {
          steps: [
            { kind: 'click', selector: RACE_ROW },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: STANDING, offsetTop: 160 },
          ],
          highlight: STANDING,
        },
        awards: {
          steps: [
            { kind: 'click', selector: MENU },
            { kind: 'pause', ms: 400 },
            { kind: 'click', selector: AWARDS },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: EXTENSION_AWARD, offsetTop: 120 },
          ],
          highlight: EXTENSION_AWARD,
        },
      },
    },
  },
  music: DEFAULT_MUSIC,
}
