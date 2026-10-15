/**
 * No link of any kind in a club's published meeting place (#2069, #1879).
 *
 * The recorded strings are TI Find-A-Club `Address.Street` values from
 * snapshots/2026-10-14/district_201.json and district_61.json on prod (read
 * 2026-10-15). The link itself is replaced by a same-shape placeholder and
 * house numbers by 9s: no real link, id or passcode is fixtured.
 */
import { describe, it, expect } from 'vitest'
import { containsLink, isShortenedLink, stripLinks } from '../index.js'

/** Club 977 (D201): a shortened Zoom link, then the street address. */
const CLUB_977_STREET = 'Zoom Link: bit.ly/REDACTED977, 9999 Overland Ave'

describe('stripLinks (#2069)', () => {
  it('drops the scheme-less bit.ly Zoom link and its label from club 977, keeping the street', () => {
    expect(stripLinks(CLUB_977_STREET)).toBe('9999 Overland Ave')
  })

  it.each([
    // D201 7871284: the street is only a link.
    ['bit.ly/REDACTED00', ''],
    // D201 1098501: the link follows the address.
    ['999 W 999th St, bit.ly/REDACTED00', '999 W 999th St'],
    // D201 28675725: a Zoom link before the address.
    [
      'https://us99web.zoom.us/j/99999999999 9999 Airport Plaza Drive, Suite 9',
      '9999 Airport Plaza Drive, Suite 9',
    ],
    // D61 1009147.
    ['https://us99web.zoom.us/j/999999999', ''],
  ])('recorded street %j → %j', (street, expected) => {
    expect(stripLinks(street)).toBe(expected)
  })

  it.each([
    'bit.ly/abc123',
    'bitly.com/abc123',
    'tinyurl.com/abc123',
    'www.tinyurl.com/abc123',
    't.co/abc123',
    'goo.gl/abc123',
    'ow.ly/abc123',
    'is.gd/abc123',
    'rebrand.ly/abc123',
    'cutt.ly/abc123',
    'shorturl.at/abc12',
    'tiny.cc/abc123',
    'rb.gy/abc123',
    'forms.gle/abc123',
    'zoom.us/j/99999999',
    'us02web.zoom.us/j/99999999?pwd=abc',
    'meet.google.com/abc-defg-hij',
    'teams.microsoft.com/l/meetup-join/abc',
    'teams.live.com/meet/9999',
    'acme.webex.com/meet/club',
    'meet.jit.si/OurClub',
    'https://example.org/club',
    'http://example.org',
    'www.example.org',
    'example.org/meet',
    'club.example.com/join?x=1',
    'clubsite.com',
  ])('drops %s, with or without a label, before or after the address', link => {
    for (const text of [
      link,
      `Zoom Link: ${link}`,
      `Meeting link - ${link}, 9 Main St`,
      `9 Main St (${link})`,
      `Join us at ${link} | 9 Main St`,
    ]) {
      const out = stripLinks(text)
      expect(out).not.toMatch(/[a-z0-9-]+\.[a-z]{2,}/i)
      expect(out).not.toMatch(/link|join/i)
      expect(containsLink(out)).toBe(false)
    }
    expect(stripLinks(`Zoom Link: ${link}, 9 Main St`)).toBe('9 Main St')
    expect(stripLinks(`9 Main St, ${link}`)).toBe('9 Main St')
  })

  it.each([
    '790 Edgar Street, Court Building',
    '23300 58th Ave W',
    'Suite 5/6, 100 King St. W.',
    'St. Louis Hall, Room 2B',
    'Zoom Only',
    'Virtual, Note: Currently meeting with zoom.',
    'Contact us for Zoom Details',
    'Zoom link sent on request',
    'Online via Zoom',
    'U.S. Bank Tower, 633 W. 5th St.',
  ])('keeps a place with no link unchanged: %s', place => {
    expect(stripLinks(place)).toBe(place)
    expect(containsLink(place)).toBe(false)
  })

  it('keeps a bare platform name, which says how the club meets', () => {
    expect(stripLinks('Hall, Zoom: bit.ly/abc123')).toBe('Hall, Zoom')
  })

  it('keeps the punctuation around a link', () => {
    expect(stripLinks('7:30 pm (bit.ly/abc123)')).toBe('7:30 pm')
    expect(stripLinks('9 W 9th St, bit.ly/abc123, Room 4')).toBe(
      '9 W 9th St, Room 4'
    )
  })

  it('drops an email too', () => {
    expect(stripLinks('9 Main St, club-1@example.com')).toBe('9 Main St')
  })

  it('passes an empty string through', () => {
    expect(stripLinks('')).toBe('')
  })
})

describe('containsLink (#2069)', () => {
  it('finds the scheme-less link in club 977', () => {
    expect(containsLink(CLUB_977_STREET)).toBe(true)
  })
})

describe('isShortenedLink (#2069)', () => {
  it.each([
    'https://bit.ly/abc123',
    'http://tinyurl.com/abc123',
    'https://www.tinyurl.com/abc123',
    'bit.ly/abc123',
    'https://forms.gle/abc',
  ])('is true for %s', url => {
    expect(isShortenedLink(url)).toBe(true)
  })

  it.each([
    'https://1009147.toastmastersclubs.org/',
    'https://www.meetup.com/club',
    'https://example.org/bit.ly/x',
    'https://notbit.ly.example.com/',
  ])('is false for %s', url => {
    expect(isShortenedLink(url)).toBe(false)
  })
})
