import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getScenario } from '../scenarios'
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
 * Run `command` with the id from `npm run videos:<cmd> -- <id>` when the
 * module at `moduleUrl` is the process entry point (so `build` can import
 * `capture` and `render` without running them).
 */
export function runIfMain(
  moduleUrl: string,
  command: (id: string) => Promise<void>
): void {
  const entry = process.argv[1]
  if (!entry || moduleUrl !== pathToFileURL(entry).href) return
  const id = process.argv[2]
  if (!id) {
    console.error('Usage: npm run videos:<capture|render|build> -- <scenario>')
    process.exitCode = 2
    return
  }
  command(id).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
