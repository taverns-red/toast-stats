export interface VerdictJob {
  name: string
  status: string
  conclusion: string | null
  started_at?: string | null
  id?: number
}

export interface MirrorVerdict {
  pass: boolean
  reasons: string[]
}

/** Stub: the real logic lands in the green commit. */
export function mirrorVerdict(_jobs: VerdictJob[]): MirrorVerdict {
  return { pass: true, reasons: [] }
}
