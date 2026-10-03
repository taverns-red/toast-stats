/**
 * The counted-education-award rule (#1592, #1599): Pathways level 1–5 awards
 * and DTM count; anything else (e.g. the Pathways Mentor Program) does not.
 *
 * One rule, two consumers that must agree: collector-cli counts distinct
 * members per club by it, the frontend counts awards per club by it.
 */

import { describe, it, expect } from 'vitest'
import { isCountedEducationAward } from '../index.js'

describe('isCountedEducationAward', () => {
  it.each([
    'PM1Presentation Mastery Level 1',
    'VC3Visionary Communication Level 3',
    'PM5Presentation Mastery Level 5',
    'BT1Basic Training For Toastmasters Level 1',
    'DTMDistinguished Toastmaster',
  ])('counts %s', award => {
    expect(isCountedEducationAward(award)).toBe(true)
  })

  it.each([
    'PWMENTORPGMPathways Mentor Program',
    'PM6Not A Level',
    'pm1lowercase prefix',
    '',
  ])('does not count %j', award => {
    expect(isCountedEducationAward(award)).toBe(false)
  })
})
