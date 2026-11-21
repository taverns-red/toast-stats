/**
 * The house sentence for a load that failed. `subject` is a noun phrase with
 * its determiner ("the changes", "1 region"). ErrorDisplay adds "Try again in
 * a moment." for a whole-panel failure; PartialFailureNote adds what is still
 * shown. sharedErrorPanelGuard.test.ts keeps pages from writing their own.
 */
export function couldntLoad(subject: string): string {
  return `We couldn't load ${subject}.`
}
