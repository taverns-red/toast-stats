/**
 * ClubDCPGoalsCard (#242)
 *
 * Displays per-goal DCP progress for a single club, sourced from raw CSV data.
 * Shows all 10 goals grouped by category with achieved/required counts and status.
 */

import React from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

type ScrapedRecord = Record<string, string | number | null>

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

// ── Goal Definitions ───────────────────────────────────────────────────────

interface GoalDef {
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

const GOAL_DEFINITIONS: GoalDef[] = [
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

// ── Extraction ─────────────────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<
  DcpGoalProgress['category'],
  { bg: string; text: string; border: string }
> = {
  Education: {
    bg: 'bg-blue-900',
    text: 'text-white',
    border: 'border-blue-200',
  },
  Membership: {
    bg: 'bg-amber-800',
    text: 'text-white',
    border: 'border-amber-200',
  },
  Training: {
    bg: 'bg-teal-800',
    text: 'text-white',
    border: 'border-teal-200',
  },
  Administration: {
    bg: 'bg-purple-800',
    text: 'text-white',
    border: 'border-purple-200',
  },
}

interface ClubDCPGoalsCardProps {
  clubRecord: ScrapedRecord | null | undefined
  isLoading: boolean
}

export const ClubDCPGoalsCard: React.FC<ClubDCPGoalsCardProps> = ({
  clubRecord,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-gray-200 rounded-sm w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded-sm w-full"></div>
          <div className="h-4 bg-gray-200 rounded-sm w-full"></div>
          <div className="h-4 bg-gray-200 rounded-sm w-full"></div>
          <div className="h-4 bg-gray-200 rounded-sm w-full"></div>
          <div className="h-4 bg-gray-200 rounded-sm w-full"></div>
        </div>
      </div>
    )
  }

  if (!clubRecord) {
    return null // No raw CSV data available
  }

  const goals = extractDcpGoalProgress(clubRecord)
  const achievedCount = goals.filter(g => g.achieved).length

  // Group by category
  const categories: DcpGoalProgress['category'][] = [
    'Education',
    'Membership',
    'Training',
    'Administration',
  ]

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 font-tm-headline flex items-center gap-2">
          <svg
            className="w-5 h-5 text-tm-loyal-blue"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
          DCP Goals Progress
        </h2>
        <span className="text-sm font-medium text-gray-600 font-tm-body tabular-nums">
          {achievedCount} / 10 goals
        </span>
      </div>

      {/* Goals table */}
      <div className="space-y-1">
        {categories.map(category => {
          const categoryGoals = goals.filter(g => g.category === category)
          const colors = CATEGORY_COLORS[category]
          return (
            <React.Fragment key={category}>
              {/* Category header */}
              <div
                className={`${colors.bg} ${colors.text} px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-t-md mt-3 first:mt-0`}
              >
                {category}
              </div>

              {/* Goal rows */}
              {categoryGoals.map(goal => (
                <div key={goal.goalNumber}>
                  {goal.subItems.length === 1 ? (
                    /* Simple single-row goal */
                    <div
                      className={`flex items-center gap-3 px-3 py-2.5 border-x border-b ${colors.border} ${
                        goal.achieved ? 'bg-green-50' : 'bg-white'
                      }`}
                    >
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-700 font-semibold text-xs shrink-0">
                        {goal.goalNumber}
                      </span>
                      <span className="text-sm text-gray-900 flex-1">
                        {goal.name}
                      </span>
                      <span className="text-sm text-gray-600 tabular-nums font-tm-body w-12 text-center">
                        {goal.subItems[0]?.required === 'Y'
                          ? 'Y'
                          : goal.subItems[0]?.required}
                      </span>
                      <span
                        className={`text-sm tabular-nums font-tm-body w-12 text-center font-semibold ${
                          goal.achieved ? 'text-green-700' : 'text-gray-900'
                        }`}
                      >
                        {goal.subItems[0]?.achieved}
                      </span>
                      <span className="w-36 text-right">
                        {goal.achieved ? (
                          <span className="text-green-600 font-semibold text-sm">
                            ✓
                          </span>
                        ) : (
                          <span className="text-xs text-red-700 font-tm-body">
                            {goal.statusText}
                          </span>
                        )}
                      </span>
                    </div>
                  ) : (
                    /* Multi-sub-item goal (e.g., Goal 9, 10) */
                    <>
                      {goal.subItems.map((item, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-3 px-3 py-2 border-x border-b ${colors.border} ${
                            goal.achieved ? 'bg-green-50' : 'bg-white'
                          }`}
                        >
                          {idx === 0 ? (
                            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-700 font-semibold text-xs shrink-0">
                              {goal.goalNumber}
                            </span>
                          ) : (
                            <span className="w-7 shrink-0"></span>
                          )}
                          <span className="text-sm text-gray-700 flex-1">
                            {item.label}
                          </span>
                          <span className="text-sm text-gray-600 tabular-nums font-tm-body w-12 text-center">
                            {item.required === 'Y' ? 'Y' : item.required}
                          </span>
                          <span
                            className={`text-sm tabular-nums font-tm-body w-12 text-center font-semibold ${
                              (
                                item.required === 'Y'
                                  ? item.achieved >= 1
                                  : item.achieved >= item.required
                              )
                                ? 'text-green-700'
                                : 'text-gray-900'
                            }`}
                          >
                            {item.achieved}
                          </span>
                          <span className="w-36 text-right">
                            {idx === 0 &&
                              (goal.achieved ? (
                                <span className="text-green-600 font-semibold text-sm">
                                  ✓
                                </span>
                              ) : (
                                <span className="text-xs text-red-700 font-tm-body">
                                  {goal.statusText}
                                </span>
                              ))}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ))}
            </React.Fragment>
          )
        })}
      </div>

      {/* Column headers legend */}
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-500 px-3">
        <span className="w-7 shrink-0"></span>
        <span className="flex-1">Goals to Achieve</span>
        <span className="w-12 text-center">Goal</span>
        <span className="w-12 text-center">To Date</span>
        <span className="w-36 text-right">Status</span>
      </div>
    </div>
  )
}

export default ClubDCPGoalsCard
