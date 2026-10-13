/**
 * Award code from the rendered award string (#1801).
 *
 * The ledger history (#1802) carries `awardCode`, split by the collector
 * from the award cell's markup. The reports dataset's `educationAchievements`
 * (archive 2019-20 → 2025-26 and the daily current-PY feed) carries only the
 * rendered `award` — code immediately followed by title. The education
 * rollup must tag both by the same code → program rule, so the code is
 * recovered from the string, and that recovery is proven on the recorded
 * vocabulary: every ledger (award, awardCode) pair the collector split from
 * markup must split identically from the string alone.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  awardCodeFromAward,
  educationAwardProgram,
  pathwaysLevel,
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

describe('awardCodeFromAward — recorded vocabulary', () => {
  it.each(vocabulary.ledgerPairs.map(p => [p.award, p.awardCode]))(
    '%s → %s (the collector split it from markup)',
    (award, awardCode) => {
      expect(awardCodeFromAward(award)).toBe(awardCode)
    }
  )

  it('every recorded reports award resolves to a Pathways, Legacy or DTM code', () => {
    const untagged = vocabulary.reportAwards.filter(
      a => educationAwardProgram(awardCodeFromAward(a)) === 'Other'
    )
    expect(untagged).toEqual([])
  })
})

describe('awardCodeFromAward — shapes', () => {
  it.each([
    ['PM1Presentation Mastery Level 1', 'PM1'],
    ['ALBAdvanced Leader Bronze', 'ALB'],
    ['ALAdvanced Leader', 'AL'],
    ['ATMBAdvanced Toastmaster Bronze', 'ATMB'],
    ['ATMAdvanced Toastmaster', 'ATM'],
    ['CCCompetent Communicator', 'CC'],
    ['DTMDistinguished Toastmaster', 'DTM'],
    ['PWMENTORPGMPathways Mentor Program', 'PWMENTORPGM'],
    // A newer path code (recorded D49, 2026-10-12): three capitals + level.
    ['CES1CS: Entertaining + Storytelling Level 1', 'CES1'],
  ])('%s → %s', (award, code) => {
    expect(awardCodeFromAward(award)).toBe(code)
  })

  it.each(['', '   ', 'Competent Communicator'])(
    '%j has no code → "" (Other, still counted)',
    award => {
      expect(awardCodeFromAward(award)).toBe('')
    }
  )
})

describe('educationAwardProgram — three-capital Pathways path codes', () => {
  it('CES1 is a Pathways level (title "… Level 1")', () => {
    expect(educationAwardProgram('CES1')).toBe('Pathways')
  })

  it('a code with no level digit is still not Pathways', () => {
    expect(educationAwardProgram('CES')).toBe('Other')
  })
})

describe('pathwaysLevel', () => {
  it.each([
    ['PM1', { path: 'PM', level: 1 }],
    ['VC5', { path: 'VC', level: 5 }],
    ['CES1', { path: 'CES', level: 1 }],
  ])('%s → %j', (code, expected) => {
    expect(pathwaysLevel(code)).toEqual(expected)
  })

  it.each(['DTM', 'CC', 'PM6', ''])('%j is not a Pathways level', code => {
    expect(pathwaysLevel(code)).toBeNull()
  })
})
