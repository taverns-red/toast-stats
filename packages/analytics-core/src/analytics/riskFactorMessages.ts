/**
 * The club risk-factor messages (ClubHealthAnalyticsModule) in one place, so
 * the frontend's plain-language rewrite (`plainRiskFactor`) can be tested
 * against the exact strings the pipeline publishes (#2655): a wording change
 * here fails that test instead of silently falling through to raw text.
 */
export const RISK_FACTOR_MESSAGES = {
  membershipCritical: (): string => 'Membership below 12 (critical)',
  netGrowthOverride: (netGrowth: number): string =>
    `Net growth since July: ${netGrowth} (need 3+ to override)`,
  membershipBelowThreshold: (members: number): string =>
    `Membership below threshold (${members} members, need 20+ or net growth 3+)`,
  dcpCheckpointNotMet: (
    goals: number,
    required: number,
    monthName: string
  ): string =>
    `DCP checkpoint not met: ${goals} goal${goals !== 1 ? 's' : ''} achieved, ${required} required for ${monthName}`,
  cspNotSubmitted: (): string => 'CSP not submitted',
} as const
