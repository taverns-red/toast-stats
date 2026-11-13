import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/* The hub smoke injects a worst-case Distinguished pair into the live tile
   and measures it (#2554). A hand-typed string drifts from what users see:
   "+88 provisional" was 5 characters shorter than the rendered "+88
   qualifying today" (#2731), so the clip and row-height checks measured text
   that is not on the page (#2776). The injected markup must come from the
   real component, never a copied literal. */

const smoke = readFileSync(
  resolve(__dirname, '../../e2e/district-overview-hub-mobile.smoke.ts'),
  'utf8'
)

describe('district-overview-hub-mobile smoke wording (#2776)', () => {
  it('types no "+N provisional" literal', () => {
    expect(smoke).not.toMatch(/\+\d+ provisional/)
  })

  it('builds the injected tile markup from the real DistinguishedCount', () => {
    expect(smoke).toMatch(/DistinguishedCount/)
    expect(smoke).toMatch(/renderToStaticMarkup/)
  })
})
