import { DEFAULT_MUSIC } from './music'
import type { Scenario } from './types'

/**
 * V16 — "Everything is a link" (Webmaster, District PR Manager; also the
 * Administration Manager, the IPDD and any role that writes minutes).
 *
 * Storyboard: .routine-tmp/video-scenarios-2026-10-25.md §4 V16, on District
 * 86 (§2), adapted to the live site as checked on 2026-10-27 (v2.73.0):
 *
 *   - Ron (PR #2356): the clip opens on the district Overview and taps Clubs;
 *     the closing card gives a dated deep link,
 *     `/district/86/clubs?date=2026-09-30`, with a hint.
 *   - The storyboard applied the preset first and then the date. On the live
 *     site, changing the date clears the preset chip (the URL keeps
 *     `preset=`, the table does not), so the clip picks the date first and
 *     then the preset; both stay in the link.
 *   - "Share" is the header's "⋯ → Copy link" (the page-options sheet on a
 *     phone). A capture cannot show the address bar, so the beat ends on the
 *     "Link copied" confirmation; the capture grants clipboard access so the
 *     confirmation appears.
 *   - History, How it works and the MCP page are reached from the site menu
 *     and the footer, because a capture cannot type a URL. The rule-change
 *     beat uses the Methodology page's table of contents.
 *   - The storyboard's captions quoted dates ("Sep 30", "June 30", "since
 *     2016", "eight tools"); they now say what is shown. Its closing line
 *     ("MIT-licensed · not affiliated…") is already in the site footer.
 *
 * Mobile (390×844): the date and Copy link live in the page-options sheet
 * behind the context chip, the preset is a chip in the Filter sheet, and the
 * site menu (with the footer links under "About") is behind the hamburger.
 */
const DESKTOP_CLUBS_TAB = '[data-testid="district-subnav"] a:has-text("Clubs")'
const MOBILE_CLUBS_TAB = 'nav.section-bar a:has-text("Clubs")'
const DESKTOP_DATE = '[data-testid="date-chip-select"]'
const PRESET = 'button.clubs-preset-chip'
const ACTIONS = 'button.header-actions-menu__trigger'
const COPY_LINK = '.header-actions-menu__item:has-text("Copy link")'
const COPIED = '.header-actions-menu__status'
const CONTEXT_CHIP = '[data-testid="context-bar-chip"]'
const SHEET_DATE = '[data-testid="context-sheet-date"]'
const SHEET_COPY = 'button.context-sheet__action:has-text("Copy link")'
const SHEET_CLOSE = '[role="dialog"] button.bottom-sheet__close'
const FILTER = 'button.clubs-filters-trigger:has-text("Filter")'
const SHEET_PRESET =
  'button.filter-sheet__chip:has-text("Close to Distinguished")'
const SHEET_APPLY = 'button.filter-sheet__apply'
const MENU = 'button.app-shell-nav-toggle'
const HISTORY = '.app-shell-nav__link:has-text("History")'
const HOW_IT_WORKS = '.app-shell-nav__link:has-text("How it works")'
const FROZEN_YEAR = 'main :text("Final · frozen")'
const RULES_TOC = 'a.methodology-toc__link[href="#program-year-rule-changes"]'
const RULES = '#program-year-rule-changes'
const MCP_LINK = 'a.app-shell-footer__link:has-text("MCP server")'
// On a phone the footer links sit in the site menu's "About" section.
const ABOUT = 'details.app-shell-nav-about > summary'
const MOBILE_MCP_LINK = 'details.app-shell-nav-about a[href="/mcp"]'
const MCP_TOOLS = 'main h2:has-text("The eight tools")'

export const v16: Scenario = {
  id: 'v16',
  role: 'Webmaster · District PR Manager',
  url: 'https://ts.taverns.red/district/86?date=2026-10-24',
  fps: 30,
  durationSec: 34,
  titleCard: {
    startSec: 0,
    endSec: 3,
    caption: 'No login. Every view is a link you can share.',
  },
  beats: [
    {
      id: 'open',
      startSec: 3,
      endSec: 6,
      caption: 'From your district page, open Clubs.',
    },
    {
      id: 'date',
      startSec: 6,
      endSec: 10,
      caption: 'Pin any snapshot date, reproducible for the minutes.',
    },
    {
      id: 'preset',
      startSec: 10,
      endSec: 13,
      caption: 'Add a filter. The link carries it too.',
    },
    {
      id: 'copy',
      startSec: 13,
      endSec: 17,
      caption: 'Copy link: paste it in the minutes or the newsletter.',
    },
    {
      id: 'history',
      startSec: 17,
      endSec: 21,
      caption: 'History: year-end standings, frozen when each year closes.',
    },
    {
      id: 'rules',
      startSec: 21,
      endSec: 26,
      caption: 'When TI changes a rule, the site says what compares.',
    },
    {
      id: 'mcp',
      startSec: 26,
      endSec: 31,
      caption: 'Ask an AI assistant the same numbers, with sources.',
    },
  ],
  closing: {
    startSec: 31,
    endSec: 34,
    caption:
      'Every view is a link: ts.taverns.red/district/86/clubs?date=2026-09-30',
    hint: '86 = your district number; the date pins the snapshot',
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
        date: {
          steps: [
            { kind: 'click', selector: DESKTOP_CLUBS_TAB },
            { kind: 'pause', ms: 800 },
            { kind: 'select', selector: DESKTOP_DATE, value: '2026-09-30' },
            { kind: 'pause', ms: 600 },
          ],
          highlight: DESKTOP_DATE,
        },
        preset: {
          steps: [{ kind: 'click', selector: PRESET }],
          highlight: PRESET,
        },
        copy: {
          steps: [
            { kind: 'click', selector: ACTIONS },
            { kind: 'pause', ms: 700 },
            { kind: 'click', selector: COPY_LINK },
          ],
          highlight: COPIED,
        },
        history: {
          steps: [
            { kind: 'click', selector: HISTORY },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: FROZEN_YEAR, offsetTop: 300 },
          ],
          highlight: FROZEN_YEAR,
        },
        rules: {
          steps: [
            { kind: 'click', selector: HOW_IT_WORKS },
            { kind: 'pause', ms: 800 },
            { kind: 'click', selector: RULES_TOC },
            { kind: 'pause', ms: 600 },
            { kind: 'scrollTo', selector: RULES, offsetTop: 96 },
          ],
          highlight: RULES,
        },
        mcp: {
          steps: [
            { kind: 'click', selector: MCP_LINK },
            { kind: 'pause', ms: 800 },
            { kind: 'scrollTo', selector: MCP_TOOLS, offsetTop: 96 },
          ],
          highlight: MCP_TOOLS,
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
        date: {
          steps: [
            { kind: 'click', selector: MOBILE_CLUBS_TAB },
            { kind: 'pause', ms: 600 },
            { kind: 'click', selector: CONTEXT_CHIP },
            { kind: 'pause', ms: 400 },
            { kind: 'select', selector: SHEET_DATE, value: '2026-09-30' },
            { kind: 'pause', ms: 500 },
          ],
          highlight: SHEET_DATE,
        },
        preset: {
          steps: [
            { kind: 'click', selector: SHEET_CLOSE },
            { kind: 'pause', ms: 300 },
            { kind: 'click', selector: FILTER },
            { kind: 'pause', ms: 400 },
            { kind: 'click', selector: SHEET_PRESET },
            { kind: 'pause', ms: 300 },
            { kind: 'click', selector: SHEET_APPLY },
          ],
          highlight: FILTER,
        },
        copy: {
          steps: [
            { kind: 'click', selector: CONTEXT_CHIP },
            { kind: 'pause', ms: 600 },
            { kind: 'click', selector: SHEET_COPY },
            // Hold on "Link copied", then close the sheet here so the
            // History beat has its full length for the menu.
            { kind: 'pause', ms: 1300 },
            { kind: 'click', selector: SHEET_CLOSE },
          ],
          // The sheet is closed by now; point at the chip that opens it.
          highlight: CONTEXT_CHIP,
        },
        history: {
          steps: [
            { kind: 'click', selector: MENU },
            { kind: 'pause', ms: 400 },
            { kind: 'click', selector: HISTORY },
            { kind: 'pause', ms: 600 },
            { kind: 'scrollTo', selector: FROZEN_YEAR, offsetTop: 300 },
          ],
          highlight: FROZEN_YEAR,
        },
        rules: {
          steps: [
            { kind: 'click', selector: MENU },
            { kind: 'pause', ms: 400 },
            { kind: 'click', selector: HOW_IT_WORKS },
            { kind: 'pause', ms: 800 },
            { kind: 'click', selector: RULES_TOC },
            { kind: 'pause', ms: 600 },
            { kind: 'scrollTo', selector: RULES, offsetTop: 120 },
          ],
          highlight: RULES,
        },
        mcp: {
          steps: [
            { kind: 'click', selector: MENU },
            { kind: 'pause', ms: 400 },
            { kind: 'click', selector: ABOUT },
            { kind: 'pause', ms: 300 },
            { kind: 'click', selector: MOBILE_MCP_LINK },
            { kind: 'pause', ms: 600 },
            // The MCP page's sections are folded on a phone.
            { kind: 'click', selector: MCP_TOOLS },
            { kind: 'pause', ms: 300 },
            { kind: 'scrollTo', selector: MCP_TOOLS, offsetTop: 120 },
          ],
          highlight: MCP_TOOLS,
        },
      },
    },
  },
  music: DEFAULT_MUSIC,
}
