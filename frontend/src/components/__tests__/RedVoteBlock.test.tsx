/**
 * RedVoteBlock (#2249) — the landing's one Red Vote surface: a
 * self-contained block in Red Vote's own colours, logo and type, prominent
 * but secondary (after the World pulse). Copy, link and seasons come from
 * config/redVotePromo.ts (ops#117); the placement is `landing-block`.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
