/**
 * #2162 — the club mini-map fetches MapLibre only once its card nears the
 * viewport. jsdom has no IntersectionObserver, so a recorder with the DOM
 * shape (constructor(callback, options), observe, disconnect) stands in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { useState } from 'react'
import { useNearViewport, NEAR_VIEWPORT_MARGIN } from '../useNearViewport'

type IOArgs = ConstructorParameters<typeof IntersectionObserver>
type IOCallback = IOArgs[0]
type IOOptions = IOArgs[1]

interface Recorder {
  callback: IOCallback
  options: IOOptions
  observed: Element[]
  disconnect: ReturnType<typeof vi.fn<() => void>>
}
let observers: Recorder[] = []

class FakeIO {
  rec: Recorder
  constructor(cb: IOCallback, opts?: IOOptions) {
    this.rec = {
      callback: cb,
      options: opts,
      observed: [],
      disconnect: vi.fn(),
    }
    observers.push(this.rec)
  }
  observe(el: Element) {
    this.rec.observed.push(el)
  }
  disconnect() {
    this.rec.disconnect()
  }
  unobserve() {}
  takeRecords() {
    return []
  }
}

function Probe() {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const near = useNearViewport(el)
  return <div ref={setEl} data-near={String(near)} />
}

const cross = (rec: Recorder, isIntersecting: boolean) =>
  act(() =>
    rec.callback(
      [
        {
          isIntersecting,
          target: rec.observed[0]!,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver
    )
  )

describe('useNearViewport', () => {
  beforeEach(() => {
    observers = []
    vi.stubGlobal('IntersectionObserver', FakeIO)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('is false until the element nears the viewport, then stays true', () => {
    const { container } = render(<Probe />)
    const div = container.firstElementChild!
    expect(div.getAttribute('data-near')).toBe('false')
    expect(observers).toHaveLength(1)
    expect(observers[0]!.observed).toEqual([div])
    expect(observers[0]!.options?.rootMargin).toBe(NEAR_VIEWPORT_MARGIN)

    cross(observers[0]!, false)
    expect(div.getAttribute('data-near')).toBe('false')
    cross(observers[0]!, true)
    expect(div.getAttribute('data-near')).toBe('true')
    // Latched: the observer is let go and scrolling away changes nothing.
    expect(observers[0]!.disconnect).toHaveBeenCalled()
  })

  // #2575: a reader who jumps past the element (a screen reader's heading
  // rotor, a deep link, a restored scroll position) never has it inside the
  // margin band, so it never reports intersecting. It has been passed all the
  // same, and a held card there would stay an aria-hidden placeholder.
  it('counts an element scrolled past, beyond the margin, as near (#2575)', () => {
    const { container } = render(<Probe />)
    const div = container.firstElementChild!
    act(() =>
      observers[0]!.callback(
        [
          {
            isIntersecting: false,
            target: div,
            boundingClientRect: { top: -2000, bottom: -1400 },
            rootBounds: { top: -600, bottom: 1400 },
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver
      )
    )
    expect(div.getAttribute('data-near')).toBe('true')
  })

  it('stays false for an element still below the viewport (#2575)', () => {
    const { container } = render(<Probe />)
    const div = container.firstElementChild!
    act(() =>
      observers[0]!.callback(
        [
          {
            isIntersecting: false,
            target: div,
            boundingClientRect: { top: 3000, bottom: 3600 },
            rootBounds: { top: -600, bottom: 1400 },
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver
      )
    )
    expect(div.getAttribute('data-near')).toBe('false')
  })

  // #2575 (review): a real IntersectionObserver queues an entry only on first
  // observe or when intersection/threshold changes. A rotor jump from below
  // the band straight to above it changes neither, so no callback ever fires
  // after the first one. Only a scroll check can see it.
  it('catches a below-to-above jump that IntersectionObserver never reports (#2575)', () => {
    const { container } = render(<Probe />)
    const div = container.firstElementChild!
    const rect = vi.spyOn(div, 'getBoundingClientRect')
    // First observe: below the band, not intersecting (the only entry real IO queues).
    rect.mockReturnValue({ top: 3000, bottom: 3600 } as DOMRect)
    act(() =>
      observers[0]!.callback(
        [
          {
            isIntersecting: false,
            target: div,
            boundingClientRect: { top: 3000, bottom: 3600 },
            rootBounds: { top: -600, bottom: 1400 },
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver
      )
    )
    expect(div.getAttribute('data-near')).toBe('false')

    // The jump: the element is now far above the band. No IO callback follows.
    rect.mockReturnValue({ top: -5000, bottom: -4400 } as DOMRect)
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(div.getAttribute('data-near')).toBe('true')
  })

  it('a scroll that leaves the element below the band keeps it false', () => {
    const { container } = render(<Probe />)
    const div = container.firstElementChild!
    vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
      top: 4000,
      bottom: 4600,
    } as DOMRect)
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(div.getAttribute('data-near')).toBe('false')
  })

  it('stays false without IntersectionObserver (the SVG stays)', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { container } = render(<Probe />)
    expect(container.firstElementChild!.getAttribute('data-near')).toBe('false')
  })
})
