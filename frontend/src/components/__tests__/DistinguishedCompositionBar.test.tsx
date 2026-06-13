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
