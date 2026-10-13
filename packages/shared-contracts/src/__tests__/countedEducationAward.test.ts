/**
 * The counted-education-award rule (#1592, #1599): Pathways level 1–5 awards
 * and DTM count; anything else (e.g. the Pathways Mentor Program) does not.
 *
 * One rule, two consumers that must agree: collector-cli counts distinct
 * members per club by it, the frontend counts awards per club by it.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  awardCodeFromAward,
  educationAwardProgram,
  isCountedEducationAward,
} from '../index.js'

const vocabulary = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '__fixtures__',
      'education-award-vocabulary.json'
    ),
    'utf8'
  )
) as {
  ledgerPairs: { award: string; awardCode: string }[]
  reportAwards: string[]
}

describe('isCountedEducationAward', () => {
  it.each([
    'PM1Presentation Mastery Level 1',
    'VC3Visionary Communication Level 3',
    'PM5Presentation Mastery Level 5',
    'BT1Basic Training For Toastmasters Level 1',
    'BT5Basic Training For Toastmasters Level 5',
    // The vintage Communication Series path (#1976): a three-letter path
    // code, recorded verbatim from the 2026-10-12 daily feed.
    'CES1CS: Entertaining + Storytelling Level 1',
    'CES2CS: Entertaining + Storytelling Level 2',
    'CES3CS: Entertaining + Storytelling Level 3',
    'CES4CS: Entertaining + Storytelling Level 4',
    'CES5CS: Entertaining + Storytelling Level 5',
    'DTMDistinguished Toastmaster',
  ])('counts %s', award => {
    expect(isCountedEducationAward(award)).toBe(true)
  })

  it.each([
    'PWMENTORPGMPathways Mentor Program',
    'EOMOnline Meeting Mastery',
    'PM6Not A Level',
    'CES6Not A Level',
    'pm1lowercase prefix',
    '',
  ])('does not count %j', award => {
    expect(isCountedEducationAward(award)).toBe(false)
  })
})

/**
 * #1976: the leaderboards (this rule) and the #1801 rollup
 * (`educationAwardProgram`) must agree on what counts — Pathways levels and
 * DTM — for every award string recorded from staging.
 */
describe('isCountedEducationAward agrees with the rollup program tag', () => {
  const awards = [
    ...vocabulary.ledgerPairs.map(p => p.award),
    ...vocabulary.reportAwards,
  ]

  it.each(awards)('%j', award => {
    const program = educationAwardProgram(awardCodeFromAward(award))
    expect(isCountedEducationAward(award)).toBe(
      program === 'Pathways' || program === 'DTM'
    )
  })
})
