import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/* #2685: district-kpi-strip-mobile.smoke.ts retried in WebKit on #2672 and
 * #2684. Both failures printed the same probe,
 *   {"position":"static","stripTop":108,"stripBottom":666,"centreInStrip":true}
 * a strip at its unscrolled position after `scrollTo(0, 1200)` and a fixed
 * 400 ms wait. index.css sets `html { scroll-behavior: smooth }`, so a plain
 * scrollTo animates; on a loaded WebKit runner the animation had not moved by
 * the time the probe ran. The probe then asked "what is at the viewport
 * centre" of a page that never scrolled.
 *
 * A smoke that scrolls to probe must jump (`behavior: 'instant'`) and wait on
 * the position, never on a timer (as clubs-table-layout.smoke.ts does).
 */

const SPEC = resolve(
  __dirname,
  '../../../e2e/district-kpi-strip-mobile.smoke.ts'
)
const source = readFileSync(SPEC, 'utf8')

describe('KPI strip smoke scrolls without the smooth animation (#2685)', () => {
  it('has no positional window.scrollTo(0, y) call, which smooth-scrolls', () => {
    const positional = source.match(/window\.scrollTo\(\s*0\s*,[^)]*\)/g)
    expect(positional).toBeNull()
  })

  it('waits on the scroll position, not only on a timer', () => {
    expect(/waitForFunction\([^)]*scrollY/s.test(source)).toBe(true)
  })
})
