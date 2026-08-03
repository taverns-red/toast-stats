/**
 * Single shared source of truth for the 10 Distinguished Club Program (DCP)
 * goal definitions (epic #1095, #1118).
 *
 * Encodes, for every goal: the current dashboard CSV header (plus historical
 * aliases, tried in order), the official achievement threshold, and the rule
 * structure. Requirements are ANDed; columns within one requirement are ORed —
 * goal 10 is officer list AND (Oct dues OR Apr dues), per
 * docs/toastmasters-rules-reference.md §10.2.
 *
 * Semantics are verified against TI's own "Goals Met" column (2026-06-09
 * deep-dive audit: 0 mismatches across all 162 D61 clubs) and must stay
 * identical to what DataTransformer publishes as dcpGoalsAchieved — see the
 * parity tests in ../transformation/DataTransformer.test.ts.
 */

import type { ScrapedRecord } from '@taverns-red/shared-contracts'

export interface DcpGoalColumn {
  /** CSV header aliases, tried in order; the first present key wins */
  aliases: readonly string[]
  /** Human-readable label for UI surfaces (per-goal panel sub-items) */
  label: string
  /** Official threshold the column value must reach for this column to count */
  required: number
}

export interface DcpGoalDefinition {
  /** Goal number, 1-10 */
  goal: number
  name: string
  category: 'Education' | 'Membership' | 'Training' | 'Administration'
  /**
   * ANDed requirements; a requirement is satisfied when ANY of its columns
   * meets that column's threshold.
   */
  requirements: ReadonlyArray<{ anyOf: readonly DcpGoalColumn[] }>
}

export const DCP_GOAL_DEFINITIONS: readonly DcpGoalDefinition[] = [
  {
    goal: 1,
    name: 'Level 1 awards',
    category: 'Education',
    requirements: [
      {
        anyOf: [
          { aliases: ['Level 1s'], label: 'Level 1 awards', required: 4 },
        ],
      },
    ],
  },
  {
    goal: 2,
    name: 'Level 2 awards',
    category: 'Education',
    requirements: [
      {
        anyOf: [
          {
            // PY 2026-27 renamed this column when TI made Online Meeting
            // Mastery ("EOM") completions an alternative route to the goal
            // (#1399). Historical snapshots carry 'Level 2s'; first match
            // wins, so a record carrying both is read once, not summed.
            aliases: ['Level 2s or EOM', 'Level 2s'],
            label: 'Level 2 awards',
            required: 2,
          },
        ],
      },
    ],
  },
  {
    goal: 3,
    name: 'More Level 2 awards',
    category: 'Education',
    requirements: [
      {
        anyOf: [
          {
            // See goal 2 — same PY 2026-27 rename (#1399).
            aliases: ['Add. Level 2s or EOM', 'Add. Level 2s', 'Add Level 2s'],
            label: 'More Level 2 awards',
            required: 2,
          },
        ],
      },
    ],
  },
  {
    goal: 4,
    name: 'Level 3 awards',
    category: 'Education',
    requirements: [
      {
        anyOf: [
          { aliases: ['Level 3s'], label: 'Level 3 awards', required: 2 },
        ],
      },
    ],
  },
  {
    goal: 5,
    name: 'Level 4, Path Completion, or DTM',
    category: 'Education',
    requirements: [
      {
        anyOf: [
          {
            aliases: [
              'Level 4s, Path Completions, or DTM Awards',
              'Level 4s',
              'Level 4',
            ],
            label: 'Level 4/Path Completion/DTM',
            required: 1,
          },
        ],
      },
    ],
  },
  {
    goal: 6,
    name: 'Additional Level 4, Path Completion, or DTM',
    category: 'Education',
    requirements: [
      {
        anyOf: [
          {
            aliases: [
              'Add. Level 4s, Path Completions, or DTM award',
              'Add. Level 4s',
              'Add Level 4',
            ],
            label: 'Additional Level 4/Path Completion/DTM',
            required: 1,
          },
        ],
      },
    ],
  },
  {
    goal: 7,
    name: 'New members',
    category: 'Membership',
    requirements: [
      {
        anyOf: [
          { aliases: ['New Members'], label: 'New members', required: 4 },
        ],
      },
    ],
  },
  {
    goal: 8,
    name: 'More new members',
    category: 'Membership',
    requirements: [
      {
        anyOf: [
          {
            aliases: ['Add. New Members', 'Add New Members'],
            label: 'More new members',
            required: 4,
          },
        ],
      },
    ],
  },
  {
    goal: 9,
    name: 'Officer training',
    category: 'Training',
    requirements: [
      {
        anyOf: [
          {
            aliases: ['Off. Trained Round 1'],
            label: 'Officers trained Jun–Aug',
            required: 4,
          },
        ],
      },
      {
        anyOf: [
          {
            aliases: ['Off. Trained Round 2'],
            label: 'Officers trained Nov–Feb',
            required: 4,
          },
        ],
      },
    ],
  },
  {
    goal: 10,
    name: 'Admin requirements',
    category: 'Administration',
    requirements: [
      {
        anyOf: [
          {
            aliases: ['Mem. dues on time Oct'],
            label: 'Membership dues on time (Oct)',
            required: 1,
          },
          {
            aliases: ['Mem. dues on time Apr'],
            label: 'Membership dues on time (Apr)',
            required: 1,
          },
        ],
      },
      {
        anyOf: [
          {
            aliases: ['Off. List On Time'],
            label: 'Officer list on time',
            required: 1,
          },
        ],
      },
    ],
  },
]

/**
 * Whether a raw club-performance record carries the per-goal CSV columns.
 * Keyed on goal 1's header (aliases included). Consumers without goal
 * columns fall back: DataTransformer omits dcpGoalsAchieved, the analytics
 * module uses its sequential approximation.
 */
export function hasDcpGoalColumns(record: ScrapedRecord): boolean {
  const goalOneColumns = DCP_GOAL_DEFINITIONS[0]!.requirements[0]!.anyOf
  return goalOneColumns.some(column =>
    column.aliases.some(key => {
      const value = record[key]
      return value !== null && value !== undefined && value !== ''
    })
  )
}

/**
 * Read a goal column from a raw CSV record, trying aliases in order.
 * Mirrors DataTransformer.extractNumber: a present-but-unparseable value
 * falls through to the next alias; absence everywhere yields 0.
 */
export function readDcpGoalColumn(
  record: ScrapedRecord,
  column: DcpGoalColumn
): number {
  for (const key of column.aliases) {
    const value = record[key]
    if (value !== null && value !== undefined) {
      if (typeof value === 'number') {
        return value
      }
      const parsed = parseInt(String(value), 10)
      if (!isNaN(parsed)) {
        return parsed
      }
    }
  }
  return 0
}

/**
 * Evaluate one DCP goal against a raw club-performance CSV record.
 */
export function isDcpGoalAchieved(
  record: ScrapedRecord,
  definition: DcpGoalDefinition
): boolean {
  return definition.requirements.every(requirement =>
    requirement.anyOf.some(
      column => readDcpGoalColumn(record, column) >= column.required
    )
  )
}

/**
 * Evaluate all 10 DCP goals against a raw club-performance CSV record.
 * Index i holds goal i+1.
 */
export function computeDcpGoalsAchieved(record: ScrapedRecord): boolean[] {
  return DCP_GOAL_DEFINITIONS.map(definition =>
    isDcpGoalAchieved(record, definition)
  )
}
