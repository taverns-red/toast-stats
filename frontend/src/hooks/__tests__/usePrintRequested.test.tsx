/**
 * #2571 — printing releases reads that are held until a card nears the
 * viewport. `beforeprint` is the main signal; a change of the `print` media
 * query covers browsers that skip the event.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { usePrintRequested } from '../usePrintRequested'

function Probe() {
  return <div data-printed={String(usePrintRequested())} />
}

describe('usePrintRequested', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is false until beforeprint fires, then stays true', () => {
    const { container } = render(<Probe />)
    const div = container.firstElementChild!
    expect(div.getAttribute('data-printed')).toBe('false')
    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    expect(div.getAttribute('data-printed')).toBe('true')
    // Latched: leaving print mode changes nothing.
    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(div.getAttribute('data-printed')).toBe('true')
  })

  it('turns true when the print media query starts matching', () => {
    let onChange: ((e: MediaQueryListEvent) => void) | undefined
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: (_: string, cb: typeof onChange) => {
          onChange = cb
        },
        removeEventListener: () => {},
      }))
    )
    const { container } = render(<Probe />)
    const div = container.firstElementChild!
    act(() => onChange!({ matches: false } as MediaQueryListEvent))
    expect(div.getAttribute('data-printed')).toBe('false')
    act(() => onChange!({ matches: true } as MediaQueryListEvent))
    expect(div.getAttribute('data-printed')).toBe('true')
  })
})
