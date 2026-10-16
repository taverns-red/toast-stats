/**
 * Red Vote promotion surfaces (#2090). The clock is injected through the
 * preview-only `?promoDate=` override (jsdom's host is localhost, not prod).
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RedVotePromo, RedVoteMadeByLine } from '../RedVotePromo'
import { RED_VOTE_COPY } from '../../config/redVotePromo'

const IN_SEASON = '?promoDate=2026-09-10'
const OUT_OF_SEASON = '?promoDate=2026-10-15'

function renderAt(search: string, ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[`/district/61${search}`]}>{ui}</MemoryRouter>
  )
}

const ctaLink = () => screen.getByRole('link', { name: /see red vote/i })
const medium = (a: HTMLElement) =>
  new URL(a.getAttribute('href') ?? '').searchParams.get('utm_medium')

describe('RedVotePromo (#2090)', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => {
    delete window.gtag
    vi.restoreAllMocks()
  })

  it('out of season, the district surface shows the quiet card', () => {
    renderAt(OUT_OF_SEASON, <RedVotePromo surface="district" />)
    expect(
      screen.getByRole('heading', { name: RED_VOTE_COPY.cardHeading })
    ).toBeInTheDocument()
    expect(medium(ctaLink())).toBe('district-card')
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull()
    expect(screen.getByText(RED_VOTE_COPY.disclaimer)).toBeInTheDocument()
  })

  it('out of season, the landing surface renders nothing', () => {
    const { container } = renderAt(
      OUT_OF_SEASON,
      <RedVotePromo surface="landing" />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('in season, both surfaces show the dismissible banner', () => {
    for (const surface of ['district', 'landing'] as const) {
      const { unmount } = renderAt(
        IN_SEASON,
        <RedVotePromo surface={surface} />
      )
      expect(
        screen.getByRole('heading', { name: RED_VOTE_COPY.bannerHeading })
      ).toBeInTheDocument()
      expect(medium(ctaLink())).toBe('seasonal-banner')
      expect(screen.getByText(RED_VOTE_COPY.disclaimer)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: RED_VOTE_COPY.dismissLabel })
      ).toBeInTheDocument()
      unmount()
    }
  })

  it('dismissing is remembered: the district falls back to the quiet card', () => {
    const { unmount } = renderAt(IN_SEASON, <RedVotePromo surface="district" />)
    fireEvent.click(
      screen.getByRole('button', { name: RED_VOTE_COPY.dismissLabel })
    )
    expect(
      screen.getByRole('heading', { name: RED_VOTE_COPY.cardHeading })
    ).toBeInTheDocument()
    unmount()

    // A fresh mount (another page) remembers it; the landing shows nothing.
    const { container } = renderAt(
      IN_SEASON,
      <RedVotePromo surface="landing" />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders without storage (getItem/setItem throw)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    renderAt(IN_SEASON, <RedVotePromo surface="landing" />)
    fireEvent.click(
      screen.getByRole('button', { name: RED_VOTE_COPY.dismissLabel })
    )
    expect(screen.queryByRole('link', { name: /see red vote/i })).toBeNull()
  })

  it('sends a GA4 select_promotion event with the placement on click', () => {
    const gtag = vi.fn()
    window.gtag = gtag
    renderAt(OUT_OF_SEASON, <RedVotePromo surface="district" />)
    fireEvent.click(ctaLink())
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'select_promotion',
      expect.objectContaining({
        promotion_id: 'red-vote',
        creative_slot: 'district-card',
      })
    )
  })

  it('a click without gtag (preview, localhost) does not throw', () => {
    renderAt(OUT_OF_SEASON, <RedVotePromo surface="district" />)
    expect(() => fireEvent.click(ctaLink())).not.toThrow()
  })

  it('opens the external page in a new tab with a safe rel', () => {
    renderAt(OUT_OF_SEASON, <RedVotePromo surface="district" />)
    expect(ctaLink()).toHaveAttribute('target', '_blank')
    expect(ctaLink()).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

describe('RedVoteMadeByLine (#2090)', () => {
  afterEach(() => {
    delete window.gtag
  })

  it.each(['footer', 'methodology'] as const)(
    'reads "Free from Red Taverns · Also from us: Red Vote" (%s)',
    placement => {
      renderAt('', <RedVoteMadeByLine placement={placement} />)
      const line = screen.getByTestId('red-vote-made-by')
      expect(line).toHaveTextContent(
        'Free from Red Taverns · Also from us: Red Vote'
      )
      expect(line).toHaveTextContent(RED_VOTE_COPY.disclaimer)
      const link = screen.getByRole('link', { name: 'Red Vote' })
      expect(medium(link)).toBe(placement)
    }
  )

  it('tracks the click with its placement', () => {
    const gtag = vi.fn()
    window.gtag = gtag
    renderAt('', <RedVoteMadeByLine placement="footer" />)
    fireEvent.click(screen.getByRole('link', { name: 'Red Vote' }))
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'select_promotion',
      expect.objectContaining({ creative_slot: 'footer' })
    )
  })
})
