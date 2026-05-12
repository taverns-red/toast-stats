import type { RegionRollup } from '../utils/aggregateRegions'

/* RegionGrid (#495) — 14 region KPI cards under the leaderboard.
   Sprint B RED stub: signature only; implementation comes in the GREEN
   commit. The stub lets the test file resolve its import + lets the
   pre-commit typecheck pass without bypassing it. */

export interface RegionGridProps {
  rollups: ReadonlyArray<RegionRollup>
}

export const RegionGrid: React.FC<RegionGridProps> = () => {
  throw new Error('RegionGrid: not implemented (RED phase)')
}
