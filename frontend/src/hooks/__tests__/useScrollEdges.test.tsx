/* useScrollEdges (#1846) — the landing's chip rows scroll horizontally below
   768 (regions 950px of content in a 225px box at 375). A static right-hand
   fade cannot say "you are at the end" or "there is more to the left", so
   the row reports which edges still hide content and the CSS fades only
   those. jsdom has no layout, so the box metrics are stubbed per element. */
import { describe, it, expect, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useScrollEdges } from '../useScrollEdges'

afterEach(() => cleanup())

const Row: React.FC<{ contentKey?: number }> = ({ contentKey }) => {
  const edges = useScrollEdges<HTMLDivElement>(contentKey)
  return <div data-testid="row" {...edges} />
}

const setBox = (
  el: HTMLElement,
  m: { scrollLeft: number; scrollWidth: number; clientWidth: number }
) => {
  Object.defineProperty(el, 'scrollWidth', {
    configurable: true,
    value: m.scrollWidth,
  })
  Object.defineProperty(el, 'clientWidth', {
    configurable: true,
    value: m.clientWidth,
  })
  el.scrollLeft = m.scrollLeft
}

describe('useScrollEdges (#1846)', () => {
  it('marks neither edge when the content fits', () => {
    render(<Row />)
    const row = screen.getByTestId('row')
    expect(row).not.toHaveAttribute('data-more-before')
    expect(row).not.toHaveAttribute('data-more-after')
  })

  it('marks only the trailing edge at the start of an overflowing row', () => {
    const { rerender } = render(<Row contentKey={0} />)
    const row = screen.getByTestId('row')
    setBox(row, { scrollLeft: 0, scrollWidth: 950, clientWidth: 225 })
    rerender(<Row contentKey={12} />)
    expect(row).toHaveAttribute('data-more-after')
    expect(row).not.toHaveAttribute('data-more-before')
  })

  it('marks both edges mid-scroll and only the leading edge at the end', () => {
    const { rerender } = render(<Row contentKey={0} />)
    const row = screen.getByTestId('row')
    setBox(row, { scrollLeft: 0, scrollWidth: 950, clientWidth: 225 })
    rerender(<Row contentKey={12} />)

    act(() => {
      row.scrollLeft = 300
      fireEvent.scroll(row)
    })
    expect(row).toHaveAttribute('data-more-before')
    expect(row).toHaveAttribute('data-more-after')

    act(() => {
      row.scrollLeft = 725
      fireEvent.scroll(row)
    })
    expect(row).toHaveAttribute('data-more-before')
    expect(row).not.toHaveAttribute('data-more-after')
  })

  it('re-measures on window resize', () => {
    render(<Row />)
    const row = screen.getByTestId('row')
    setBox(row, { scrollLeft: 0, scrollWidth: 727, clientWidth: 196 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(row).toHaveAttribute('data-more-after')
  })
})
