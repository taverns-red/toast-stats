/**
 * The words that say what a member net change is measured against (#2712,
 * UX decision D9). One home, so a label never drifts from the data.
 *
 * A club's `membershipBase` is Toastmasters' own `Mem. Base`, set at the
 * program-year rollover. We cannot prove it equals a July 1 count (a club
 * chartered mid-year has no July 1 count), so the labels say "the start of
 * the program year", never "July 1".
 */

/** Sentence-case basis for a net change measured from `membershipBase`. */
export const PROGRAM_YEAR_START_BASIS = 'since the start of the program year'

/** Title-case form, for CSV headers. */
export const PROGRAM_YEAR_START_BASIS_TITLE = 'Since Start of Program Year'

/** The basis when a figure is measured from a snapshot we hold, by its
 *  already-formatted date ("Jul 23"). */
export function sinceSnapshotBasis(formattedDate: string): string {
  return `since ${formattedDate}`
}
