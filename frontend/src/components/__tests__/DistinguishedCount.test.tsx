/* #2554 (part): the one component every Distinguished count goes through, so
 * the district tiles and the landing KPI cannot drift apart again. */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
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

  // #2580 (#2579 review): `title` is invisible on touch and to most screen
  // readers, so the explanation has to be in the text itself.
  it('explains provisional without relying on the title attribute', () => {
    render(<DistinguishedCount confirmed={3} provisional={2} />)
    const prov = screen.getByTestId('distinguished-provisional')
    expect(prov).toHaveTextContent('+2 provisional')
    const note = within(prov).getByTestId('distinguished-provisional-note')
    expect(note).toHaveTextContent(/not yet confirmed/i)
    expect(note).toHaveClass('sr-only')
  })

  // #2580 (#2579 review): step 3 of the source order has no confirmed source.
  // An unlabelled number beside a confirmed-basis rank reads as confirmed.
  it('labels a qualifying-today figure instead of passing it off as confirmed', () => {
    render(<DistinguishedCount confirmed={6} basis="qualifying-today" />)
    expect(screen.getByTestId('distinguished-confirmed')).toHaveTextContent(
      /^6$/
    )
    expect(screen.getByTestId('distinguished-basis')).toHaveTextContent(
      'qualifying today'
    )
    expect(screen.queryByTestId('distinguished-provisional')).toBeNull()
  })

  it('draws no basis label for a confirmed count', () => {
    render(<DistinguishedCount confirmed={6} />)
    expect(screen.queryByTestId('distinguished-basis')).toBeNull()
  })
})
