/* #2554 (part): the one component every Distinguished count goes through, so
 * the district tiles and the landing KPI cannot drift apart again. */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DistinguishedCount } from '../DistinguishedCount'

afterEach(() => cleanup())

describe('DistinguishedCount (#2554)', () => {
  it('shows the confirmed count as the headline, with +N provisional beside it', () => {
    render(<DistinguishedCount confirmed={3} provisional={3} />)
    expect(screen.getByTestId('distinguished-confirmed')).toHaveTextContent(
      /^3$/
    )
    expect(screen.getByTestId('distinguished-provisional')).toHaveTextContent(
      '+3 provisional'
    )
  })

  it('never sums the two', () => {
    const { container } = render(
      <DistinguishedCount confirmed={3} provisional={3} />
    )
    expect(container).not.toHaveTextContent(/(^|\D)6(\D|$)/)
  })

  it('omits the provisional part when there is none or it is unknown', () => {
    const { rerender } = render(
      <DistinguishedCount confirmed={12} provisional={0} />
    )
    expect(screen.queryByTestId('distinguished-provisional')).toBeNull()
    rerender(<DistinguishedCount confirmed={12} />)
    expect(screen.queryByTestId('distinguished-provisional')).toBeNull()
    expect(screen.getByTestId('distinguished-confirmed')).toHaveTextContent(
      /^12$/
    )
  })

  it('explains provisional in a tooltip title', () => {
    render(<DistinguishedCount confirmed={3} provisional={2} />)
    const prov = screen.getByTestId('distinguished-provisional')
    expect(prov).toHaveAttribute(
      'title',
      expect.stringMatching(/qualify on current membership/i)
    )
    expect(prov).toHaveAttribute(
      'title',
      expect.stringMatching(/April renewals/i)
    )
  })
})
