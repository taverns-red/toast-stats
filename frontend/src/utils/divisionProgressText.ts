/**
 * Division Progress Text Generation Module
 *
 * This module provides functions for generating concise English paragraphs
 * describing a division's progress toward Distinguished Division recognition.
 *
 * The generated text includes:
 * - Current recognition level achieved (or that it's not yet distinguished)
 * - Current metrics (paid clubs, distinguished clubs)
 * - What's needed to reach the next achievable level
 * - Incremental differences for higher levels (building on previous requirements)
 *
 * Key differences from Area Progress Text:
 * - DDP uses 45%/50%/55% thresholds vs DAP's 50%/50%+1/50%+1
 * - DDP requires base/base+1/base+2 paid clubs vs DAP's base/base/base+1
 * - DDP has NO club visit requirements (DAP requires 75% visits)
 * - Club Success Plan completion is a count-only clause (#1555)
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import { DivisionPerformance } from './divisionStatus'
import {
  DivisionGapAnalysis,
  DivisionRecognitionLevel,
} from './divisionGapAnalysis'

/**
 * Result of generating progress text for a division
 */
export interface DivisionProgressText {
  /** Division identifier (e.g., "Division A") */
  divisionLabel: string
  /** Current recognition level achieved */
  currentLevel: DivisionRecognitionLevel
  /** Concise paragraph describing progress and gaps */
  progressText: string
}

/**
 * Get human-readable label for recognition level
 *
 * @param level - Recognition level
 * @returns Human-readable label
 */
function getRecognitionLevelLabel(level: DivisionRecognitionLevel): string {
  switch (level) {
    case 'presidents':
      return "President's Distinguished"
    case 'select':
      return 'Select Distinguished'
    case 'distinguished':
      return 'Distinguished'
    default:
      return 'not yet distinguished'
  }
}

/**
 * Generate the division label
 *
 * @param division - Division performance data
 * @returns Formatted division label (e.g., "Division A")
 */
function generateDivisionLabel(division: DivisionPerformance): string {
  return `Division ${division.divisionId}`
}

/**
 * Generate the current metrics description
 *
 * @param division - Division performance data
 * @returns Metrics string (e.g., "52 of 50 clubs paid, 24 of 50 distinguished")
 */
function generateMetricsDescription(division: DivisionPerformance): string {
  return `${division.paidClubs} of ${division.clubBase} clubs paid, ${division.distinguishedClubs} of ${division.clubBase} distinguished`
}

/**
 * Describe the division's Club Success Plan completion (#1555, spec §6.2) —
 * count only, since a division is too big to name clubs. Reads the
 * snapshot-derived roll-ups (`cspTracked`, `cspSubmittedCount`,
 * `clubsMissingCspCount`); the year gate is NOT re-derived here (R3).
 *
 * Returns `''` when not tracked (pre-2025-26, or column absent) or there are
 * no tracked clubs — never "0 of N" for a year with no requirement.
 */
function generateCspClause(division: DivisionPerformance): string {
  if (!division.cspTracked) {
    return ''
  }
  const submitted = division.cspSubmittedCount
  const missing = division.clubsMissingCspCount
  const total = submitted + missing
  if (total === 0) {
    return ''
  }
  if (missing === 0) {
    const clubWord = total === 1 ? 'club has' : 'clubs have'
    return `Club Success Plans: all ${total} ${clubWord} submitted.`
  }
  const submittedVerb = submitted === 1 ? 'has' : 'have'
  const missingClause =
    missing === 1
      ? '1 has not and cannot be Distinguished until it does.'
      : `${missing} have not and cannot be Distinguished until they do.`
  return `Club Success Plans: ${submitted} of ${total} clubs ${submittedVerb} submitted; ${missingClause}`
}

/**
 * Generate text describing what's needed for Distinguished level
 *
 * Distinguished Division: paidClubs >= clubBase AND distinguishedClubs >= 45% of clubBase
 *
 * @param gapAnalysis - Gap analysis for the division
 * @returns Text describing gap to Distinguished, or empty string if achieved
 */
function generateDistinguishedGapText(
  gapAnalysis: DivisionGapAnalysis
): string {
  if (gapAnalysis.distinguishedGap.achieved) {
    return ''
  }

  const clubsNeeded = gapAnalysis.distinguishedGap.distinguishedClubsNeeded
  const clubWord = clubsNeeded === 1 ? 'club needs' : 'clubs need'

  return `For Distinguished, ${clubsNeeded} more ${clubWord} to become distinguished.`
}

/**
 * Generate text describing what's needed for Select Distinguished level
 * (incremental from Distinguished)
 *
 * Select Distinguished Division: paidClubs >= clubBase + 1 AND distinguishedClubs >= 50% of clubBase
 *
 * Property 3: Incremental Gap Description
 * - First mention what's needed for the next level
 * - Then mention only the additional requirements for higher levels (not repeating previous requirements)
 *
 * @param gapAnalysis - Gap analysis for the division
 * @returns Text describing incremental gap to Select, or empty string if achieved
 */
function generateSelectGapText(gapAnalysis: DivisionGapAnalysis): string {
  if (gapAnalysis.selectGap.achieved) {
    return ''
  }

  const parts: string[] = []

  // Calculate incremental distinguished clubs needed beyond Distinguished
  const distinguishedClubsForDistinguished =
    gapAnalysis.distinguishedGap.distinguishedClubsNeeded
  const distinguishedClubsForSelect =
    gapAnalysis.selectGap.distinguishedClubsNeeded

  // If Distinguished is already achieved, show full gap to Select
  if (gapAnalysis.distinguishedGap.achieved) {
    // Show distinguished clubs needed (if any)
    if (distinguishedClubsForSelect > 0) {
      const clubWord =
        distinguishedClubsForSelect === 1 ? 'club needs' : 'clubs need'
      parts.push(
        `${distinguishedClubsForSelect} more ${clubWord} to become distinguished`
      )
    }

    // Show paid clubs needed (Select requires base + 1)
    const paidClubsNeeded = gapAnalysis.selectGap.paidClubsNeeded
    if (paidClubsNeeded > 0) {
      const paidWord = paidClubsNeeded === 1 ? 'paid club' : 'paid clubs'
      parts.push(`add ${paidClubsNeeded} ${paidWord}`)
    }
  } else {
    // Show incremental difference from Distinguished
    const incrementalDistinguished =
      distinguishedClubsForSelect - distinguishedClubsForDistinguished

    if (incrementalDistinguished > 0) {
      const clubWord =
        incrementalDistinguished === 1
          ? 'distinguished club'
          : 'distinguished clubs'
      parts.push(`${incrementalDistinguished} more ${clubWord}`)
    }

    // Select requires base + 1 paid clubs
    const paidClubsNeeded = gapAnalysis.selectGap.paidClubsNeeded
    if (paidClubsNeeded > 0) {
      const paidWord = paidClubsNeeded === 1 ? 'paid club' : 'paid clubs'
      parts.push(`add ${paidClubsNeeded} ${paidWord}`)
    }
  }

  if (parts.length === 0) {
    return ''
  }

  return `For Select Distinguished, ${parts.join(' and ')}.`
}

/**
 * Generate text describing what's needed for President's Distinguished level
 * (incremental from Select)
 *
 * President's Distinguished Division: paidClubs >= clubBase + 2 AND distinguishedClubs >= 55% of clubBase
 *
 * Property 3: Incremental Gap Description
 * - Only mention the additional requirements beyond Select (not repeating previous requirements)
 *
 * @param gapAnalysis - Gap analysis for the division
 * @returns Text describing incremental gap to President's, or empty string if achieved
 */
function generatePresidentsGapText(gapAnalysis: DivisionGapAnalysis): string {
  if (gapAnalysis.presidentsGap.achieved) {
    return ''
  }

  const parts: string[] = []

  // Calculate incremental distinguished clubs needed beyond Select
  const selectDistinguishedNeeded =
    gapAnalysis.selectGap.distinguishedClubsNeeded
  const presidentsDistinguishedNeeded =
    gapAnalysis.presidentsGap.distinguishedClubsNeeded

  // If Select is achieved, show full gap to President's
  if (gapAnalysis.selectGap.achieved) {
    // Show distinguished clubs needed (if any)
    if (presidentsDistinguishedNeeded > 0) {
      const clubWord =
        presidentsDistinguishedNeeded === 1
          ? 'distinguished club'
          : 'distinguished clubs'
      parts.push(`${presidentsDistinguishedNeeded} more ${clubWord}`)
    }

    // Show paid clubs needed (President's requires base + 2)
    const paidClubsNeeded = gapAnalysis.presidentsGap.paidClubsNeeded
    if (paidClubsNeeded > 0) {
      const paidWord = paidClubsNeeded === 1 ? 'paid club' : 'paid clubs'
      parts.push(`${paidClubsNeeded} more ${paidWord}`)
    }
  } else {
    // Show incremental difference from Select
    const incrementalDistinguished =
      presidentsDistinguishedNeeded - selectDistinguishedNeeded

    if (incrementalDistinguished > 0) {
      const clubWord =
        incrementalDistinguished === 1
          ? 'distinguished club'
          : 'distinguished clubs'
      parts.push(`${incrementalDistinguished} more ${clubWord}`)
    }

    // Calculate incremental paid clubs needed beyond Select
    const selectPaidNeeded = gapAnalysis.selectGap.paidClubsNeeded
    const presidentsPaidNeeded = gapAnalysis.presidentsGap.paidClubsNeeded
    const incrementalPaid = presidentsPaidNeeded - selectPaidNeeded

    if (incrementalPaid > 0) {
      const paidWord = incrementalPaid === 1 ? 'paid club' : 'paid clubs'
      parts.push(`${incrementalPaid} more ${paidWord}`)
    }
  }

  if (parts.length === 0) {
    return ''
  }

  return `For President's Distinguished, ${parts.join(' and ')}.`
}

/**
 * Generate text for a division with net club loss
 *
 * Property 4: Net Loss Blocker Display
 * - The progress text should clearly state the net club loss situation
 * - The progress text should explain that paid clubs must be added before recognition is possible
 *
 * Requirements: 6.1
 *
 * @param division - Division performance data
 * @param gapAnalysis - Gap analysis for the division
 * @returns Text describing eligibility requirement and subsequent gaps
 */
function generateNetLossText(
  division: DivisionPerformance,
  gapAnalysis: DivisionGapAnalysis
): string {
  const paidClubsNeeded = gapAnalysis.paidClubsNeeded
  const clubWord = paidClubsNeeded === 1 ? 'paid club' : 'paid clubs'

  const parts: string[] = []

  // First explain the eligibility requirement
  parts.push(`To become eligible, add ${paidClubsNeeded} ${clubWord}.`)

  // Then describe what's needed for Distinguished after eligibility
  // Distinguished requires 45% of club base
  const clubBase = division.clubBase
  const distinguishedClubs = division.distinguishedClubs

  const distinguishedThreshold = Math.ceil(clubBase * 0.45)
  const distinguishedNeeded = Math.max(
    0,
    distinguishedThreshold - distinguishedClubs
  )

  if (distinguishedNeeded > 0) {
    const dClubWord = distinguishedNeeded === 1 ? 'club needs' : 'clubs need'
    parts.push(
      `Then for Distinguished, ${distinguishedNeeded} ${dClubWord} to become distinguished.`
    )
  } else {
    parts.push('Then Distinguished requirements would be met.')
  }

  return parts.join(' ')
}

/**
 * Generate text for a division that has achieved a recognition level
 *
 * Property 5: Achievement Display
 * - The progress text should clearly state the achievement
 *
 * Property 6: President's Distinguished No Further Gaps
 * - For any division that has achieved President's Distinguished status,
 *   the progress text should not mention any further gaps or requirements.
 *
 * Requirements: 6.5, 6.6
 *
 * @param division - Division performance data
 * @param gapAnalysis - Gap analysis for the division
 * @returns Text describing achievement and any remaining gaps
 */
function generateAchievedText(
  division: DivisionPerformance,
  gapAnalysis: DivisionGapAnalysis
): string {
  const levelLabel = getRecognitionLevelLabel(gapAnalysis.currentLevel)
  const metrics = generateMetricsDescription(division)

  // Property 6: President's Distinguished - no further gaps to mention
  if (gapAnalysis.currentLevel === 'presidents') {
    return `has achieved ${levelLabel} status.`
  }

  // Select Distinguished - mention gap to President's
  if (gapAnalysis.currentLevel === 'select') {
    const presidentsGap = generatePresidentsGapText(gapAnalysis)
    if (presidentsGap) {
      return `has achieved ${levelLabel} status (${metrics}). ${presidentsGap}`
    }
    return `has achieved ${levelLabel} status (${metrics}).`
  }

  // Distinguished - mention gaps to Select and President's
  if (gapAnalysis.currentLevel === 'distinguished') {
    const selectGap = generateSelectGapText(gapAnalysis)
    const presidentsGap = generatePresidentsGapText(gapAnalysis)
    const gaps = [selectGap, presidentsGap].filter(Boolean).join(' ')
    if (gaps) {
      return `has achieved ${levelLabel} status (${metrics}). ${gaps}`
    }
    return `has achieved ${levelLabel} status (${metrics}).`
  }

  // Should not reach here, but handle gracefully
  return `has achieved ${levelLabel} status.`
}

/**
 * Generate text for a division that is not yet distinguished
 *
 * Property 3: Incremental Gap Description
 * - First mention what's needed for the next level
 * - Then mention only the additional requirements for higher levels
 *
 * Requirements: 5.2, 5.3, 6.2, 6.3, 6.4
 *
 * @param division - Division performance data
 * @param gapAnalysis - Gap analysis for the division
 * @returns Text describing current status and all gaps
 */
function generateNotDistinguishedText(
  division: DivisionPerformance,
  gapAnalysis: DivisionGapAnalysis
): string {
  const metrics = generateMetricsDescription(division)

  const distinguishedGap = generateDistinguishedGapText(gapAnalysis)
  const selectGap = generateSelectGapText(gapAnalysis)
  const presidentsGap = generatePresidentsGapText(gapAnalysis)

  const gaps = [distinguishedGap, selectGap, presidentsGap]
    .filter(Boolean)
    .join(' ')

  return `is not yet distinguished (${metrics}). ${gaps}`
}

/**
 * Generates a concise English paragraph describing a division's progress
 * toward Distinguished Division recognition.
 *
 * The generated text includes:
 * - Current status and recognition level achieved
 * - Current metrics (paid clubs, distinguished clubs)
 * - Eligibility requirements (no net club loss) if not met
 * - What's needed for the next level (building incrementally)
 * - Additional requirements for higher levels (only the differences)
 *
 * Examples:
 * - "Division A has achieved President's Distinguished status."
 * - "Division B has achieved Distinguished status (52 of 50 clubs paid, 24 of 50 distinguished).
 *    For Select Distinguished, 2 more clubs need to become distinguished and add 1 paid club.
 *    For President's Distinguished, 3 more distinguished clubs and 1 more paid club."
 * - "Division C has a net club loss (48 of 50 clubs paid). To become eligible,
 *    add 2 paid clubs. Then for Distinguished, 5 clubs need to become distinguished."
 * - "Division D is not yet distinguished (50 of 50 clubs paid, 20 of 50 distinguished).
 *    For Distinguished, 3 more clubs need to become distinguished.
 *    For Select Distinguished, 6 more distinguished clubs and 1 paid club.
 *    For President's Distinguished, 8 more distinguished clubs and 2 paid clubs."
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 *
 * @param division - Division performance data
 * @param gapAnalysis - Gap analysis for the division
 * @returns DivisionProgressText with label, level, and progress paragraph
 */
export function generateDivisionProgressText(
  division: DivisionPerformance,
  gapAnalysis: DivisionGapAnalysis
): DivisionProgressText {
  const divisionLabel = generateDivisionLabel(division)
  const currentLevel = gapAnalysis.currentLevel

  let progressText: string

  // Handle net club loss scenario first (Property 4, Requirement 6.1)
  if (!gapAnalysis.meetsNoNetLossRequirement) {
    const metrics = generateMetricsDescription(division)
    const netLossText = generateNetLossText(division, gapAnalysis)
    progressText = `${divisionLabel} has a net club loss (${metrics}). ${netLossText}`
  }
  // Handle achieved recognition levels (Property 5, Property 6, Requirement 6.5)
  else if (gapAnalysis.currentLevel !== 'none') {
    progressText = `${divisionLabel} ${generateAchievedText(division, gapAnalysis)}`
  }
  // Handle not yet distinguished (Property 3, Requirements 5.2, 5.3, 6.2, 6.3, 6.4)
  else {
    progressText = `${divisionLabel} ${generateNotDistinguishedText(division, gapAnalysis)}`
  }

  // Club Success Plan completion ends every branch (#1555). Empty when not
  // tracked, so pre-2025-26 prose is unchanged.
  progressText = `${progressText} ${generateCspClause(division)}`

  // Clean up any double spaces
  progressText = progressText.replace(/\s+/g, ' ').trim()

  return {
    divisionLabel,
    currentLevel,
    progressText,
  }
}
