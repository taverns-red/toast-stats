/**
 * #2712: the collapsed membership headline is the club page's LCP candidate on
 * phones. Its visible text stays short ("11 members (-5)"); the basis is read
 * out (screen-reader only) and drawn in the expanded panel and the stat strip.
 * Spelling it out in the visible text wrapped it to two lines, made it the LCP
 * element and took Lighthouse mobile LCP from 3.6-4.3 s to 4.4-5.0 s.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MembershipHeadline } from '../MembershipHeadline'

afterEach(cleanup)

const BASIS = 'since the start of the program year'

describe('MembershipHeadline (#2712)', () => {
  it('draws only "11 members (-5)" on screen', () => {
    const { container } = render(
      <MembershipHeadline latest={11} change={-5} basis={BASIS} />
    )
    const clone = container.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.sr-only').forEach(n => n.remove())
    expect(clone.textContent).toBe('11 members (-5)')
  })

  it('still reads the basis out for assistive technology', () => {
    const { container } = render(
      <MembershipHeadline latest={11} change={-5} basis={BASIS} />
    )
    expect(container.querySelector('.sr-only')?.textContent).toContain(BASIS)
  })

  it('shows no change, and no basis, when nothing changed', () => {
    const { container } = render(
      <MembershipHeadline latest={11} change={0} basis={BASIS} />
    )
    expect(container.textContent).toBe('11 members')
  })
})
