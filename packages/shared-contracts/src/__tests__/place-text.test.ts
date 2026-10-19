/**
 * #2157 — one scrub for every free-text place field we publish.
 *
 * A Find-A-Club club in D02 typed its meeting passcode into its CITY field,
 * and it reached the public clubs-by-region shards. `scrubPlaceText` removes
 * meeting credentials, links and emails; a city with none of them comes back
 * byte-for-byte. Every value below is made up.
 */
import { describe, expect, it } from 'vitest'
import {
  containsMeetingCredential,
  containsPlaceSecret,
  scrubPlaceText,
  stripMeetingCredentials,
} from '../index.js'

describe('scrubPlaceText: meeting credentials (#2157)', () => {
  it('reproduces the D02 city case (redacted): the city survives', () => {
    expect(scrubPlaceText('Springfield Passcode: 000000')).toBe('Springfield')
  })

  it.each([
    ['Springfield, Passcode: 000000', 'Springfield'],
    ['Springfield passcode 000000', 'Springfield'],
    ['Springfield PASSCODE: abc123', 'Springfield'],
    ['Springfield (Passcode: 000000)', 'Springfield'],
    ['Passcode: 000000', ''],
    ['Pass code: 000000, Springfield', 'Springfield'],
    ['Springfield Password: hunter0', 'Springfield'],
    ['Springfield password is hunter0', 'Springfield'],
    ['Springfield pwd: 000000', 'Springfield'],
    ['Springfield Pwd=Ab0cD', 'Springfield'],
    ['Springfield PIN: 0000', 'Springfield'],
    ['Springfield pin 0000', 'Springfield'],
    ['Springfield Meeting ID: 000 0000 0000', 'Springfield'],
    ['Springfield Meeting ID 00000000000', 'Springfield'],
    ['Springfield MtgID: 000 0000 000', 'Springfield'],
    ['Springfield Mtg ID 000-0000-000', 'Springfield'],
    ['Springfield Webinar ID: 000 000 0000', 'Springfield'],
    ['Springfield, ID: 000 0000 0000', 'Springfield'],
    ['Springfield ID# 0000000000', 'Springfield'],
    ['Springfield Access code: 000000', 'Springfield'],
    ['Montréal mot de passe : 000000', 'Montréal'],
    ['Montréal, code d’accès: 000000', 'Montréal'],
    ['Springfield Meeting ID: 000 0000 0000 Passcode: 000000', 'Springfield'],
    ['Springfield; Zoom ID: 000 000 0000; Passcode: x0x0', 'Springfield'],
    ['Springfield, Zoom ID 000 0000 0000', 'Springfield'],
    ['Springfield Passcode:', 'Springfield'],
  ])('%j → %j', (input, expected) => {
    expect(scrubPlaceText(input)).toBe(expected)
    expect(containsPlaceSecret(scrubPlaceText(input))).toBe(false)
  })

  // #2157 residue: shapes the first scrub left behind in prod files.
  it.each([
    ['Springfield PW:0000', 'Springfield'],
    ['Springfield PW: 0000', 'Springfield'],
    ['Springfield pw 000000', 'Springfield'],
    ['Springfield pw: Ab00', 'Springfield'],
    ['Springfield, Pc: 000000', 'Springfield'],
    ['Springfield PC 000000', 'Springfield'],
    ['Springfield Zoom ID:  000  0000  0000', 'Springfield'],
    ['Springfield Meeting ID 000..0000..0000', 'Springfield'],
    ['Springfield Meeting ID 000--0000--0000', 'Springfield'],
    ['Springfield Meeting ID 000 - 0000 - 0000', 'Springfield'],
    ['Zoom ID:  000  0000  0000   PW:0000, 9 Main St', '9 Main St'],
    ['Mtg ID: 00000000000  pw 000000', ''],
    // A "PW" label between ";" separators, value on the next line.
    ['Zoom; PW; 0000\nONLY', 'Zoom; ONLY'],
    ['Zoom; pw; 0000', 'Zoom'],
  ])('residue %j → %j', (input, expected) => {
    expect(scrubPlaceText(input)).toBe(expected)
    expect(containsPlaceSecret(scrubPlaceText(input))).toBe(false)
  })

  it('also strips links and emails (the #2069 contract)', () => {
    expect(scrubPlaceText('Springfield, bit.ly/abc123')).toBe('Springfield')
    expect(scrubPlaceText('Springfield club-1@example.com')).toBe('Springfield')
    expect(
      scrubPlaceText('Zoom Link: zoom.us/j/000?pwd=Ab0, Passcode: 000000')
    ).toBe('')
  })
})

describe('scrubPlaceText: real place names survive (false-positive guards)', () => {
  it.each([
    'Pinner',
    'Pine Bluff',
    'Pinehurst',
    'Pinellas Park',
    'Pin Oak Acres',
    'Pingtung',
    'Spinney Hill',
    'Idaho Falls',
    'Boise, ID 83702',
    'Boise ID',
    'Madrid',
    'Pass Christian',
    'Passau',
    'Passaic',
    'Codeville',
    'Paso Robles',
    'Port Washington',
    'Saint-Jean-sur-Richelieu',
    'Côte-Saint-Luc',
    '100-1234 Chemin du Lac',
    'Suite 200, 9 Main St',
    'Room 4, Building 7',
    "St. John's",
    'Ho Chi Minh City',
    // #2157 residue fix: pw/pc and wider digit groups must not eat these.
    'K1A 0B1',
    'SW1A 1AA',
    '90210-1234',
    'Suite 1200, 9 Main St',
    'PC World, 9 Main St',
    'PC Building',
    'PW Library',
    'Pwllheli',
    '12-34-56 Main St',
    '1234 - 5678 Chemin du Lac',
    'Room 3-401',
    'Room 3 - 401, Building 7',
    'Unit 5  -  12 Main St',
    // A ";" after "PW" takes a digits-only value, so these are places.
    'PW; Library',
    'PW; 4th Floor',
    'PW; 12-B Main',
    'Unit 4; PW; Main Hall',
    '',
  ])('%j is returned unchanged', place => {
    expect(scrubPlaceText(place)).toBe(place)
    expect(containsPlaceSecret(place)).toBe(false)
  })
})

describe('the credential helpers', () => {
  it('containsMeetingCredential is case-insensitive and needs a value', () => {
    expect(containsMeetingCredential('x PaSsCoDe: 000000')).toBe(true)
    expect(containsMeetingCredential('x meeting id 000 0000 000')).toBe(true)
    expect(containsMeetingCredential('x PIN 0000')).toBe(true)
    expect(containsMeetingCredential('Pin Oak Acres')).toBe(false)
    expect(containsMeetingCredential('Boise, ID 83702')).toBe(false)
  })

  it('is stable: a second call finds the regex fresh (no lastIndex leak)', () => {
    expect(containsMeetingCredential('a Passcode: 000000')).toBe(true)
    expect(containsMeetingCredential('b Passcode: 000000')).toBe(true)
  })

  it('stripMeetingCredentials leaves links alone (stripLinks owns those)', () => {
    expect(stripMeetingCredentials('9 Main St, bit.ly/abc123')).toBe(
      '9 Main St, bit.ly/abc123'
    )
  })

  it('containsPlaceSecret covers links and emails too', () => {
    expect(containsPlaceSecret('9 Main St, bit.ly/abc123')).toBe(true)
    expect(containsPlaceSecret('club-1@example.com')).toBe(true)
  })
})
