/**
 * Legend as aria-pressed chips (#1835, mobile epic #1827 Phase 1 item 13).
 *
 * Recharts' default legend is a 36 px strip of 12 px labels that only a
 * pointer can use. The chart's series legend becomes a row of toggle chips:
 * one button per series, `aria-pressed` = the series is drawn. Every series
 * starts drawn (every chip pressed), so the first tap on a chip hides what
 * the chip shows — no select-all ambiguity (Lesson: resolve toggles against
 * aria-pressed). The last drawn series cannot be hidden: an empty plot reads
 * as "no data". A lone series is a static label, not a button.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ChartLegendChips, useSeriesVisibility } from '../ChartLegendChips'

const SERIES = [
  { key: 'cur', name: '2026-27', color: '#004165' },
  { key: 'p1', name: '2025-26', color: '#772432', dash: '6 3' },
  { key: 'p2', name: '2024-25', color: '#A9B2B1' },
]

function Harness({ series = SERIES }: { series?: typeof SERIES }) {
  const visibility = useSeriesVisibility()
  return (
    <div>
      <ChartLegendChips series={series} visibility={visibility} />
      <ul data-testid="drawn">
        {series
          .filter(s => visibility.isVisible(s.key))
          .map(s => (
            <li key={s.key}>{s.key}</li>
          ))}
      </ul>
    </div>
  )
}

afterEach(cleanup)

const drawn = () =>
  Array.from(screen.getByTestId('drawn').querySelectorAll('li')).map(
    li => li.textContent
  )

describe('ChartLegendChips (#1835)', () => {
  it('renders one pressed toggle chip per series, every series drawn', () => {
    render(<Harness />)
    const group = screen.getByRole('group', { name: 'Chart series' })
    const chips = Array.from(group.querySelectorAll('button'))
    expect(chips.map(c => c.textContent)).toEqual([
      '2026-27',
      '2025-26',
      '2024-25',
    ])
    for (const chip of chips) {
      expect(chip).toHaveAttribute('aria-pressed', 'true')
      expect(chip).toHaveAttribute('type', 'button')
    }
    expect(drawn()).toEqual(['cur', 'p1', 'p2'])
  })

  it('a tap hides that series and a second tap draws it again', () => {
    render(<Harness />)
    const chip = screen.getByRole('button', { name: '2025-26' })
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(drawn()).toEqual(['cur', 'p2'])
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(drawn()).toEqual(['cur', 'p1', 'p2'])
  })

  it('the last drawn series cannot be hidden', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '2025-26' }))
    fireEvent.click(screen.getByRole('button', { name: '2024-25' }))
    const last = screen.getByRole('button', { name: '2026-27' })
    fireEvent.click(last)
    expect(last).toHaveAttribute('aria-pressed', 'true')
    expect(last).toHaveAttribute('aria-disabled', 'true')
    expect(drawn()).toEqual(['cur'])
  })

  it('each swatch carries the series colour (and dash) but no text', () => {
    render(<Harness />)
    const chip = screen.getByRole('button', { name: '2025-26' })
    const line = chip.querySelector('svg line')!
    expect(chip.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(line).toHaveAttribute('stroke', '#772432')
    expect(line).toHaveAttribute('stroke-dasharray', '6 3')
  })

  it('a lone series is a static label, not a toggle', () => {
    render(<Harness series={[SERIES[0]!]} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('2026-27')).toBeInTheDocument()
  })
})
