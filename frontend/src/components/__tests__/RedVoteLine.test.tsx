/**
 * RedVoteLine (#2653, decision D2) — the phone's one-line Red Vote pointer
 * near the top of the landing. The full block (RedVoteBlock) follows the
 * rankings on phones; desktop keeps the block where it was.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RedVoteLine } from '../RedVoteBlock'
import { RED_VOTE_COPY } from '../../config/redVotePromo'

const cta = () => screen.getByRole('link', { name: /see red vote/i })

describe('RedVoteLine (#2653)', () => {
  afterEach(() => {
    delete window.gtag
  })

  it('is one line of copy and the CTA, with none of the block', () => {
    render(<RedVoteLine />)
    const line = screen.getByTestId('red-vote-line')
    expect(line).toHaveTextContent(RED_VOTE_COPY.lineText)
    expect(line).not.toHaveTextContent(RED_VOTE_COPY.body)
    expect(line).not.toHaveTextContent(RED_VOTE_COPY.disclaimer)
    expect(screen.queryByTestId('red-vote-block')).toBeNull()
  })

  it('links to Red Vote with its own placement, in a new tab', () => {
    render(<RedVoteLine />)
    const url = new URL(cta().getAttribute('href') ?? '')
    expect(url.searchParams.get('utm_medium')).toBe('landing-line')
    expect(url.searchParams.get('utm_campaign')).toBe('red-vote')
    expect(cta()).toHaveAttribute('target', '_blank')
    expect(cta()).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('sends a GA4 select_promotion event with the landing-line slot', () => {
    const gtag = vi.fn()
    window.gtag = gtag
    render(<RedVoteLine />)
    fireEvent.click(cta())
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'select_promotion',
      expect.objectContaining({ creative_slot: 'landing-line' })
    )
  })
})
