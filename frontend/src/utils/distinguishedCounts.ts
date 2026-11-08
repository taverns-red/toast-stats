export interface DistinguishedCountPair {
  confirmed: number
  provisional: number
}

/* STUB (red commit, #2554): replaced in the green commit. */
export function resolveDistinguishedCounts(input: {
  counts?: DistinguishedCountPair | null | undefined
  rankingConfirmed?: number | null | undefined
  qualifyingToday: number
}): DistinguishedCountPair {
  return { confirmed: input.qualifyingToday, provisional: 0 }
}
