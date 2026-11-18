import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/* #2959: on PR #2951's run, four bundle-7 smokes failed because the page was
 * still showing its loading state when the test looked at it. The artifact's
 * error-context pages show it:
 *   - clubs-mobile-rows: `status "Loading table": Loading table data...`
 *     (the table is a lazy chunk; webkit on a busy runner took over 5 s);
 *   - basemap-375: the map region is still named "Club map" with
 *     `status "Loading map"`; the full name appears once the lazy map mounts,
 *     and the test gave that 5 s while giving the canvas 15 s;
 *   - contrast-aa /history: `.history-page-year-chip__live` was in the page
 *     while the other chips were still `shell-ghost`, so the contrast walk
 *     measured placeholders (ratio 1:1).
 * Each smoke must wait for the page's own "loaded" signal, not for a default
 * 5 s expect to win a race. A source check, like the CDN-fixture lint beside
 * it: the failure needs a loaded CI runner and cannot be reproduced locally. */

const E2E_DIR = resolve(__dirname, '../../../e2e')
const read = (f: string) => readFileSync(resolve(E2E_DIR, f), 'utf8')

describe('smokes wait for loaded data (#2959)', () => {
  it('clubs-mobile-rows load() waits for the table skeleton to go', () => {
    const src = read('clubs-mobile-rows.smoke.ts')
    const load = src.match(/async function load\([\s\S]*?\n}\n/)?.[0] ?? ''
    expect(load).toMatch(/Loading table/)
    expect(load).toMatch(
      /toHaveCount\(\s*0|toBeHidden|waitFor\(\{\s*state: 'detached'/
    )
  })

  it('contrast-aa does not measure while a shell-ghost placeholder is on the page', () => {
    const src = read('contrast-aa.smoke.ts')
    expect(src).toMatch(/shell-ghost/)
  })

  it('basemap-375 gives the loaded map region the same budget as its canvas', () => {
    const src = read('basemap-375.smoke.ts')
    expect(src).not.toMatch(/await expect\(region\)\.toBeVisible\(\)/)
    expect(src).toMatch(/await expect\(region\)\.toBeVisible\(\{ timeout: /)
  })
})
