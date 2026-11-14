import { test, expect, type Page } from './fixtures/test'

/* Held below-fold cards keep their height when they load (#2575, #2616).
 *
 * The trophy case and the growth card hold their reads, and show a still
 * placeholder, until their slot nears the viewport (#2513). When the read
 * lands the slot swaps the placeholder for the card. One box rule covers the
 * cards at every width and scheme: the slot's height must not change by more
 * than MAX_SHIFT_PX when it loads. Below that, the swap is not a visible
 * jump for a reader scrolling the page (Safari's anchoring, in particular).
 *
 * Measured on D61 against prod (#2575): the growth card's placeholder is within
 * 17px of the loaded card at 375, 768 and 1280 (-10, -4, +17), inside the
 * issue's 24px bar, so this guards it rather than fixing it. The trophy case
 * was 117px taller at 375 and 67px at 768 (#2616): it reserved the expanded
 * prerequisite checklist, and D61 meets every prerequisite and loads collapsed.
 */

const MAX_SHIFT_PX = 20
const WIDTHS = [375, 768, 1280] as const
const HEIGHTS = [700, 400, 200] as const
const SLOTS = [
  {
    slot: 'trophy-case-slot',
    held: 'distinguished-trophy-held',
    loading: 'distinguished-trophy-skeleton',
  },
  {
    slot: 'growth-slot',
    held: 'club-growth-held',
    loading: 'club-growth-achievement-skeleton',
  },
] as const

async function slotHeight(page: Page, slot: string): Promise<number> {
  return page.evaluate(
    id =>
      document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect()
        .height ?? -1,
    slot
  )
}

/* The latest snapshot, and a date early in the program year (#2616 review):
 * prerequisites are unmet for nearly every district from July to about
 * September (2026-08-15: 0 of 94 met), so the trophy card loads with its
 * checklist expanded and the placeholder must already have reserved it. */
const ROUTES = [
  { name: 'latest', url: '/district/61', schemes: ['light', 'dark'] as const },
  {
    name: 'early year, 2026-08-15',
    url: '/district/61?date=2026-08-15',
    schemes: ['light'] as const,
  },
] as const

for (const { name, url, schemes } of ROUTES) {
  for (const scheme of schemes) {
    for (const width of WIDTHS) {
      test(`held cards load within ${MAX_SHIFT_PX}px of their placeholder (D61 ${name}, ${width}px, ${scheme})`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme: scheme })

        const shifts: string[] = []
        const compared = new Set<string>()
        // A slot already inside the near-viewport margin never shows its
        // placeholder, so there is nothing to compare. Shrink the viewport
        // (the margin is fixed, the band is not) and reload until it is held,
        // so no slot is silently skipped (#2575 review).
        for (const height of HEIGHTS) {
          if (compared.size === SLOTS.length) break
          await page.setViewportSize({ width, height })
          await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 60_000,
          })
          await page.evaluate(() => document.fonts.ready.then(() => undefined))

          // Every placeholder's height first: scrolling to one card can load the
          // other, and the other's "before" must be the held one.
          const befores = new Map<string, number>()
          for (const { slot, held } of SLOTS) {
            if (compared.has(slot)) continue
            const placeholder = page.locator(
              `[data-testid="${slot}"] [data-testid="${held}"]`
            )
            if ((await placeholder.count()) > 0) {
              befores.set(slot, await slotHeight(page, slot))
            }
          }
          for (const { slot, held, loading } of SLOTS) {
            const before = befores.get(slot)
            if (before === undefined) continue // near at this height; retry smaller
            const placeholder = page.locator(
              `[data-testid="${slot}"] [data-testid="${held}"]`
            )
            for (let i = 0; i < 10 && (await placeholder.count()) > 0; i++) {
              await page.evaluate(id => {
                document
                  .querySelector(`[data-testid="${id}"]`)
                  ?.scrollIntoView({ behavior: 'instant', block: 'center' })
              }, slot)
              await page.waitForTimeout(700)
            }
            expect(await placeholder.count(), `${slot} never loaded`).toBe(0)
            // Held gone is not loaded: the loading skeleton (same geometry)
            // stands in until the read lands. Measure the card, not it.
            await expect(
              page.locator(
                `[data-testid="${slot}"] [data-testid="${loading}"]`
              ),
              `${slot} still loading`
            ).toHaveCount(0, { timeout: 30_000 })
            const after = await slotHeight(page, slot)
            console.log(
              `${width}x${height} ${scheme} ${slot}: ${before} -> ${after}`
            )
            compared.add(slot)
            if (Math.abs(after - before) > MAX_SHIFT_PX) {
              shifts.push(
                `${slot} placeholder ${before}px vs loaded ${after}px`
              )
            }
          }
        }
        // The run must have compared every slot, or it proves nothing.
        expect(
          SLOTS.map(s => s.slot).filter(slot => !compared.has(slot)),
          'slots never held at any viewport height, so never compared'
        ).toEqual([])
        expect(shifts, shifts.join('; ')).toEqual([])
      })
    }
  }
}
