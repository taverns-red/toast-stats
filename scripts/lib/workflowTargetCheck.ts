/**
 * Pure check behind cdnTargetWorkflowGuard.test.ts (#2974): does a workflow
 * step name the target of each script it runs? Each command in a `run`
 * block is judged on its own, so one command's target cannot cover another.
 */

export interface TargetScript {
  file: string
  /** Needs CDN_BASE_URL (or `--base` where the script parses it). */
  cdn: boolean
  /** The script parses `--base URL`. */
  baseFlag: boolean
  /** Other env vars the script requires. */
  envVars: string[]
}

export const TARGET_SCRIPTS: TargetScript[] = [
  { file: 'check-cdn-schema.ts', cdn: true, baseFlag: true, envVars: [] },
  { file: 'cdn-compression-check.ts', cdn: true, baseFlag: true, envVars: [] },
  {
    file: 'hosting-smoke.ts',
    cdn: true,
    baseFlag: false,
    envVars: ['BASE_URL'],
  },
  {
    file: 'check-pipeline-freshness.ts',
    cdn: false,
    baseFlag: false,
    envVars: ['MANIFEST_URL'],
  },
]

const literalUrl = (v: string | undefined) => /^https?:\/\//.test(v ?? '')
const urlFallback = (v: string | undefined) =>
  /\|\|\s*'https?:\/\//.test(v ?? '')

/** Splits a shell `run` block into single commands. */
export function splitCommands(run: string): string[] {
  return run
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n|&&|\|\||;|\|/)
    .map(c => c.trim())
    .filter(Boolean)
}

/** Problems for one step: a list of "script: what is missing". */
export function targetProblems(
  run: string,
  env: Record<string, string | undefined>
): string[] {
  const problems: string[] = []
  for (const cmd of splitCommands(run)) {
    for (const s of TARGET_SCRIPTS) {
      if (!new RegExp(`scripts/${s.file.replace('.', '\\.')}\\b`).test(cmd)) {
        continue
      }
      const names = [...(s.cdn ? ['CDN_BASE_URL'] : []), ...s.envVars]
      for (const name of names) {
        const inline = new RegExp(`(^|\\s)${name}=https?://`).test(cmd)
        const flag =
          name === 'CDN_BASE_URL' &&
          s.baseFlag &&
          /--base\s+https?:\/\//.test(cmd)
        const v = env[name]
        if (!(inline || flag || literalUrl(v) || urlFallback(v))) {
          problems.push(`${s.file}: ${name} is not set to a literal URL`)
        }
      }
    }
  }
  return problems
}
