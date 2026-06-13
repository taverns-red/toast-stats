import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, Link } from 'react-router-dom'
import {
  useScrollRestoration,
  __scrollPositionsForTest,
} from '../useScrollRestoration'

// Flush the navigation + its layout effect before asserting.
const navigate = (
  router: ReturnType<typeof createMemoryRouter>,
  to: string | number
) =>
  act(async () => {
    await router.navigate(to as never)
  })

/**
 * #1103 — scroll restoration that survives data-driven height growth.
 * RR's built-in <ScrollRestoration/> restores once, synchronously, at the POP
 * commit; on this app the landing leaderboard renders short first (region
 * filter inflates via a post-mount effect, load-bearing for CLS — Lesson 145),
 * so a single scrollTo clamps to the short height. This hook re-applies across
 * animation frames until the target is reachable.
 */

let currentScrollY = 0

function Harness() {
  useScrollRestoration()
  return (
    <div>
      <Link to="/detail">go detail</Link>
      <Link to="/">go home</Link>
    </div>
  )
}

const renderAt = (path = '/') => {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Harness /> },
      { path: '/detail', element: <Harness /> },
      { path: '/methodology', element: <Harness /> },
    ],
    { initialEntries: [path] }
  )
  return { ...render(<RouterProvider router={router} />), router }
}

beforeEach(() => {
  __scrollPositionsForTest.clear()
  currentScrollY = 0
  // jsdom has no layout; model window scroll ourselves so the hook's
  // read-back (window.scrollY) reflects what scrollTo set.
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    get: () => currentScrollY,
  })
  vi.spyOn(window, 'scrollTo').mockImplementation(((...args: number[]) => {
    if (typeof args[1] === 'number') currentScrollY = args[1]
  }) as typeof window.scrollTo)
  // Run rAF callbacks synchronously so retries resolve within the test.
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void): number => {
    cb(0)
    return 0
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useScrollRestoration (#1103)', () => {
  it('sets history.scrollRestoration to manual while mounted', () => {
    renderAt('/')
    expect(window.history.scrollRestoration).toBe('manual')
  })

  it('scrolls to top on a PUSH navigation', async () => {
    currentScrollY = 500
    const { router } = renderAt('/')
    await navigate(router, '/detail')
    expect(currentScrollY).toBe(0)
  })

  it('restores the saved offset on a POP (back) navigation', async () => {
    const { router } = renderAt('/')
    // User scrolls the landing page, then navigates away (PUSH).
    currentScrollY = 900
    window.dispatchEvent(new Event('scroll'))
    await navigate(router, '/detail')
    expect(currentScrollY).toBe(0) // detail starts at top
    // Browser Back → POP restores the landing offset.
    await navigate(router, -1)
    expect(currentScrollY).toBe(900)
  })

  it('re-applies the target across frames until the page is tall enough (no clamp)', async () => {
    const { router } = renderAt('/')
    currentScrollY = 900
    window.dispatchEvent(new Event('scroll'))
    await navigate(router, '/detail')

    // Simulate a short first POP render: scrollTo clamps to a max that grows.
    let maxScroll = 100
    vi.spyOn(window, 'scrollTo').mockImplementation(((...args: number[]) => {
      if (typeof args[1] === 'number')
        currentScrollY = Math.min(args[1], maxScroll)
    }) as typeof window.scrollTo)
    // rAF grows the page on each frame, then settles tall enough.
    let frames = 0
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: (t: number) => void): number => {
        frames += 1
        if (frames === 3) maxScroll = 2000
        cb(0)
        return 0
      }
    )

    await navigate(router, -1)
    expect(currentScrollY).toBe(900)
  })

  it('does not force-scroll-to-top when the location has a resolvable hash', async () => {
    const el = document.createElement('div')
    el.id = 'borda-count'
    el.scrollIntoView = vi.fn()
    document.body.appendChild(el)
    const { router } = renderAt('/')
    currentScrollY = 400 // user scrolled after landing
    await navigate(router, '/methodology#borda-count')
    expect(el.scrollIntoView).toHaveBeenCalled()
    expect(currentScrollY).toBe(400) // not reset to 0
    document.body.removeChild(el)
  })
})
