/**
 * #3094 — a link from the region or world funnel lands on
 * `/district/{id}/growth#growth-reinstate`. The section only exists once the
 * page's data has loaded, after the router's own hash scroll gave up, so the
 * page scrolls to it when it is ready.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useScrollToHashWhenReady } from '../useScrollToHashWhenReady'

afterEach(cleanup)

function Page({ ready }: { ready: boolean }) {
  useScrollToHashWhenReady(ready)
  return ready ? <section id="growth-reinstate">Can reinstate</section> : null
}

function renderAt(url: string, ready: boolean) {
  const spy = vi.fn()
  Element.prototype.scrollIntoView = spy
  const view = render(
    <MemoryRouter initialEntries={[url]}>
      <Page ready={ready} />
    </MemoryRouter>
  )
  const rerender = (next: boolean) =>
    view.rerender(
      <MemoryRouter initialEntries={[url]}>
        <Page ready={next} />
      </MemoryRouter>
    )
  return { spy, rerender }
}

describe('useScrollToHashWhenReady', () => {
  it('scrolls to the hash target once the page is ready', () => {
    const { spy, rerender } = renderAt(
      '/district/61/growth#growth-reinstate',
      false
    )
    expect(spy).not.toHaveBeenCalled()
    rerender(true)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.contexts[0]).toHaveProperty('id', 'growth-reinstate')
  })

  it('does nothing without a hash', () => {
    const { spy, rerender } = renderAt('/district/61/growth', false)
    rerender(true)
    expect(spy).not.toHaveBeenCalled()
  })

  it('does nothing when the target is not on the page', () => {
    const { spy, rerender } = renderAt('/district/61/growth#nowhere', false)
    rerender(true)
    expect(spy).not.toHaveBeenCalled()
  })
})
