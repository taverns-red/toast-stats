/**
 * #2167 — no phone number in any published place text.
 *
 * Clubs type phone numbers into Find-A-Club place fields (street, city,
 * Location, meeting day). Club phone keys are already dropped at ingest
 * (#2030); a phone typed into a place field is not, so it reached public
 * snapshot JSON. `scrubPlaceText` now removes phone numbers too, but only
 * shapes with a phone signal: a label (tel, phone, call…), a "+" country
 * code, the NANP 3-3-4 shape with separators, or French 0X XX XX XX XX
 * pairs. Street, postal, suite, room and box numbers, dates and times are
 * places. Every number below is made up (555 / 0100 style).
 */
import { describe, expect, it } from 'vitest'
import {
  containsPhoneNumber,
  containsPlaceSecret,
  scrubPlaceText,
  stripPhoneNumbers,
} from '../index.js'

describe('scrubPlaceText: phone numbers (#2167)', () => {
  it.each([
    // NANP 3-3-4 with separators, no label.
    ['Springfield 555-555-0100', 'Springfield'],
    ['Springfield (555) 555-0100', 'Springfield'],
    ['Springfield 555.555.0100', 'Springfield'],
    ['Springfield 555 555 0100', 'Springfield'],
    ['9 Main St, 1-555-555-0100', '9 Main St'],
    ['9 Main St, +1 (555) 555-0100', '9 Main St'],
    ['1st and 3rd Tuesday 555.555.0100', '1st and 3rd Tuesday'],
    ['Call with questions: 555-010-0199', 'Call with questions'],
    // A "+" country code (international groupings).
    ['9 Main St, +1 555 555 0100', '9 Main St'],
    ['9 Main St, +65 5555 0100', '9 Main St'],
    ['9 Main St +44 20 5555 0100', '9 Main St'],
    ['9 Main St, +33 1 55 55 01 00', '9 Main St'],
    ['9 Main St (+65) 5555 0100', '9 Main St'],
    ['+255 555 555 010, 9 Main St', '9 Main St'],
    // French 0X XX XX XX XX pairs.
    ['Springfield 05 55 55 01 00', 'Springfield'],
    ['Springfield 05.55.55.01.00', 'Springfield'],
    // A label and its number, the label goes too.
    ['9 Main St, Tel: 55550100', '9 Main St'],
    ['9 Main St tel 55550100', '9 Main St'],
    ['9 Main St, tel:55550100', '9 Main St'],
    ['Springfield, Phone 5555 0100', 'Springfield'],
    ['Ph: 555-0100, 9 Main St', '9 Main St'],
    ['Call 555-0100', ''],
    ['Mobile: 0555 555 010', ''],
    ['Cell 555 0100', ''],
    ['WhatsApp +55 55 5555 0100', ''],
    ['Téléphone : 05 55 55 01 00', ''],
    ['Phone: 555-0100 / 555-0101', ''],
    ['Springfield Tel. No. 555-0100', 'Springfield'],
    ['Springfield (Tel: 555-0100)', 'Springfield'],
  ])('%j → %j', (input, expected) => {
    expect(scrubPlaceText(input)).toBe(expected)
    expect(containsPhoneNumber(input)).toBe(true)
    expect(containsPlaceSecret(input)).toBe(true)
    expect(containsPlaceSecret(scrubPlaceText(input))).toBe(false)
  })

  it('strips a phone and a passcode in one value', () => {
    expect(
      scrubPlaceText('Springfield, Passcode: 000000, Tel: 555-555-0100')
    ).toBe('Springfield')
  })
})

describe('scrubPlaceText: number-like places survive (#2167 guards)', () => {
  it.each([
    // Postal and ZIP codes, including ZIP+4 and Japanese and Brazilian.
    '9 Main St, Springfield, IL 62701-1234',
    'Seattle, WA 98101-1234',
    'Mobile, AL 36602-1234',
    '1-2-3 Ginza, Chuo-ku, Tokyo 104-0061',
    '〒104-0061',
    '01310-100',
    '12.345-678',
    '0123456789',
    '012345678901',
    // Street, suite, unit, room, floor, building and box numbers.
    '23300 58th Ave W',
    '100-1234 Chemin du Lac',
    '1234 - 5678 Chemin du Lac',
    'Suite 555-100, 9 Main St',
    'Unit 5-12, 1234 Main St',
    'Room 1234, Floor 12, Building 5',
    'Room 3-401, Building 7',
    'Bldg 5, 1234 56th Ave',
    'PO Box 55501',
    'P.O. Box 1234567',
    'Calle 55 # 55-01',
    'Carrera 7 No. 71-21',
    '12345-678 Main St',
    // Highways and kilometre markers.
    'Highway 101, Km 12+500',
    'Route 66, Km 12 + 500',
    // Dates and times.
    '2026-10-19',
    '19.10.2026',
    '10.19.2026',
    '18:30 - 20:30',
    '1900 - 2030',
    '7:00 PM - 8:30 PM',
    // Labels that are places, or a label with no number.
    'Tel Aviv-Yafo',
    'Tel Aviv 6100000',
    'Phase 2, 1234 Main St',
    'Cellar Door, 12 Main St',
    'Call Street',
    'Phone booth corner',
    // A bare number with no phone signal stays (no label, + or shape).
    '1234 5678',
    'Springfield',
    '',
  ])('%j is returned unchanged', place => {
    expect(scrubPlaceText(place)).toBe(place)
    expect(containsPhoneNumber(place)).toBe(false)
    expect(containsPlaceSecret(place)).toBe(false)
  })
})

describe('stripPhoneNumbers', () => {
  it('leaves links and credentials to their own rules', () => {
    expect(stripPhoneNumbers('Passcode: 000000')).toBe('Passcode: 000000')
    expect(stripPhoneNumbers('9 Main St, bit.ly/abc123')).toBe(
      '9 Main St, bit.ly/abc123'
    )
  })

  it('is stable: a second call finds the regex fresh (no lastIndex leak)', () => {
    expect(containsPhoneNumber('a 555-555-0100')).toBe(true)
    expect(containsPhoneNumber('b 555-555-0100')).toBe(true)
  })
})
