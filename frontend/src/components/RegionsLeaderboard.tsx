import type { RegionRollup } from '../utils/aggregateRegions'

/* RegionsLeaderboard (#494) — sortable table for the /regions overview.
   Sprint B RED stub: signature only; implementation comes in the GREEN
   commit. The stub lets the test file resolve its import + lets the
   pre-commit typecheck pass without bypassing it. */

export interface RegionsLeaderboardProps {
  rollups: ReadonlyArray<RegionRollup>
}

export const RegionsLeaderboard: React.FC<RegionsLeaderboardProps> = () => {
  throw new Error('RegionsLeaderboard: not implemented (RED phase)')
}
