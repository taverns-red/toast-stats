import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ClubStatStrip, type ClubStat } from '../ClubStatStrip'

/**
 * #1843 (mobile review §6.3) — the club stat strip is 2×2 at 375 and 4×2
 * from 768. Below 768 the first four cells are the strip; the other four
 * fold behind one disclosure (URL state `?stats=1`), so no number is lost.
 * At ≥ 768 all eight cells are direct children of the grid.
 */
const setMobile = (mobile: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: /max-width/.test(query) ? mobile : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

const STATS: ClubStat[] = [
  { label: 'Base', value: 20 },
  { label: 'Current', value: 22 },
  { label: 'Net Δ', value: '+2', valClass: 'pos' },
  { label: 'DCP Goals', value: '5/10' },
  { label: 'Oct Renewals', value: 12 },
  { label: 'Apr Renewals', value: '—', valClass: 'muted' },
  { label: 'New Members', value: 4 },
  { label: 'CSP', value: '✓', valClass: 'tick', title: 'Submitted' },
]

const renderStrip = (url = '/') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <ClubStatStrip stats={STATS} />
    </MemoryRouter>
  )

const labels = (els: Element[]) =>
  els.map(el => el.querySelector('.club-stat__label')?.textContent)

describe('ClubStatStrip (#1843)', () => {
  afterEach(() => {
    cleanup()
    setMobile(false)
  })

  it('renders all eight cells directly in the grid at ≥ 768', () => {
    setMobile(false)
    const { container } = renderStrip()
    const grid = container.querySelector('.club-stats-grid')!
    const direct = [...grid.children].filter(el =>
      el.classList.contains('club-stat')
    )
    expect(labels(direct)).toEqual(STATS.map(s => s.label))
    expect(grid.querySelector('details')).toBeNull()
    const csp = direct[7]!
    expect(csp).toHaveAttribute('title', 'Submitted')
    expect(csp.querySelector('.club-stat__val')).toHaveClass(
      'club-stat__val--tick'
    )
  })

  it('shows a 2×2 of the first four below 768 and folds the rest', () => {
    setMobile(true)
    const { container } = renderStrip()
    const grid = container.querySelector('.club-stats-grid')!
    const direct = [...grid.children].filter(el =>
      el.classList.contains('club-stat')
    )
    expect(labels(direct)).toEqual(['Base', 'Current', 'Net Δ', 'DCP Goals'])
    const details = grid.querySelector('details')!
    expect(details).not.toHaveAttribute('open')
    expect(details.querySelector('summary')).toHaveTextContent(
      /renewals, new members and CSP/i
    )
    expect(labels([...details.querySelectorAll('.club-stat')])).toEqual([
      'Oct Renewals',
      'Apr Renewals',
      'New Members',
      'CSP',
    ])
  })

  it('opens the fold from the URL (?stats=1)', () => {
    setMobile(true)
    const { container } = renderStrip('/?stats=1')
    expect(container.querySelector('.club-stats-grid details')).toHaveAttribute(
      'open'
    )
  })
})
