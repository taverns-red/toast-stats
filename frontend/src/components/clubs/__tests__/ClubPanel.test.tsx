import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import { ClubPanel } from '../ClubPanel'

/**
 * #1843 (mobile review §5.5/§6.3) — the club page's Education and
 * Compliance panels are disclosure cards on phones, OPEN by default; at
 * ≥ 768 they keep the plain `.club-panel` chrome (no disclosure).
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

const renderPanel = () =>
  render(
    <ClubPanel
      titleId="t-edu"
      title="Education"
      className="club-edu"
      meta="Ledger as of Oct 11"
    >
      <p>Body text</p>
    </ClubPanel>
  )

describe('ClubPanel (#1843)', () => {
  afterEach(() => {
    cleanup()
    setMobile(false)
  })

  it('is a disclosure card, open by default, below 768', () => {
    setMobile(true)
    const { container } = renderPanel()
    const region = screen.getByRole('region', { name: 'Education' })
    const details = region.querySelector('details')
    expect(details).not.toBeNull()
    expect(details).toHaveAttribute('open')
    // The heading and meta sit in the summary — the tap target.
    const summary = details!.querySelector('summary')!
    expect(within(summary).getByRole('heading', { name: 'Education' }))
    expect(summary).toHaveTextContent('Ledger as of Oct 11')
    expect(summary).toHaveClass('club-panel__head')
    expect(within(region).getByText('Body text')).toBeVisible()
    expect(container.querySelector('.club-panel.club-edu')).toBe(region)
  })

  it('keeps the plain panel chrome at ≥ 768 (no disclosure)', () => {
    setMobile(false)
    renderPanel()
    const region = screen.getByRole('region', { name: 'Education' })
    expect(region.querySelector('details')).toBeNull()
    expect(region.querySelector('.club-panel__head')).toHaveTextContent(
      'Education'
    )
    expect(within(region).getByText('Body text')).toBeInTheDocument()
  })
})
