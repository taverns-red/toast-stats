/**
 * Red Vote promotion config (#2090): the UTM-tagged link, the date-driven
 * District Council seasons, and the preview-only `?promoDate=` clock.
 */
import { describe, it, expect } from 'vitest'
import {
  RED_VOTE_COPY,
  PROD_HOSTNAME,
  activeRedVoteSeason,
  redVoteUrl,
  resolvePromoDate,
} from '../redVotePromo'

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12)

describe('redVoteUrl (#2090)', () => {
  it('targets the marketing page with source, medium and campaign UTMs', () => {
    const url = new URL(redVoteUrl('district-card'))
    expect(url.origin + url.pathname).toBe('https://taverns.red/red-vote')
    expect(url.searchParams.get('utm_source')).toBe('toast-stats')
    expect(url.searchParams.get('utm_medium')).toBe('district-card')
    expect(url.searchParams.get('utm_campaign')).toBe('red-vote')
  })

  it('carries the placement as the medium', () => {
    for (const p of [
      'district-card',
      'seasonal-banner',
      'footer',
      'methodology',
    ] as const) {
      expect(new URL(redVoteUrl(p)).searchParams.get('utm_medium')).toBe(p)
    }
  })
})

describe('activeRedVoteSeason (#2090)', () => {
  it.each([
    [day(2026, 8, 1), true],
    [day(2026, 9, 30), true],
    [day(2026, 3, 1), true],
    [day(2026, 5, 31), true],
    [day(2026, 7, 31), false],
    [day(2026, 10, 1), false],
    [day(2026, 2, 28), false],
    [day(2026, 6, 1), false],
    [day(2026, 12, 15), false],
  ])('%s in season: %s', (date, expected) => {
    expect(activeRedVoteSeason(date) !== null).toBe(expected)
  })

  it('keys each season by year, so a dismissal does not carry over', () => {
    const autumn = activeRedVoteSeason(day(2026, 9, 1))
    const spring = activeRedVoteSeason(day(2027, 4, 1))
    const nextAutumn = activeRedVoteSeason(day(2027, 8, 15))
    expect(autumn?.key).toBeTruthy()
    expect(new Set([autumn?.key, spring?.key, nextAutumn?.key]).size).toBe(3)
    expect(activeRedVoteSeason(day(2026, 8, 2))?.key).toBe(autumn?.key)
  })
})

describe('resolvePromoDate (#2090)', () => {
  const now = day(2026, 10, 15)

  it('is the real clock without an override', () => {
    expect(resolvePromoDate('', 'pr-1.web.app', now)).toBe(now)
  })

  it('honours ?promoDate= off the production host (previews, localhost)', () => {
    const d = resolvePromoDate('?promoDate=2026-09-10', 'x--pr-1.web.app', now)
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([
      2026, 9, 10,
    ])
    expect(activeRedVoteSeason(d)).not.toBeNull()
  })

  it('ignores ?promoDate= on production', () => {
    expect(resolvePromoDate('?promoDate=2026-09-10', PROD_HOSTNAME, now)).toBe(
      now
    )
  })

  it('ignores a malformed override', () => {
    for (const q of ['?promoDate=soon', '?promoDate=2026-13-40']) {
      expect(resolvePromoDate(q, 'localhost', now)).toBe(now)
    }
  })
})

describe('RED_VOTE_COPY (#2090)', () => {
  it('attributes Red Taverns and disclaims Toastmasters International', () => {
    const all = JSON.stringify(RED_VOTE_COPY)
    expect(all).toContain('Red Taverns')
    expect(RED_VOTE_COPY.disclaimer).toBe(
      'Not affiliated with Toastmasters International.'
    )
  })

  it('carries no contact details or meeting links', () => {
    const all = JSON.stringify(RED_VOTE_COPY)
    expect(all).not.toMatch(
      /@|mailto:|tel:|zoom\.us|meet\.google|\+?\d{3}[-.\s]\d{3}/i
    )
  })
})
