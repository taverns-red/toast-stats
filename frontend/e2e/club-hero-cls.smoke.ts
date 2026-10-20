import { test, expect, type Page } from './fixtures/test'

/* Club hero layout shift at the hero-first → full render (#2071).
 *
 * ── The regression this guards ───────────────────────────────────────────
 * The club page paints its hero from the district snapshot first (#1901),
 * then re-renders when the club's analytics lands. The analytics-derived
 * status chips (health, DCP tier) wait for that second render; until then a
 * one-chip, size-holding placeholder (~55px) sits in `.club-hero__pills`.
 * From 768px the hero is a row: `.club-hero__intro` is `flex: 1` and the
 * chip column took its content width. The real chips are 79–320px wide
 * ("Thriving" alone up to "Intervention required" + a tier or anniversary
 * chip), so on the full render the chip column widened, the intro narrowed,
 * the h1 / area line / where-it-meets lines re-wrapped and everything below
 * them moved down a line.
 *
 * Measured on local builds against prod data, 768px, unthrottled:
 *   - before #2172: /district/201/club/977 h1 32→64px, CLS 0.006 (0.084 on
 *     prod on 2026-10-15, the issue's figure); the moved sources were
 *     club-meets, club-hero__controls, __sub, __history-link, __pills.
 *   - after #2172 (smaller outline chips, anniversary chip only ±30 days):
 *     977 fits one line either way (CLS 0.0001), so the symptom "went away"
 *     for 977 — but /district/113/club/28678810 still read 0.071 at 1024 and
 *     /district/113/club/2911 0.054 at 768. #2172 shrank the delta; it did
 *     not remove it.
 *
 * The fix reserves the chip column at a fixed width from 768px, so the
 * intro's width cannot depend on which chips analytics brings.
 *
 * ── Method ───────────────────────────────────────────────────────────────
 * Deployed preview (BASE_URL), real data. The club's analytics read is held
 * back so the hero-first render is guaranteed to paint (on a fast network it
 * can land in the same frame, which would make the test vacuous). A
 * requestAnimationFrame sampler records the intro's width and the h1's height
 * on every frame from the first hero paint to the full render; a
 * `layout-shift` observer records CLS and which entries moved hero nodes.
 * The width invariant holds for ANY club, so the test does not depend on a
 * club's current status; the clubs below are the issue's (977) and today's
 * worst case (a 67-character name, "Intervention required").
 *
 * Chromium-only: `layout-shift` is a Chromium API.
 */

const CLUBS = [
  '/district/201/club/977',
  '/district/113/club/28678810',
  '/district/61/club/7238597',
] as const

const WIDTHS = [375, 768, 1024, 1280] as const

const HERO_CLS_BUDGET = 0.01
const PAGE_CLS_BUDGET = 0.05
const ANALYTICS_HOLD_MS = 1_500

interface Sample {
  introW: number
  titleH: number
  placeholder: boolean
}

declare global {
  interface Window {
    __heroSamples?: Sample[]
    __pageCls?: number
    __heroCls?: number
    __heroShiftSources?: string[]
  }
}

const INSTALL_PROBES = () => {
  window.__heroSamples = []
  window.__pageCls = 0
  window.__heroCls = 0
  window.__heroShiftSources = []
  new PerformanceObserver(list => {
    for (const raw of list.getEntries()) {
      const e = raw as PerformanceEntry & {
        hadRecentInput: boolean
        value: number
        sources?: { node?: Node | null }[]
      }
      if (e.hadRecentInput) continue
      window.__pageCls = (window.__pageCls ?? 0) + e.value
      const heroNodes = (e.sources ?? [])
        .map(s => s.node)
        .filter(
          (n): n is Element =>
            n instanceof Element && n.closest('.club-hero') !== null
        )
      if (heroNodes.length > 0) {
        window.__heroCls = (window.__heroCls ?? 0) + e.value
        for (const n of heroNodes) {
          window.__heroShiftSources?.push(
            `${n.tagName}.${n.className.toString().split(' ')[0]} (${e.value.toFixed(4)})`
          )
        }
      }
    }
  }).observe({ type: 'layout-shift', buffered: true })

  const tick = () => {
    const intro = document.querySelector('.club-hero__intro')
    const title = document.querySelector('.club-hero__title')
    if (intro && title) {
      const sample = {
        introW: Math.round(intro.getBoundingClientRect().width * 10) / 10,
        titleH: Math.round(title.getBoundingClientRect().height),
        placeholder:
          document.querySelector(
            '[data-testid="club-hero-pill-placeholder"]'
          ) !== null,
      }
      const last = window.__heroSamples?.at(-1)
      if (
        !last ||
        last.introW !== sample.introW ||
        last.titleH !== sample.titleH ||
        last.placeholder !== sample.placeholder
      ) {
        window.__heroSamples?.push(sample)
      }
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

async function load(page: Page, path: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(INSTALL_PROBES)
  // Hold the club's analytics so the hero-first render paints for certain.
  await page.route('**/analytics/district_*_analytics.json', async route => {
    await new Promise(r => setTimeout(r, ANALYTICS_HOLD_MS))
    await route.continue()
  })
  await page.goto(path, { waitUntil: 'networkidle', timeout: 90_000 })
  // The full render: the status chips replaced their placeholder.
  await page.waitForFunction(
    () =>
      document.querySelector('.club-hero__pills') !== null &&
      document.querySelector('[data-testid="club-hero-pill-placeholder"]') ===
        null &&
      document.querySelector('[aria-busy="true"]') === null,
    null,
    { timeout: 60_000 }
  )
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.waitForTimeout(1_000)
}

test.describe('club hero does not shift at the hero-first → full render (#2071)', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'layout-shift is Chromium-only'
  )

  for (const path of CLUBS) {
    for (const width of WIDTHS) {
      test(`${path} at ${width}px keeps the hero still`, async ({ page }) => {
        test.setTimeout(150_000)
        await load(page, path, width)

        const m = await page.evaluate(() => ({
          samples: window.__heroSamples ?? [],
          pageCls: Number((window.__pageCls ?? 0).toFixed(5)),
          heroCls: Number((window.__heroCls ?? 0).toFixed(5)),
          sources: window.__heroShiftSources ?? [],
        }))
        const trace = m.samples
          .map(
            s =>
              `${s.placeholder ? 'hero-first' : 'full'} intro ${s.introW}px h1 ${s.titleH}px`
          )
          .join('\n  ')

        // Both renders were observed, or the comparison below is vacuous.
        expect(
          m.samples.some(s => s.placeholder),
          `no hero-first frame painted for ${path}:\n  ${trace}`
        ).toBe(true)
        expect(
          m.samples.some(s => !s.placeholder),
          `no full-render frame for ${path}:\n  ${trace}`
        ).toBe(true)

        // The invariant: the intro's width does not depend on the chips.
        const widths = [...new Set(m.samples.map(s => s.introW))]
        expect(
          widths,
          `${path} at ${width}px: the hero intro changed width between renders, ` +
            `so its text re-wrapped:\n  ${trace}`
        ).toHaveLength(1)
        const heights = [...new Set(m.samples.map(s => s.titleH))]
        expect(
          heights,
          `${path} at ${width}px h1 re-wrapped:\n  ${trace}`
        ).toHaveLength(1)

        expect(
          m.heroCls,
          `${path} at ${width}px hero CLS ${m.heroCls} (budget ${HERO_CLS_BUDGET}); ` +
            `moved hero nodes:\n  ${m.sources.join('\n  ')}`
        ).toBeLessThan(HERO_CLS_BUDGET)
        expect(
          m.pageCls,
          `${path} at ${width}px page CLS ${m.pageCls} (budget ${PAGE_CLS_BUDGET})`
        ).toBeLessThan(PAGE_CLS_BUDGET)
      })
    }
  }
})
