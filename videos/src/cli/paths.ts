import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getScenario } from '../scenarios'
import { parseCliArgs, type CliArgs } from '../scenarios/cliArgs'
import type { Scenario } from '../scenarios/types'
import { validateScenario } from '../scenarios/validate'

/** `videos/` — resolved from this file, not process.cwd() (Lesson 082). */
export const VIDEOS_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
)
export const PUBLIC_DIR = join(VIDEOS_ROOT, 'public')
export const OUT_DIR = join(VIDEOS_ROOT, 'out')
export const FRONTEND_FONTS = join(
  VIDEOS_ROOT,
  '..',
  'frontend',
  'src',
  'assets',
  'fonts'
)

export const captureRelDir = (id: string): string => `captures/${id}`

/** The scenario, or an error listing every timing and caption problem. */
export function loadValidScenario(id: string): Scenario {
  const scenario = getScenario(id)
  const problems = validateScenario(scenario)
  if (problems.length > 0) {
    throw new Error(
      `Scenario ${scenario.id} is invalid:\n- ${problems.join('\n- ')}`
    )
  }
  return scenario
}

/**
 * Run `command` with the parsed `-- <id> [--format …]` arguments when the
 * module at `moduleUrl` is the process entry point (so `build` can import
 * `capture` and `render` without running them).
 */
export function runIfMain(
  moduleUrl: string,
  command: (args: CliArgs) => Promise<void>
): void {
  const entry = process.argv[1]
  if (!entry || moduleUrl !== pathToFileURL(entry).href) return
  let args: CliArgs
  try {
    args = parseCliArgs(process.argv.slice(2))
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 2
    return
  }
  command(args).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
