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

  it('stays false without IntersectionObserver (the SVG stays)', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { container } = render(<Probe />)
    expect(container.firstElementChild!.getAttribute('data-near')).toBe('false')
  })
})
