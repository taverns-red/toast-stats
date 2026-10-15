import type { HistoricalRankPoint } from '../types/districts'

/* Ranking Progression metrics, shared by the chart and its Recharts-free
 * loading state (#1835). */

/**
 * Rank metric types for the chart
 */
export type RankMetric = 'aggregate' | 'clubs' | 'payments' | 'distinguished'

/**
 * Metric configuration for display labels and chart settings
 */
export interface MetricConfig {
  label: string
  shortLabel: string
  dataKey: keyof HistoricalRankPoint
  description: string
}

export const METRIC_CONFIG: Record<RankMetric, MetricConfig> = {
  aggregate: {
    label: 'Overall Rank',
    shortLabel: 'Overall',
    dataKey: 'overallRank',
    description: 'Overall ranking position based on aggregate score (1 = best)',
  },
  clubs: {
    label: 'Paid Clubs Rank',
    shortLabel: 'Clubs',
    dataKey: 'clubsRank',
    description: 'Ranking based on paid club count relative to base',
  },
  payments: {
    label: 'Membership Payments Rank',
    shortLabel: 'Payments',
    dataKey: 'paymentsRank',
    description: 'Ranking based on total membership payments relative to base',
  },
  distinguished: {
    label: 'Distinguished Clubs Rank',
    shortLabel: 'Distinguished',
    dataKey: 'distinguishedRank',
    description:
      'Ranking based on percentage of clubs achieving distinguished status',
  },
}
