/** Red stub (#1766): implemented in the next commit. */
export interface ClosingRegistryMonth {
  dataMonth: string
  closingDate: string
}

export function programYearMonthEnds(
  _programYear: string,
  _months: readonly ClosingRegistryMonth[]
): string[] {
  throw new Error('not implemented (#1766)')
}
