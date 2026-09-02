import { test, expect, type Page } from '@playwright/test'

/* KPI bullet-card tier-scale legibility tripwire (#1517).
 *
 * Reported 2026-09-02 with a screenshot, reproducing in every district: the
 * four tier markers under each District Overview KPI bullet bar printed their
 * short labels as one run-together word (`DSPSm`) and their values on top of
 * one another (`5,0 4553,357` / `9,466`).
 *
 * Root cause is layout, not scale. Each tier rendered as an absolutely
 * positioned stack centred on its own value with `translateX(-50%)` and NO
 * width budget, so the boxes are as wide as their text and free to overlap.
 * With the live D61 Membership Payments numbers (2026-08-31: current 2,274,
 * D 5,945 / S 6,063 / P 6,181 / Sm 6,357) the #558 zoom scale puts the four
 * ticks at 83.42% / 86.10% / 88.78% / 92.78% — a 9.36% span. On the 2-column
 * mobile card grid that is ~12px of bar for four ~30px value labels.
 *
 * Do NOT "fix" this by re-tuning the scale: #558's comment in KpiBulletCard
 * explains why the scale is what it is, and widening it back towards
 * [0, Smedley] reintroduces the older bug it fixed.
 *
 * Why this shape (lessons 108 / 134 / 138, and the #1405 tooltip guard):
 *  - Real geometry, not class names or DOM order. The markup already looks
 *    correct on `main` — only the pixels are wrong, so a JSDOM assertion that
 *    cannot see layout passes on the broken code and proves nothing. Every
 *    assertion here reads `getBoundingClientRect()` from a real engine.
 *  - Abutting counts as broken, not just overlapping. `DSPSm` is four boxes
 *    with a ZERO gap, which an overlap-only test would wave through. Text
 *    sharing a row must be separated by at least MIN_GAP_PX.
 *  - Text-bearing elements only. A bare tick mark is 1px wide and legitimately
 *    sits 3px from its neighbour; it is the *labels* that need room. Filtering
 *    on "has visible text" makes the guard survive any layout that keeps ticks
 *    as marks and moves the text elsewhere, without weakening it.
 *  - Non-vacuous: each card must still expose four tier readouts and each must
 *    still contain a number, so deleting the values cannot make it pass.
 *  - Both reported-shape cases: a district far below Distinguished (D61 today)
 *    and one that has achieved Smedley on all three metrics (D122 at the close
 *    of PY 2025-26, where the marker pins to 100% and `allAchieved` collapses
 *    maxScale onto `current`).
 *  - Every viewport in the acceptance set (375 / 768 / 1350), both themes,
 *    both engines (#710) via the two playwright.config projects.
 */

const VIEWPORTS = [
  { label: '375px', width: 375, height: 812 },
  { label: '768px', width: 768, height: 1024 },
  { label: '1350px', width: 1350, height: 900 },
]

const THEMES = ['light', 'dark'] as const

const KPI_CARD = '[data-testid="kpi-bullet-card"]'
/** Matches the tick marks AND any tier readout, on either side of the fix. */
const TIER_EL = '[data-testid^="tier-"]'

/** Cards carrying a bullet bar: Paid Clubs, Membership Payments, Dist. Clubs. */
const BULLET_CARDS = 3
const TIERS_PER_CARD = 4

/** A space at the 12px tier type is ~3.3px; below 4px the run-together starts. */
const MIN_GAP_PX = 4

interface Box {
  testid: string
  text: string
  left: number
  right: number
  top: number
  bottom: number
}

interface CardBoxes {
  title: string
  cardLeft: number
  cardRight: number
  /** Tier elements that actually render text — the ones needing room. */
  labels: Box[]
  /** Tier elements with no text — bare tick marks. */
  marks: Box[]
}

async function load(page: Page, route: string, theme: string): Promise<void> {
  // DarkModeContext reads localStorage['theme'] before first paint.
  await page.addInitScript(t => {
    window.localStorage.setItem('theme', t as string)
  }, theme)
  await page.goto(route, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
}

async function readCards(page: Page): Promise<CardBoxes[]> {
  return page.$$eval(
    '[data-testid="kpi-bullet-card"]',
    (cards, sel: string) => {
      const measure = (el: Element) => {
        const r = el.getBoundingClientRect()
        const round = (n: number) => Math.round(n * 10) / 10
        return {
          testid: el.getAttribute('data-testid') ?? '?',
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
          left: round(r.left),
          right: round(r.right),
          top: round(r.top),
          bottom: round(r.bottom),
        }
      }
      return cards
        .map(card => {
          const rect = card.getBoundingClientRect()
          const all = Array.from(card.querySelectorAll(sel)).map(measure)
          return {
            title: card.querySelector('h3')?.textContent?.trim() ?? '?',
            cardLeft: Math.round(rect.left * 10) / 10,
            cardRight: Math.round(rect.right * 10) / 10,
            labels: all.filter(b => b.text.length > 0),
            marks: all.filter(b => b.text.length === 0),
          }
        })
        .filter(c => c.labels.length + c.marks.length > 0)
    },
    TIER_EL
  )
}

function describe(b: Box): string {
  return `${b.testid} "${b.text}" x[${b.left}, ${b.right}] y[${b.top}, ${b.bottom}]`
}

/** True when two boxes share vertical space, i.e. sit on the same visual row. */
function sharesRow(a: Box, b: Box): boolean {
  return a.top < b.bottom && b.top < a.bottom
}

function horizontalGap(a: Box, b: Box): number {
  return a.left <= b.left ? b.left - a.right : a.left - b.right
}

function collisions(boxes: Box[], minGap: number): string[] {
  const found: string[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i] as Box
      const b = boxes[j] as Box
      if (!sharesRow(a, b)) continue
      const gap = horizontalGap(a, b)
      if (gap < minGap) {
        found.push(
          `gap ${gap.toFixed(1)}px (< ${minGap}px) between ${describe(a)} and ${describe(b)}`
        )
      }
    }
  }
  return found
}

function assertLegibleTierScale(cards: CardBoxes[], where: string): void {
  expect(
    cards.length,
    `${where}: found ${cards.length} bullet-bar cards, expected ${BULLET_CARDS} — ` +
      'the KPI strip did not render, so this guard measured nothing'
  ).toBe(BULLET_CARDS)

  for (const card of cards) {
    const at = `${where} / ${card.title}`

    // Non-vacuity: four tier readouts must survive, each carrying its value.
    expect(
      card.labels.length,
      `${at}: ${card.labels.length} tier readouts, expected ${TIERS_PER_CARD} — ` +
        `[${card.labels.map(describe).join('; ')}]`
    ).toBe(TIERS_PER_CARD)
    for (const label of card.labels) {
      expect(
        label.text,
        `${at}: tier readout ${describe(label)} lost its threshold value`
      ).toMatch(/\d/)
    }

    // The defect: text sharing a row with no room between the boxes.
    expect(
      collisions(card.labels, MIN_GAP_PX),
      `${at}: tier readouts collide`
    ).toEqual([])

    // Bare tick marks may sit close together, but must not overlap.
    expect(collisions(card.marks, 0), `${at}: tier ticks overlap`).toEqual([])

    // The mirror trap: pushing the text apart must not push it off the card.
    const overflowing = card.labels.filter(
      b => b.left < card.cardLeft - 0.5 || b.right > card.cardRight + 0.5
    )
    expect(
      overflowing.map(describe),
      `${at}: tier readouts overflow the card [${card.cardLeft}, ${card.cardRight}]`
    ).toEqual([])
  }
}

for (const theme of THEMES) {
  for (const { label, width, height } of VIEWPORTS) {
    /* The reported case: D61, every metric far below Distinguished, so the
       zoom scale must stretch down to `current` and the four tiers crowd into
       the top ~9% of the bar. */
    test(`KPI tier readouts stay legible far below Distinguished — ${label} ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height })
      await load(page, '/district/61', theme)
      await page
        .locator(KPI_CARD)
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 })
      expect(
        await page.getAttribute('html', 'data-theme'),
        'theme did not apply — measured the wrong appearance'
      ).toBe(theme)

      assertLegibleTierScale(await readCards(page), `${label}/${theme} D61`)
    })
  }
}

/* The other end of the data range: a district that has achieved Smedley on all
   three metrics, where `allAchieved` collapses maxScale onto `current` and the
   marker pins to 100%. D122 finished PY 2025-26 over Smedley on paid clubs,
   payments and distinguished clubs, so selecting that program year reproduces
   it from live data rather than a stub. Light theme only: the theme axis is
   swept above, and nothing in a box's geometry depends on its colour. */
for (const { label, width, height } of VIEWPORTS) {
  test(`KPI tier readouts stay legible with Smedley achieved — ${label}`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height })
    // ProgramYearContext reads localStorage['selectedProgramYear'].
    await page.addInitScript(() => {
      window.localStorage.setItem('selectedProgramYear', '2025')
    })
    await load(page, '/district/122', 'light')
    await page
      .locator(KPI_CARD)
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })

    // Non-vacuity: this test is only about the achieved branch, so prove we
    // actually landed on it before measuring.
    const achieved = page.locator(
      '[data-testid="current-marker"][data-all-achieved="true"]'
    )
    await expect(
      achieved.first(),
      `${label}: D122 PY 2025-26 did not render an all-tiers-achieved marker — ` +
        'the achieved branch was not exercised'
    ).toBeVisible({ timeout: 30_000 })

    assertLegibleTierScale(
      await readCards(page),
      `${label}/light D122 achieved`
    )
  })
}
