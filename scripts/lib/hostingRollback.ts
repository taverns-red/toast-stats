/**
 * Hosting auto-rollback decision logic (#2492). Stub for the red commit.
 */
export interface ProbeResult {
  name: 'home' | 'entry-asset' | 'district' | 'district-render' | 'cdn-data'
  ok: boolean
  detail: string
}
export interface SmokeAttempt {
  at: number
  probes: ProbeResult[]
}
const todo = (): never => {
  throw new Error('not implemented')
}
export const siteForTarget = (..._a: unknown[]): string | null => todo()
export const liveVersionFromChannelList = (..._a: unknown[]): string | null =>
  todo()
export const chooseRestoreVersion = (
  ..._a: unknown[]
):
  | { action: 'rollback'; versionId: string }
  | { action: 'none'; reason: string } => todo()
export const extractEntryAsset = (..._a: unknown[]): string | null => todo()
export const checkHome = (..._a: unknown[]): ProbeResult => todo()
export const checkEntryAsset = (..._a: unknown[]): ProbeResult => todo()
export const checkDistrictPage = (..._a: unknown[]): ProbeResult => todo()
export const checkRender = (..._a: unknown[]): ProbeResult => todo()
export const checkCdnLatest = (..._a: unknown[]): ProbeResult => todo()
export const decideSmoke = (..._a: unknown[]): 'pass' | 'fail' | 'continue' =>
  todo()
export const buildRollbackIssueBody = (..._a: unknown[]): string => todo()
export const decideOutcome = (..._a: unknown[]): string => todo()
