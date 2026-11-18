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

/**
 * Does one command run the `build:frontend` script through npm? Covers
 * `run`, `run-script`, and options in between (`--prefix x`, `-s`,
 * `--workspace`), not just the literal `npm run build:frontend` (#2987).
 */
export function runsFrontendBuild(cmd: string): boolean {
  return /\bnpm\s(?:.*\s)?run(?:-script)?\s(?:.*\s)?build:frontend(?:\s|$)/.test(
    cmd
  )
}

/**
 * Problems for one step that runs `npm run build:frontend` (#2982): the
 * build writes the OG stubs from the CDN named by VITE_CDN_BASE_URL, so the
 * step must set it to a literal URL, inline or in its env.
 */
export function buildTargetProblems(
  run: string,
  env: Record<string, string | undefined>
): string[] {
  const problems: string[] = []
  for (const cmd of splitCommands(run)) {
    if (!runsFrontendBuild(cmd)) continue
    const inline = /(^|\s)VITE_CDN_BASE_URL=https?:\/\//.test(cmd)
    if (!(inline || literalUrl(env['VITE_CDN_BASE_URL']))) {
      problems.push(
        'build:frontend: VITE_CDN_BASE_URL is not set to a literal URL'
      )
    }
  }
  return problems
}
