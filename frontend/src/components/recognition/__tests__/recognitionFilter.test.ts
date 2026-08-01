/**
 * Recognition filter semantics (#1362) — the rules, isolated from the UI.
 *
 * Faceted search, the conventional way: **OR within a group, AND across
 * groups**. Two award chips read as "either of these"; adding a tier narrows
 * that set rather than widening it.
 *
 *   awards=[Extension, Retention]  tier=Select
 *   → (Extension OR Retention) AND (tier >= Select)
 *
 * The tier leg is a **`>=` threshold**, not equality, because the tiers are an
 * ordinal ladder (Distinguished < Select < President's < Smedley) and the
 * registry already carries that ordering as `order`. "Select" means "Select or
 * better", which is what a user asking for Select actually wants.
 *
 * The URL codec lives here too: the tokens are derived from the registry ids
 * (lower-cased), never a second hand-written list that could drift from the
 * badges.
 */
import { describe, it, expect } from 'vitest'
import type { CompetitiveAwardStandings } from '../../../services/cdn'
import {
  EMPTY_RECOGNITION_FILTER,
  districtMatchesRecognition,
  isRecognitionFilterActive,
  parseAwardIds,
  serializeAwardIds,
  parseTierId,
  serializeTierId,
} from '../recognitionFilter'

const noAwards = {
  extensionRank: 0,
  extensionValue: 0,
  extensionIsWinner: false,
  twentyPlusRank: 0,
  twentyPlusValue: 0,
  twentyPlusIsWinner: false,
  retentionRank: 0,
  retentionValue: 0,
  retentionIsWinner: false,
}

const status = (districtId: string, currentTier: string) => ({
  districtId,
  currentTier,
  allPrerequisitesMet: currentTier !== 'NotDistinguished',
  prerequisites: {
    dspSubmitted: true,
    trainingMet: true,
    marketAnalysisSubmitted: true,
    communicationPlanSubmitted: true,
    regionAdvisorVisitMet: true,
  },
  nextTierGap: null,
})

/**
 * The worked example from the issue.
 *   D102 — Smedley, Extension + Retention
 *   D76  — Select,  Extension
 *   D59  — Select,  20-Plus
 *   D99  — no tier, no award
 */
const standings = {
  metadata: {
    snapshotId: '2026-05-18',
    calculatedAt: '2026-05-18T00:00:00Z',
    totalDistricts: 4,
  },
  extensionAward: [],
  twentyPlusAward: [],
  retentionAward: [],
  byDistrict: {
    '102': { ...noAwards, extensionIsWinner: true, retentionIsWinner: true },
    '76': { ...noAwards, extensionIsWinner: true },
    '59': { ...noAwards, twentyPlusIsWinner: true },
    '99': { ...noAwards },
  },
  distinguishedDistrict: {
    '102': status('102', 'Smedley'),
    '76': status('76', 'Select'),
    '59': status('59', 'Select'),
    '99': status('99', 'NotDistinguished'),
  },
} as unknown as CompetitiveAwardStandings

const match = (
  awards: Parameters<typeof serializeAwardIds>[0],
  tier: Parameters<typeof serializeTierId>[0],
  districtId: string
) =>
  districtMatchesRecognition({ awards, tier }, districtId, standings)

describe('recognition filter — the empty filter', () => {
  it('is inactive and admits every district', () => {
    expect(isRecognitionFilterActive(EMPTY_RECOGNITION_FILTER)).toBe(false)
    for (const id of ['102', '76', '59', '99']) {
      expect(
        districtMatchesRecognition(EMPTY_RECOGNITION_FILTER, id, standings)
      ).toBe(true)
    }
  })

  it('is active as soon as either group has a selection', () => {
    expect(isRecognitionFilterActive({ awards: ['extension'], tier: null })).toBe(
      true
    )
    expect(isRecognitionFilterActive({ awards: [], tier: 'Select' })).toBe(true)
  })
})

describe('recognition filter — OR within the award group', () => {
  it('admits a district holding ANY of the selected awards', () => {
    // D76 holds Extension only; D59 holds 20-Plus only. Both match the OR.
    expect(match(['extension', 'twentyPlus'], null, '76')).toBe(true)
    expect(match(['extension', 'twentyPlus'], null, '59')).toBe(true)
  })

  it('excludes a district holding none of them', () => {
    expect(match(['extension', 'retention'], null, '59')).toBe(false)
    expect(match(['extension', 'retention'], null, '99')).toBe(false)
  })

  it('does NOT require every selected award (that would be AND)', () => {
    // D76 has Extension but not Retention — an AND reading would drop it.
    expect(match(['extension', 'retention'], null, '76')).toBe(true)
  })
})

describe('recognition filter — tier is a >= threshold, not equality', () => {
  it('admits a district ABOVE the requested tier', () => {
    // D102 is Smedley; asking for Select must still show it.
    expect(match([], 'Select', '102')).toBe(true)
    expect(match([], 'Distinguished', '102')).toBe(true)
  })

  it('admits a district AT the requested tier', () => {
    expect(match([], 'Select', '76')).toBe(true)
  })

  it('excludes a district BELOW the requested tier', () => {
    expect(match([], 'Presidents', '76')).toBe(false)
    expect(match([], 'Smedley', '76')).toBe(false)
  })

  it('excludes a district holding no tier at all', () => {
    // `NotDistinguished` and `Unknown` are absence, the same convention the
    // badge and the row data-tier hook use.
    expect(match([], 'Distinguished', '99')).toBe(false)
  })
})

describe('recognition filter — AND across groups', () => {
  it('keeps only districts satisfying BOTH legs (the issue’s worked example)', () => {
    const awards = ['extension', 'retention'] as const
    expect(match([...awards], 'Select', '102')).toBe(true) // Smedley + both
    expect(match([...awards], 'Select', '76')).toBe(true) // Select + Extension
    expect(match([...awards], 'Select', '59')).toBe(false) // Select, no award
    expect(match([...awards], 'Select', '99')).toBe(false) // neither
  })

  it('rejects a district that clears the award leg but not the tier leg', () => {
    expect(match(['extension'], 'Smedley', '76')).toBe(false)
  })
})

describe('recognition filter — missing or partial standings', () => {
  it('matches nothing on an active filter when standings have not arrived', () => {
    expect(
      districtMatchesRecognition({ awards: ['extension'], tier: null }, '102', null)
    ).toBe(false)
    expect(
      districtMatchesRecognition({ awards: [], tier: 'Select' }, '102', undefined)
    ).toBe(false)
  })

  it('still admits everything when the filter is empty and standings are absent', () => {
    expect(
      districtMatchesRecognition(EMPTY_RECOGNITION_FILTER, '102', null)
    ).toBe(true)
  })

  it('tolerates a snapshot with no distinguishedDistrict block', () => {
    const noTiers = { ...standings, distinguishedDistrict: undefined }
    expect(
      districtMatchesRecognition({ awards: [], tier: 'Distinguished' }, '102', noTiers)
    ).toBe(false)
    expect(
      districtMatchesRecognition({ awards: ['extension'], tier: null }, '102', noTiers)
    ).toBe(true)
  })
})

describe('recognition filter — URL codec', () => {
  it('round-trips the award list through the ?awards= token', () => {
    expect(serializeAwardIds(['extension', 'retention'])).toBe(
      'extension,retention'
    )
    expect(parseAwardIds('extension,retention')).toEqual([
      'extension',
      'retention',
    ])
  })

  it('serializes awards in registry order so one selection has one URL', () => {
    // Click order must not produce two different links for the same view.
    expect(serializeAwardIds(['retention', 'extension'])).toBe(
      'extension,retention'
    )
  })

  it('drops tokens that are not registry award ids', () => {
    expect(parseAwardIds('extension,banana,,retention')).toEqual([
      'extension',
      'retention',
    ])
    expect(parseAwardIds('')).toEqual([])
  })

  it('round-trips the tier through a lower-cased ?tier= token', () => {
    expect(serializeTierId('Select')).toBe('select')
    expect(serializeTierId('Presidents')).toBe('presidents')
    expect(parseTierId('select')).toBe('Select')
    expect(parseTierId('presidents')).toBe('Presidents')
  })

  it('reads a tier token case-insensitively and rejects a non-tier', () => {
    expect(parseTierId('SMEDLEY')).toBe('Smedley')
    expect(parseTierId('notdistinguished')).toBeNull()
    expect(parseTierId('')).toBeNull()
    expect(serializeTierId(null)).toBe('')
  })
})
