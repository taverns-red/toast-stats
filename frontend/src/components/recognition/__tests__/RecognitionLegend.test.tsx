/**
 * RecognitionLegend (#1361).
 *
 * There was no key anywhere on the landing page explaining what a badge meant.
 * The legend fixes that, but it must not eat the mobile fold (gap (c) on
 * #1359): inline at ≥640px, collapsed behind a disclosure below.
 *
 * jsdom has no media queries (Lesson 66), so the breakpoint itself is a CSS
 * contract asserted in `recognitionLegend.guard.test.ts`; these cover the
 * behaviour that has to work in the DOM — the item list and the disclosure.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { RecognitionLegend } from '../RecognitionLegend'
import { RECOGNITION_ITEMS } from '../recognitionRegistry'

describe('RecognitionLegend (#1361)', () => {
  it('lists every recognition item with its title and explanation', () => {
    render(<RecognitionLegend />)
    for (const item of RECOGNITION_ITEMS) {
      expect(screen.getByText(item.title)).toBeInTheDocument()
      expect(screen.getByText(item.description)).toBeInTheDocument()
    }
  })

  it('separates the independent awards from the ordinal tier ladder', () => {
    render(<RecognitionLegend />)
    expect(screen.getByText(/awards/i)).toBeInTheDocument()
    expect(screen.getByText(/distinguished tiers/i)).toBeInTheDocument()
  })

  it('is titled "Recognition", the product owner’s umbrella term', () => {
    const { container } = render(<RecognitionLegend />)
    expect(container.textContent).toMatch(/recognition/i)
    // "Tier" was explicitly rejected as the umbrella; it survives only as the
    // name of the ordinal sub-group.
    expect(
      screen.queryByRole('heading', { name: /^tier$/i })
    ).not.toBeInTheDocument()
  })

  it('collapses behind a real disclosure button, closed by default', () => {
    const { container } = render(<RecognitionLegend />)
    const toggle = screen.getByRole('button', {
      name: /what do these badges mean/i,
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    const items = container.querySelector('.recognition-legend__items')
    expect(items).not.toBeNull()
    expect(items!.getAttribute('data-open')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe(items!.id)
  })

  it('opens and closes on click', () => {
    const { container } = render(<RecognitionLegend />)
    const toggle = screen.getByRole('button', {
      name: /what do these badges mean/i,
    })
    const items = () =>
      container
        .querySelector('.recognition-legend__items')!
        .getAttribute('data-open')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(items()).toBe('true')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(items()).toBe('false')
  })

  it('gives the disclosure a ≥44px touch target (WCAG 2.5.5)', () => {
    // Unlike the rank badge — a non-interactive <span> — this IS a button, so
    // base.css's 44px floor applies and the component carries its own class
    // rather than relying on that floor alone.
    render(<RecognitionLegend />)
    const toggle = screen.getByRole('button', {
      name: /what do these badges mean/i,
    })
    expect(toggle.className).toMatch(/recognition-legend__toggle/)
  })
})
