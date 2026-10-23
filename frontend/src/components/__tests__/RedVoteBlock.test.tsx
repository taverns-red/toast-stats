/**
 * RedVoteBlock (#2249) — the landing's one Red Vote surface: a
 * self-contained block in Red Vote's own colours, logo and type, prominent
 * but secondary (after the World pulse). Copy, link and seasons come from
 * config/redVotePromo.ts (ops#117); the placement is `landing-block`.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RedVoteBlock } from '../RedVoteBlock'
import { RED_VOTE_COPY } from '../../config/redVotePromo'

const IN_SEASON = '?promoDate=2026-09-10'
const OUT_OF_SEASON = '?promoDate=2026-10-15'

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/${search}`]}>
      <RedVoteBlock />
    </MemoryRouter>
  )
}

const cta = () => screen.getByRole('link', { name: /see red vote/i })
const medium = (a: HTMLElement) =>
  new URL(a.getAttribute('href') ?? '').searchParams.get('utm_medium')

describe('RedVoteBlock (#2249)', () => {
  afterEach(() => {
    delete window.gtag
  })

  it('is a labelled region carrying the Red Vote mark, heading, copy and disclaimer', () => {
    renderAt(OUT_OF_SEASON)
    const block = screen.getByRole('region', {
      name: RED_VOTE_COPY.cardHeading,
    })
    expect(block).toHaveClass('red-vote-block')
    // The pennant is decorative; the wordmark is text, as in Red Vote's
    // own chrome (there is no separate wordmark asset).
    expect(block.querySelector('svg.red-vote-block__pennant')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
    expect(block).toHaveTextContent(RED_VOTE_COPY.productName)
    expect(block).toHaveTextContent(RED_VOTE_COPY.body)
    expect(block).toHaveTextContent(RED_VOTE_COPY.attribution)
    expect(block).toHaveTextContent(RED_VOTE_COPY.disclaimer)
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull()
  })

  it('links to the marketing page with the landing-block placement, in a new tab', () => {
    renderAt(OUT_OF_SEASON)
    expect(medium(cta())).toBe('landing-block')
    expect(cta()).toHaveAttribute('target', '_blank')
    expect(cta()).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('reads the season in its eyebrow and nothing else changes with the clock', () => {
    const { unmount } = renderAt(OUT_OF_SEASON)
    expect(screen.getByTestId('red-vote-block-eyebrow')).toHaveTextContent(
      RED_VOTE_COPY.blockEyebrow
    )
    unmount()
    renderAt(IN_SEASON)
    expect(screen.getByTestId('red-vote-block-eyebrow')).toHaveTextContent(
      RED_VOTE_COPY.blockEyebrowSeason
    )
    expect(medium(cta())).toBe('landing-block')
  })

  it('sends a GA4 select_promotion event with the landing-block slot on click', () => {
    const gtag = vi.fn()
    window.gtag = gtag
    renderAt(OUT_OF_SEASON)
    fireEvent.click(cta())
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'select_promotion',
      expect.objectContaining({
        promotion_id: 'red-vote',
        creative_slot: 'landing-block',
      })
    )
  })
})

/* Mobile Lighthouse gate (#2249): the block pulled Space Grotesk + Inter
   (71 KB) at first paint and the landing's LCP went 3273 → 3752 ms. The
   block is below the fold at every width, so its brand stacks apply only
   once it nears the viewport; until then the metric-matched fallback faces
   (no web font in the stack, so nothing is fetched) set the same metrics. */
describe('RedVoteBlock — brand fonts load only near the viewport (#2249 LCP)', () => {
  type IOCallback = (entries: IntersectionObserverEntry[]) => void
  let callbacks: IOCallback[]
  let observe: ReturnType<typeof vi.fn>
  beforeEach(() => {
    callbacks = []
    observe = vi.fn()
    class FakeIO {
      constructor(cb: IOCallback) {
        callbacks.push(cb)
      }
      observe = observe
      disconnect = vi.fn()
      unobserve = vi.fn()
      takeRecords = () => []
      root = null
      rootMargin = ''
      thresholds = []
    }
    vi.stubGlobal('IntersectionObserver', FakeIO)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('starts on the fallback faces and switches to the brand stacks when intersecting', () => {
    renderAt(OUT_OF_SEASON)
    const block = screen.getByTestId('red-vote-block')
    expect(block).not.toHaveClass('red-vote-block--brand-fonts')
    expect(observe).toHaveBeenCalledWith(block)
    act(() => {
      callbacks[0]!([{ isIntersecting: true } as IntersectionObserverEntry])
    })
    expect(block).toHaveClass('red-vote-block--brand-fonts')
  })

  it('uses the brand stacks at once where IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    renderAt(OUT_OF_SEASON)
    expect(screen.getByTestId('red-vote-block')).toHaveClass(
      'red-vote-block--brand-fonts'
    )
  })
})
