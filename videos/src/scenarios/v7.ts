import { DEFAULT_MUSIC } from './music'
import type { Scenario } from './types'

/**
 * V7 — "Education awards, this year to date" (Program Quality Director).
 *
 * Storyboard: .routine-tmp/video-scenarios-2026-10-25.md §4 V7, on District
 * 86 (§2), adapted to the live site as checked on 2026-10-27 (v2.72.0):
 *
 *   - Ron (PR #2356): show the way to the view. The clip opens on the
 *     district Overview and taps Education (the subnav on desktop, the
 *     bottom bar's More sheet on a phone); the closing card gives the deep
 *     link, `/district/86/education`, with a hint.
 *   - "By path" (`?by=path`) swaps the level bars for one bar per path; the
 *     level × path matrix is its own section (a sheet behind "Open matrix"
 *     on a phone), so beat 4 shows the path bars, which answer the caption.
 *   - Leaderboards are a section (`#leaderboards`), not a link, so beat 6
 *     scrolls to it.
 *   - The storyboard's closing ("Source: TI's Education Achievements
 *     report, refreshed daily") gives way to the deep link; the source line
 *     is on screen above the KPIs in beat 2.
 *   - The site drops `?date=` when the tab changes, so the page shows the
 *     latest snapshot; the captions name no numbers.
 *
 * Mobile (390×844): the app bar and district bar stay pinned (~100 px), so
 * scroll targets sit 120 px down; the rollup is a short table with a column
 * picker.
 */
const DESKTOP_TAB = '[data-testid="district-subnav"] a:has-text("Education")'
const MORE = 'nav.section-bar button:has-text("More")'
const MOBILE_LINK =
  '[role="dialog"] a.section-sheet__link:has-text("Education")'
const KPIS = 'ul.education-kpis'
const section = (title: string): string =>
  `section.education-section:has(h2:has-text("${title}"))`
const LEVELS = section('By level')
const PATHS = section('By path')
const ROLLUP = section('By division and area')
const BY_PATH = 'a.education-switch__link:has-text("By path")'
const AREAS = 'a.education-switch__link:has-text("Areas")'
const LEADERBOARD = '#leaderboards [data-testid="education-awards-leaderboard"]'

export const v7: Scenario = {
  id: 'v7',
  role: 'Program Quality Director',
  url: 'https://ts.taverns.red/district/86?date=2026-10-24',
  fps: 30,
  durationSec: 33,
  titleCard: {
    startSec: 0,
    endSec: 3,
    caption: 'Who is earning what: by level, path and area.',
  },
  beats: [
    {
      id: 'open',
      startSec: 3,
      endSec: 6,
      caption: 'From your district page, open Education.',
    },
    {
      id: 'kpis',
      startSec: 6,
      endSec: 11,
      caption: 'Every ledger award this program year, counted once.',
    },
    {
      id: 'levels',
      startSec: 11,
      endSec: 15,
      caption: 'Levels 1–5 and DTMs, so far this year.',
    },
    {
      id: 'paths',
      startSec: 15,
      endSec: 20,
      caption: 'Which paths your members actually choose.',
    },
    {
      id: 'areas',
      startSec: 20,
      endSec: 25,
      caption: 'Awards by division and area: who needs an education push.',
    },
    {
      id: 'leaderboards',
      startSec: 25,
      endSec: 30,
      caption: 'Leaderboards for the newsletter and the DEC.',
    },
  ],
  closing: {
    startSec: 30,
    endSec: 33,
    caption: 'Education awards: ts.taverns.red/district/86/education',
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
        kpis: {
          steps: [
            { kind: 'click', selector: DESKTOP_TAB },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: KPIS, offsetTop: 200 },
          ],
          highlight: KPIS,
        },
        levels: {
          steps: [{ kind: 'scrollTo', selector: LEVELS, offsetTop: 72 }],
          highlight: LEVELS,
        },
        paths: {
          steps: [
            { kind: 'click', selector: BY_PATH },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: PATHS, offsetTop: 72 },
          ],
          highlight: PATHS,
        },
        areas: {
          steps: [
            { kind: 'scrollTo', selector: ROLLUP, offsetTop: 72 },
            { kind: 'pause', ms: 300 },
            { kind: 'click', selector: AREAS },
            { kind: 'pause', ms: 400 },
          ],
          highlight: ROLLUP,
        },
        leaderboards: {
          steps: [{ kind: 'scrollTo', selector: LEADERBOARD, offsetTop: 72 }],
          highlight: LEADERBOARD,
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
        kpis: {
          steps: [
            { kind: 'click', selector: MOBILE_LINK },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: KPIS, offsetTop: 120 },
          ],
          highlight: KPIS,
        },
        levels: {
          steps: [{ kind: 'scrollTo', selector: LEVELS, offsetTop: 120 }],
          highlight: LEVELS,
        },
        paths: {
          steps: [
            { kind: 'click', selector: BY_PATH },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: PATHS, offsetTop: 120 },
          ],
          highlight: PATHS,
        },
        areas: {
          steps: [
            { kind: 'scrollTo', selector: ROLLUP, offsetTop: 120 },
            { kind: 'pause', ms: 300 },
            { kind: 'click', selector: AREAS },
            { kind: 'pause', ms: 400 },
          ],
          highlight: ROLLUP,
        },
        leaderboards: {
          steps: [{ kind: 'scrollTo', selector: LEADERBOARD, offsetTop: 120 }],
          highlight: LEADERBOARD,
        },
      },
    },
  },
  music: DEFAULT_MUSIC,
}
