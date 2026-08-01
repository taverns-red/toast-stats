import { describe, it, expect } from 'vitest'
import { rankingsScrollLabel } from '../rankingsScrollLabel'

describe('rankingsScrollLabel (#1358)', () => {
  it('offers the scroll hint when the table actually overflows', () => {
    expect(rankingsScrollLabel(true)).toMatch(/scroll horizontally/i)
  })

  // Below 768px the shed columns are `display: none`, not off-screen — no
  // amount of scrolling reveals them. Telling a screen-reader user to scroll
  // is an instruction that cannot succeed.
  it('does NOT promise scrolling when nothing can scroll', () => {
    const label = rankingsScrollLabel(false)

    expect(label).not.toMatch(/scroll/i)
    expect(label).toMatch(/district rankings/i)
  })

  it('always names the region, so the landmark stays labelled', () => {
    expect(rankingsScrollLabel(true)).toMatch(/district rankings/i)
    expect(rankingsScrollLabel(false)).toMatch(/district rankings/i)
  })
})
