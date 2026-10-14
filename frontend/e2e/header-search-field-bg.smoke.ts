import { test, expect, type Page } from './fixtures/test'

/* Header search field paints one surface in both themes (#2022).
 *
 * Measured on prod 2026-10-13 (CDP CSS.getMatchedStylesForNode) before the
 * fix: in dark mode the input inside `.header-search__field` computed
 * rgb(26,23,34) (`--surface-card`) while the field around it was
 * rgb(22,31,42) (`--surface-2`), a mismatched box inside the field. The
 * input's own rule (`.header-search__input`, @layer brand) sets
 * `background: transparent`, and in light mode it is transparent. The
 * winner was the unlayered blanket remap in dark-mode.css
 * (`[data-theme='dark'] input[type='text'] { background-color:
 * var(--surface-card) !important }`), which is meant for standalone
 * inputs. The field wrapper owns the surface, so the input must stay
 * transparent in both themes.
 *
 * The inline field renders only at ≥768px (a trigger button replaces it
 * below), so it is checked at 844 with touch and 1280 with a mouse.
 */

const TRANSPARENT = 'rgba(0, 0, 0, 0)'

async function load(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(t => {
    try {
      localStorage.setItem('theme', t)
    } catch {
      /* storage blocked: the default theme is still measured */
    }
  }, theme)
  await page.goto('/', { waitUntil: 'networkidle', timeout: 60_000 })
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
  await expect(page.locator('.header-search__input')).toBeVisible({
    timeout: 30_000,
  })
}

const VIEWPORTS = [
  { width: 844, height: 390, touch: true },
  { width: 1280, height: 900, touch: false },
] as const

for (const vp of VIEWPORTS) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`header search at ${vp.width}px ${vp.touch ? 'touch' : 'mouse'} (${theme})`, () => {
      test.use({
        viewport: { width: vp.width, height: vp.height },
        hasTouch: vp.touch,
      })

      test('input is transparent over the field surface', async ({ page }) => {
        await load(page, theme)
        const m = await page.evaluate(() => {
          const input = document.querySelector('.header-search__input')
          const field = document.querySelector('.header-search__field')
          if (!input || !field) return null
          // Resolve the --surface-2 token to a computed colour via a probe.
          const probe = document.createElement('div')
          probe.style.backgroundColor = 'var(--surface-2)'
          field.appendChild(probe)
          const token = getComputedStyle(probe).backgroundColor
          probe.remove()
          return {
            input: getComputedStyle(input).backgroundColor,
            field: getComputedStyle(field).backgroundColor,
            token,
          }
        })
        expect(m).not.toBeNull()
        expect(m!.input).toBe(TRANSPARENT)
        expect(m!.field).toBe(m!.token)
      })
    })
  }
}
