import type { Page } from '../fixtures/test'

/* Shared 375 measurements (#1841). Extracted unchanged from
 * touch-targets.smoke.ts (#887, #1839) and type-floor.smoke.ts (#1840) so the
 * mobile gate (mobile-375-gate.smoke.ts) measures targets and text exactly
 * the way those guards do, rather than with a second, drifting copy.
 * Helpers live outside `*.smoke.ts` so importing them registers no tests.
 */

/* #1839: inline links that are NOT prose. The WCAG inline exemption is for a
 * link inside a running sentence. These are row/heading/list links, a
 * sentence's closing call to action, or a standalone "Methodology"-style
 * link that the prod sweep (2.48.0) measured at 17–23px tall. They must clear
 * the floor even when they render `display: inline`. Presence is not required
 * (a route may not render every family); size is, when they do render. */
export const NOT_PROSE_LINKS = [
  '.awards-page-card__district', // /awards district links (13×18)
  '.changes-group__item a', // /district/61/changes club rows (22px)
  '.clubs-section__title a', // /clubs tier headings "Distinguished →" (22px)
  '.race-podium__district', // /clubs podium district pills (40×23)
  '.districts-methodology-callout__link', // landing / awards / history "Methodology"
  // Divisions "How it works" (65×17). Scoped to the criteria source line, as
  // in tap-targets.css: a bare `.methodology-link` also matched the prose
  // links in /methodology and /mcp body copy, which the 844×390 run (#2017)
  // measured because the sections that hide them at 375 are open there.
  '.ddp-criteria__source .methodology-link',
  '.wws__link', // history worldwide scoreboard methodology link
  '.race-basis a[href^="/methodology"]', // /clubs + race pages "Methodology" (79×21)
  '.worldwide-standing__note a', // club page "Clubs worldwide" (120×18)
  '.club-history-page__back a', // club history "← Back to …" (17px)
  '.club-history-year-link', // club history year links (64×21)
  '[data-testid="district-csp-line"] a', // Overview "See which clubs →" (17px)
  '[data-testid="gap-tile-link"] a', // #2390 trophy case "How we count"
  '[data-testid="division-area-heading"] a', // division page area links (22px)
  '[data-testid="education-awards-leaderboard"] td a', // analytics club link (61×37)
  '.maplibregl-ctrl-attrib a', // #1944 map ODbL credit links (14px tall)
  '.app-shell-footer__link', // #2017 footer meta links (17px at 844×390)
]

export interface Finding {
  tag: string
  testid: string | null
  aria: string | null
  cls: string
  w: number
  h: number
  /** The allowlist selector this element matches, if any (#1841). */
  allowedBy?: string
}

export async function measureInteractiveTargets(
  page: Page,
  selectors: readonly string[],
  notProse: readonly string[],
  allowlist: readonly string[] = []
): Promise<Finding[]> {
  return page.evaluate(
    ([sels, notProseSels, allowSels]) => {
      const els = Array.from(document.querySelectorAll(sels.join(', ')))
      const out: Finding[] = []
      for (const el of els as HTMLElement[]) {
        const cs = getComputedStyle(el)
        // Mirror the product's own visibility filter (getAllInteractiveElements).
        if (cs.display === 'none' || cs.visibility === 'hidden') continue
        const rect = el.getBoundingClientRect()
        // sr-only collapsed / zero-box: not a real tap target (see header).
        if (rect.width <= 1 || rect.height <= 1) continue
        const tag = el.tagName.toLowerCase()
        // WCAG 2.5.5 inline-prose-link exemption — but not for the #1839
        // families above, which are inline in markup but not in a sentence.
        const inlineProseLink =
          tag === 'a' &&
          cs.display === 'inline' &&
          el.getAttribute('role') !== 'button' &&
          !notProseSels.some(s => el.matches(s))
        if (inlineProseLink) continue
        out.push({
          tag,
          testid: el.getAttribute('data-testid'),
          aria: el.getAttribute('aria-label'),
          cls: (el.getAttribute('class') || '').slice(0, 90),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          allowedBy: allowSels.find(s => el.matches(s)),
        })
      }
      return out
    },
    [selectors, notProse, allowlist] as const
  )
}

export function describeTarget(f: Finding): string {
  const id = f.testid
    ? `[data-testid="${f.testid}"]`
    : f.aria
      ? `[aria-label="${f.aria}"]`
      : f.cls
        ? `.${f.cls.split(/\s+/).slice(0, 2).join('.')}`
        : ''
  return `${f.tag}${id} ${f.w}×${f.h}`
}

export interface TextStats {
  total: number
  under14: number
  offenders: string[] // grouped "<px>px <el> ×n "sample"" for < 14px
  belowFloor: string[] // same, for < HARD_FLOOR_PX
}

export async function measureText(
  page: Page,
  floor: number
): Promise<TextStats> {
  return page.evaluate(floorPx => {
    const groups = new Map<string, { n: number; chars: number; ex: string }>()
    const below = new Map<string, number>()
    let total = 0
    let under14 = 0
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    )
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent || '').trim()
      if (!text) continue
      const el = n.parentElement
      if (!el) continue
      const cs = getComputedStyle(el)
      if (
        cs.display === 'none' ||
        cs.visibility === 'hidden' ||
        cs.opacity === '0'
      )
        continue
      const r = el.getBoundingClientRect()
      if (r.width <= 1 || r.height <= 1) continue // sr-only / collapsed
      const px = parseFloat(cs.fontSize)
      total += text.length
      if (px >= 14) continue
      under14 += text.length
      const cls = (el.getAttribute('class') || '')
        .split(/\s+/)
        .slice(0, 2)
        .join('.')
      const key = `${Math.round(px * 10) / 10}px ${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`
      const g = groups.get(key) || { n: 0, chars: 0, ex: text.slice(0, 24) }
      g.n++
      g.chars += text.length
      groups.set(key, g)
      if (px < floorPx) below.set(key, (below.get(key) || 0) + 1)
    }
    const fmt = ([k, g]: [string, { n: number; chars: number; ex: string }]) =>
      `${k} ×${g.n} (${g.chars}c) "${g.ex}"`
    const sorted = [...groups.entries()].sort((a, b) => b[1].chars - a[1].chars)
    return {
      total,
      under14,
      offenders: sorted.slice(0, 12).map(fmt),
      belowFloor: sorted.filter(([k]) => below.has(k)).map(fmt),
    }
  }, floor)
}
