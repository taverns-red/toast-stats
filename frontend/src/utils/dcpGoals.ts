export type ScrapedRecord = Record<string, string | number | null>

export interface DcpGoalProgress {
  goalNumber: number
  name: string
  category: 'Education' | 'Membership' | 'Training' | 'Administration'
  /** Sub-items for goals with multiple requirements (Goal 9, 10) */
  subItems: Array<{
    label: string
    required: number | 'Y'
    achieved: number
  }>
  achieved: boolean
  /** Status text when not achieved */
  statusText: string
}

export interface GoalDef {
  goal: number
  name: string
  category: DcpGoalProgress['category']
  columns: Array<{
    csvKey: string
    label: string
    required: number | 'Y'
  }>
  /** How to determine achievement: 'each' = each column meets its required */
  mode: 'each'
}

export const GOAL_DEFINITIONS: GoalDef[] = [
  {
    goal: 1,
    name: 'Level 1 awards',
    category: 'Education',
    columns: [{ csvKey: 'Level 1s', label: 'Level 1 awards', required: 4 }],
    mode: 'each',
  },
  {
    goal: 2,
    name: 'Level 2 awards',
    category: 'Education',
    columns: [{ csvKey: 'Level 2s', label: 'Level 2 awards', required: 2 }],
    mode: 'each',
  },
  {
    goal: 3,
    name: 'More Level 2 awards',
    category: 'Education',
    columns: [
      { csvKey: 'Add. Level 2s', label: 'More Level 2 awards', required: 2 },
    ],
    mode: 'each',
  },
  {
    goal: 4,
    name: 'Level 3 awards',
    category: 'Education',
    columns: [{ csvKey: 'Level 3s', label: 'Level 3 awards', required: 2 }],
    mode: 'each',
  },
  {
    goal: 5,
    name: 'Level 4, Path Completion, or DTM',
    category: 'Education',
    columns: [
      {
        csvKey: 'Level 4s, Path Completions, or DTM Awards',
        label: 'Level 4/Path Completion/DTM',
        required: 1,
      },
    ],
    mode: 'each',
  },
  {
    goal: 6,
    name: 'Additional Level 4, Path Completion, or DTM',
    category: 'Education',
    columns: [
      {
        csvKey: 'Add. Level 4s, Path Completions, or DTM award',
        label: 'Additional Level 4/Path Completion/DTM',
        required: 1,
      },
    ],
    mode: 'each',
  },
  {
    goal: 7,
    name: 'New members',
    category: 'Membership',
    columns: [{ csvKey: 'New Members', label: 'New members', required: 4 }],
    mode: 'each',
  },
  {
    goal: 8,
    name: 'More new members',
    category: 'Membership',
    columns: [
      { csvKey: 'Add. New Members', label: 'More new members', required: 4 },
    ],
    mode: 'each',
  },
  {
    goal: 9,
    name: 'Officer training',
    category: 'Training',
    columns: [
      {
        csvKey: 'Off. Trained Round 1',
        label: 'Officers trained Jun–Aug',
        required: 4,
      },
      {
        csvKey: 'Off. Trained Round 2',
        label: 'Officers trained Nov–Feb',
        required: 4,
      },
    ],
    mode: 'each',
  },
  {
    goal: 10,
    name: 'Admin requirements',
    category: 'Administration',
    columns: [
      {
        csvKey: 'Mem. dues on time Oct',
        label: 'Membership dues on time (Oct)',
        required: 'Y' as const,
      },
      {
        csvKey: 'Mem. dues on time Apr',
        label: 'Membership dues on time (Apr)',
        required: 'Y' as const,
      },
      {
        csvKey: 'Off. List On Time',
        label: 'Officer list on time',
        required: 'Y' as const,
      },
    ],
    mode: 'each',
  },
]

/**
 * Extract per-goal DCP progress from a raw CSV record.
 */
export function extractDcpGoalProgress(
  record: ScrapedRecord
): DcpGoalProgress[] {
  return GOAL_DEFINITIONS.map(def => {
    const subItems = def.columns.map(col => {
      const raw = record[col.csvKey]
      const achieved =
        raw === null || raw === undefined || raw === ''
          ? 0
          : typeof raw === 'number'
            ? raw
            : parseInt(String(raw), 10) || 0
      return { label: col.label, required: col.required, achieved }
    })

    // Check if goal is achieved
    const allMet = subItems.every(item =>
      item.required === 'Y'
        ? item.achieved >= 1
        : item.achieved >= item.required
    )

    // Build status text
    let statusText = ''
    if (!allMet) {
      const gaps = subItems
        .filter(item =>
          item.required === 'Y'
            ? item.achieved < 1
            : item.achieved < item.required
        )
        .map(item => {
          if (item.required === 'Y') {
            return `${item.label} needed`
          }
          const gap = item.required - item.achieved
          return `${gap} ${item.label} needed`
        })
      statusText = gaps.join(', ')
    }

    return {
      goalNumber: def.goal,
      name: def.name,
      category: def.category,
      subItems,
      achieved: allMet,
      statusText,
    }
  })
}
