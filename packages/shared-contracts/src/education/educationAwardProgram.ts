/**
 * Which education program an award code belongs to (#1802, Ron 2026-10-11).
 *
 * Every ledger award counts in totals; charts stack Legacy and Pathways, and
 * the level × path matrix shows Pathways only. So the tag must be decided per
 * code, and a code nobody has mapped must stay visible as `Other` rather than
 * be folded into either program by guesswork.
 *
 * - `Pathways`: a level award — two capitals + level 1–5 (`PM1`, `BT1`…).
 * - `DTM`: Distinguished Toastmaster exists in both eras; it is counted once
 *   under its own code.
 * - `Legacy`: the pre-Pathways communication and leadership tracks, as
 *   recorded in TI's archive for 2003-04 → 2018-19.
 * - `Other`: anything else, e.g. `PWMENTORPGM` (Pathways Mentor Program, not
 *   a level), or the blank code TI renders for a pending award.
 *
 * Takes the bare code (`CC`, not `CCCompetent Communicator`): the collector
 * splits it from the award cell's markup.
 */

export type EducationAwardProgram = 'Pathways' | 'Legacy' | 'DTM' | 'Other'

const PATHWAYS_LEVEL = /^[A-Z]{2}[1-5]$/

/** Legacy codes seen in the archive (recorded D61 2003-04, 2009-10, 2018-19). */
const LEGACY_CODES: ReadonlySet<string> = new Set([
  // Communication track
  'CC',
  'ACB',
  'ACS',
  'ACG',
  'CTM',
  'ATM',
  'ATMB',
  'ATMS',
  'ATMG',
  // Leadership track
  'CL',
  'AL',
  'ALB',
  'ALS',
  'LDREXC',
])

export function educationAwardProgram(
  awardCode: string
): EducationAwardProgram {
  if (PATHWAYS_LEVEL.test(awardCode)) return 'Pathways'
  if (awardCode === 'DTM') return 'DTM'
  if (LEGACY_CODES.has(awardCode)) return 'Legacy'
  return 'Other'
}
