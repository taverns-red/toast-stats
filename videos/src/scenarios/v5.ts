import { DEFAULT_MUSIC } from './music'
import type { Scenario } from './types'

/**
 * V5 — "The club growth funnel" (Club Growth Director).
 *
 * Storyboard: .routine-tmp/video-scenarios-2026-10-25.md §4 V5, on District
 * 114 (§2: 12 charters with sponsor and mentor counts, 6 prospective clubs),
 * as captured on 2026-10-27 (v2.72.0):
 *
 *   - Ron (PR #2356): show the way to the view. The clip opens on the
 *     district Overview and taps Growth (the subnav on desktop, the bottom
 *     bar's More sheet on a phone); the closing card gives the deep link,
 *     `/district/114/growth`, with a hint. The site drops `?date=` when the
 *     tab changes, so the funnel shows the latest snapshot; the captions
 *     name no numbers.
 *   - Beat 4 lands on "Sponsors and mentors": its table repeats each new
 *     club's charter date next to the counts, so one screen shows both.
 *   - Beat 6 opens D114's own survival page (the link on its growth page),
 *     not D86's, so the clip stays in one district.
 *   - Prospective clubs link out to toastmasters.org (they have no page
 *     here yet); the clip never clicks them.
 *
 * Captions state what is shown, not counts, so they survive the data moving.
 *
 * Mobile (390×844): the funnel stacks into four rows, the lists are stacked
 * rows, and a section bar covers the bottom ~56 px, so targets scroll high.
 */
/** Ron (PR #2356): show the way to the view from a page the viewer knows. */
const DESKTOP_TAB = '[data-testid="district-subnav"] a:has-text("Growth")'
const MORE = 'nav.section-bar button:has-text("More")'
const MOBILE_LINK = '[role="dialog"] a.section-sheet__link:has-text("Growth")'
export const v5: Scenario = {
  id: 'v5',
  role: 'Club Growth Director',
  url: 'https://ts.taverns.red/district/114?date=2026-10-24',
  fps: 30,
  durationSec: 33,
  titleCard: {
    startSec: 0,
    endSec: 3,
    caption: 'Prospective → chartered → coached → suspended. One page.',
  },
  beats: [
    {
      id: 'open',
      startSec: 3,
      endSec: 6,
      caption: 'From your district page, open Growth.',
    },
    {
      id: 'funnel',
      startSec: 6,
      endSec: 11,
      caption: "Your pipeline this program year, from TI's daily reports.",
    },
    {
      id: 'prospective',
      startSec: 11,
      endSec: 16,
      caption: 'Who has waited longest, and who has paid.',
    },
    {
      id: 'sponsors',
      startSec: 16,
      endSec: 21,
      caption:
        'Every charter dated; sponsors and mentors counted, never named.',
    },
    {
      id: 'coached',
      startSec: 21,
      endSec: 25,
      caption: 'Coached clubs and how long the coach has been in.',
    },
    {
      id: 'survival',
      startSec: 25,
      endSec: 30,
      caption: 'Of the clubs you charter, how many survive five years?',
    },
  ],
  closing: {
    startSec: 30,
    endSec: 33,
    caption: 'Club Growth Directors: ts.taverns.red/district/114/growth',
    hint: '114 = your district number',
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
        funnel: {
          steps: [
            { kind: 'click', selector: DESKTOP_TAB },
            { kind: 'pause', ms: 400 },
            {
              kind: 'scrollTo',
              selector: '.survival-entry__link',
              offsetTop: 72,
            },
          ],
          highlight: '.growth-funnel',
        },
        prospective: {
          steps: [
            {
              kind: 'scrollTo',
              selector: '#growth-prospective',
              offsetTop: 64,
            },
          ],
          highlight: '[data-testid="growth-prospective-table"]',
        },
        sponsors: {
          steps: [
            {
              kind: 'scrollTo',
              selector: '[data-testid="growth-sponsors"]',
              offsetTop: 64,
            },
          ],
          highlight: '[data-testid="growth-sponsors-table"]',
        },
        coached: {
          steps: [
            { kind: 'scrollTo', selector: '#growth-coached', offsetTop: 64 },
          ],
          highlight: '[data-testid="growth-coached-table"]',
        },
        survival: {
          steps: [
            {
              kind: 'scrollTo',
              selector: '.survival-entry__link',
              offsetTop: 200,
            },
            { kind: 'click', selector: '.survival-entry__link' },
            { kind: 'pause', ms: 300 },
            {
              kind: 'scrollTo',
              selector: '.survival-page__title',
              offsetTop: 64,
            },
          ],
          highlight: '.survival-figure',
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
        funnel: {
          steps: [
            { kind: 'click', selector: MOBILE_LINK },
            { kind: 'pause', ms: 400 },
            { kind: 'scrollTo', selector: '.growth-funnel', offsetTop: 96 },
          ],
          highlight: '.growth-funnel',
        },
        prospective: {
          steps: [
            {
              kind: 'scrollTo',
              selector: '#growth-prospective',
              offsetTop: 96,
            },
          ],
          highlight: '[data-testid="growth-prospective-table"]',
        },
        sponsors: {
          steps: [
            {
              kind: 'scrollTo',
              selector: '[data-testid="growth-sponsors"]',
              offsetTop: 360,
            },
          ],
          // The phone's sponsor rows carry no dates, so centre the window on
          // the counts-only note: the dated charter rows sit just above it.
          highlight: '[data-testid="growth-sponsors"] .growth-stage__note',
        },
        coached: {
          steps: [
            { kind: 'scrollTo', selector: '#growth-coached', offsetTop: 96 },
          ],
          highlight: '#growth-coached .mobile-row-list__rows',
        },
        survival: {
          steps: [
            {
              kind: 'scrollTo',
              selector: '.survival-entry__link',
              offsetTop: 200,
            },
            { kind: 'click', selector: '.survival-entry__link' },
            { kind: 'pause', ms: 300 },
            { kind: 'scrollTo', selector: '.survival-kpis', offsetTop: 96 },
          ],
          highlight: '.survival-kpis',
        },
      },
    },
  },
  music: DEFAULT_MUSIC,
}
