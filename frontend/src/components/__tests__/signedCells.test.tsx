import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SignedDelta } from '../regionRankingsCells'
import { formatPercentage } from '../../utils/rankingsFormat'

/**
 * #2648 — a negative number in a KPI or table cell is written with U+2212,
 * never an ASCII hyphen-minus, and with thousands separators.
 */
describe('signed cells (#2648)', () => {
  it('SignedDelta: a loss reads "−1,676", not "-1,676"', () => {
    const { container } = render(<SignedDelta value={-1676} />)
    expect(container.textContent).toBe('−1,676')
  })

  it('SignedDelta: a gain reads "+2,293" and zero reads "0"', () => {
    expect(render(<SignedDelta value={2293} />).container.textContent).toBe(
      '+2,293'
    )
    expect(render(<SignedDelta value={0} />).container.textContent).toBe('0')
  })

  it('formatPercentage: a loss reads "−2.0%", not "-2.0%"', () => {
    expect(formatPercentage(-2).text).toBe('−2.0%')
    expect(formatPercentage(3.04).text).toBe('+3.0%')
    expect(formatPercentage(0).text).toBe('0.0%')
  })

  it('formatPercentage: a value that displays as zero is neutral, not red', () => {
    const tiny = formatPercentage(-0.04)
    expect(tiny.text).toBe('0.0%')
    expect(tiny.color).toBe('text-gray-600')
    expect(formatPercentage(0.04).color).toBe('text-gray-600')
  })

  it('formatPercentage: NaN keeps the neutral "0.0%"', () => {
    expect(formatPercentage(NaN)).toEqual({
      text: '0.0%',
      color: 'text-gray-600',
    })
  })
})
