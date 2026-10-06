/* DistinguishedCompositionBar caption denominator (#1107).
   The bar's segments — including "Not yet" — all divide by `totalClubs`
   (the district's full club roster, `analytics.allClubs.length`), so the
   caption's denominator IS the total club count, not the paid count. The
   caption previously labelled it "paid", which mislabels the denominator
   (#1107: "57 of 162 paid" while 162 is total clubs, paid = 151). */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DistinguishedCompositionBar from '../DistinguishedCompositionBar'

describe('DistinguishedCompositionBar caption (#1107)', () => {
  it('labels the denominator as total clubs, not "paid"', () => {
    render(
      <DistinguishedCompositionBar
        smedley={0}
        presidents={0}
        select={0}
        distinguished={57}
        totalClubs={162}
      />
    )
    // distinguishedTotal = 57, total = 162 → round(57/162*100) = 35%
    const caption = screen.getByText(/57 of 162/)
    expect(caption).toHaveTextContent('57 of 162 clubs (35%)')
    expect(caption.textContent).not.toMatch(/paid/i)
  })
})

/* #1636 — each tier segment and its legend swatch carry a `.tier-fill--*`
   hook, which dark-mode.css remaps to the `--tier-chart-*` tokens so the
   President's / Smedley fills clear 3:1 on the dark surface. Light mode keeps
   the Tailwind fills. "Not yet" is neutral and has no tier hook. */
describe('DistinguishedCompositionBar tier hooks (#1636)', () => {
  it('tags every tier segment and swatch with its tier-fill class', () => {
    const { container } = render(
      <DistinguishedCompositionBar
        smedley={1}
        presidents={2}
        select={3}
        distinguished={4}
        totalClubs={20}
      />
    )
    for (const [tier, label] of [
      ['smedley', 'Smedley'],
      ['presidents', "President's"],
      ['select', 'Select'],
      ['distinguished', 'Distinguished'],
    ] as const) {
      expect(screen.getByTitle(new RegExp(`^${label}:`))).toHaveClass(
        `tier-fill--${tier}`
      )
      // the bar segment + its legend swatch
      expect(container.querySelectorAll(`.tier-fill--${tier}`)).toHaveLength(2)
    }
    expect(screen.getByTitle(/^Not yet:/).className).not.toMatch(/tier-fill/)
  })
})

/* #1652 — the neutral "Not yet" segment carries its own hook so light mode
   can give its count dark ink (white on gray-200 is 1.23:1). It is not a
   tier, so it stays out of the `.tier-fill--*` family. */
describe('DistinguishedCompositionBar not-yet hook (#1652)', () => {
  it('tags the Not yet segment with composition-fill--not-yet', () => {
    render(
      <DistinguishedCompositionBar
        smedley={1}
        presidents={2}
        select={3}
        distinguished={4}
        totalClubs={20}
      />
    )
    expect(screen.getByTitle(/^Not yet:/)).toHaveClass(
      'composition-fill--not-yet'
    )
  })
})
