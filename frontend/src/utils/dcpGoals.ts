/**
 * Per-goal DCP progress model for ClubDCPGoalsPanel (#242, #1119).
 *
 * Goal semantics come from the shared definitions in analytics-core
 * (epic #1095): requirements are ANDed, columns within a requirement are
 * ORed — goal 10 is officer list AND (Oct dues OR Apr dues), per
 * docs/toastmasters-rules-reference.md §10.2. This module only adapts
 * them into the panel's display shape (sub-items + status text).
 */
import {
  DCP_GOAL_DEFINITIONS,
  isDcpGoalAchieved,
  readDcpGoalColumn,
  type DcpGoalDefinition,
} from '@toastmasters/analytics-core'
import type { ScrapedRecord } from '@toastmasters/shared-contracts'

export type { ScrapedRecord }

export interface DcpGoalProgress {
  goalNumber: number
  name: string
  category: 'Education' | 'Membership' | 'Training' | 'Administration'
  /** Sub-items for goals with multiple columns (Goal 9, 10) */
  subItems: Array<{
    label: string
    required: number
    achieved: number
  }>
  achieved: boolean
  /** Status text when not achieved */
  statusText: string
}

function buildStatusText(
  record: ScrapedRecord,
  definition: DcpGoalDefinition
): string {
  const gaps = definition.requirements
    .map(requirement => {
      const columns = requirement.anyOf.map(column => ({
        column,
        value: readDcpGoalColumn(record, column),
      }))
      if (columns.some(({ column, value }) => value >= column.required)) {
        return null
      }
      if (columns.length === 1) {
        const { column, value } = columns[0]!
        return `${column.required - value} ${column.label} needed`
      }
      return `${columns.map(c => c.column.label).join(' or ')} needed`
    })
    .filter(gap => gap !== null)
  return gaps.join(', ')
}

/**
 * Extract per-goal DCP progress from a raw CSV record.
 */
export function extractDcpGoalProgress(
  record: ScrapedRecord
): DcpGoalProgress[] {
  return DCP_GOAL_DEFINITIONS.map(definition => {
    const subItems = definition.requirements.flatMap(requirement =>
      requirement.anyOf.map(column => ({
        label: column.label,
        required: column.required,
        achieved: readDcpGoalColumn(record, column),
      }))
    )
    const achieved = isDcpGoalAchieved(record, definition)

    return {
      goalNumber: definition.goal,
      name: definition.name,
      category: definition.category,
      subItems,
      achieved,
      statusText: achieved ? '' : buildStatusText(record, definition),
    }
  })
}
