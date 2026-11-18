/**
 * Pure check behind cdnTargetWorkflowGuard.test.ts (#2974): does a workflow
 * step name the target of each script it runs?
 */

export interface TargetScript {
  file: string
}

export const TARGET_SCRIPTS: TargetScript[] = [
  { file: 'check-cdn-schema.ts' },
  { file: 'hosting-smoke.ts' },
  { file: 'cdn-compression-check.ts' },
]

/** Problems for one step: a list of "script: what is missing". */
export function targetProblems(
  run: string,
  env: Record<string, string | undefined>
): string[] {
  if (!TARGET_SCRIPTS.some(s => new RegExp(`scripts/${s.file}`).test(run))) {
    return []
  }
  const v = env['CDN_BASE_URL']
  const inline =
    /CDN_BASE_URL=https?:\/\//.test(run) || /--base\s+https?:\/\//.test(run)
  const ok =
    inline ||
    /^https?:\/\//.test(v ?? '') ||
    /\|\|\s*'https?:\/\//.test(v ?? '')
  return ok ? [] : ['CDN_BASE_URL is not set to a literal URL']
}
