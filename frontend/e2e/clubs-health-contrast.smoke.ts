import { test, expect } from './fixtures/test'

/* Health marker and label contrast, from computed colours in the browser
 * (#2676, spec §3.1 and §12 test 13).
 *
 * `DataTableMarkerContrast.test.ts` checks the stylesheet's tokens; this
 * measures what the cascade actually paints, in both themes and both engines,
 * so a layer or specificity override that changes a marker's colour is caught.
 *
 * The legend always shows all three markers, so each status is measured there;
 * table cells are measured too where the district has that status. Markers need
 * 3:1 (WCAG 1.4.11), labels 4.5:1 (1.4.3). The Intervention x is knocked out of
 * the filled circle, so it is measured against the circle. */

interface Sample {
  what: string
  ratio: number
  need: number
}

for (const theme of ['light', 'dark'] as const) {
  test(`Health markers and labels meet contrast at 1280 (${theme})`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.emulateMedia({ colorScheme: theme })
    await page.addInitScript(t => {
      try {
        localStorage.setItem('theme', t)
      } catch {
        /* storage blocked: colorScheme still drives the theme */
      }
    }, theme)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/district/61/clubs', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    await page.locator('#clubs-table tbody tr').first().waitFor({
      timeout: 30_000,
    })
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

    const samples = await page.evaluate((): Sample[] => {
      type C = { r: number; g: number; b: number; a: number }
      const parse = (c: string): C | null => {
        const m = c.match(/rgba?\(([^)]+)\)/)
        if (!m) return null
        const p = m[1]!
          .split(/[,\s/]+/)
          .filter(Boolean)
          .map(parseFloat)
        return { r: p[0]!, g: p[1]!, b: p[2]!, a: p.length > 3 ? p[3]! : 1 }
      }
      const lum = ({ r, g, b }: C) => {
        const f = (v: number) => {
          v /= 255
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
      }
      const ratio = (a: C, b: C) => {
        const l1 = lum(a)
        const l2 = lum(b)
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      }
      const bgOf = (el: Element | null): C => {
        for (let p = el; p; p = p.parentElement) {
          const c = parse(getComputedStyle(p).backgroundColor)
          if (c && c.a > 0.9) return c
        }
        return { r: 255, g: 255, b: 255, a: 1 }
      }
      const out: Sample[] = []
      const markers = Array.from(
        document.querySelectorAll<SVGElement>('svg.dt-marker')
      )
      for (const svg of markers) {
        const fg = parse(getComputedStyle(svg).color)
        if (!fg) continue
        const where = svg.closest('.dt-legend')
          ? 'legend'
          : svg.closest('#clubs-table')
            ? 'cell'
            : 'other'
        const status = svg.getAttribute('data-marker')
        out.push({
          what: `${status} marker (${where}) vs its background`,
          ratio: ratio(fg, bgOf(svg.parentElement)),
          need: 3,
        })
        const knock = svg.querySelector('.dt-marker__knockout')
        if (knock) {
          const k = parse(getComputedStyle(knock).stroke)
          if (k) {
            out.push({
              what: `${status} x vs its circle (${where})`,
              ratio: ratio(k, fg),
              need: 3,
            })
          }
        }
      }
      for (const label of Array.from(
        document.querySelectorAll<HTMLElement>(
          '#clubs-table .dt-health, #clubs-table .dt-tier, .dt-legend'
        )
      ).slice(0, 60)) {
        const fg = parse(getComputedStyle(label).color)
        if (!fg) continue
        out.push({
          what: `${label.className} text "${(label.textContent ?? '').trim().slice(0, 18)}"`,
          ratio: ratio(fg, bgOf(label)),
          need: 4.5,
        })
      }
      return out
    })

    expect(
      samples.some(s => s.what.startsWith('intervention-required marker')),
      'the legend shows the Intervention marker'
    ).toBe(true)
    expect(
      samples.some(s => s.what.startsWith('vulnerable marker')),
      'the legend shows the Vulnerable marker'
    ).toBe(true)
    expect(
      samples.some(s => s.what.startsWith('thriving marker')),
      'the legend shows the Thriving marker'
    ).toBe(true)
    const fails = samples.filter(s => s.ratio < s.need)
    expect(
      fails.map(s => `${s.what} ${s.ratio.toFixed(2)}:1 < ${s.need}:1`),
      `${theme}`
    ).toEqual([])
  })
}
