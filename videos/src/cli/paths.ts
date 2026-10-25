import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** The scenario id from `npm run videos:<cmd> -- <id>`. */
export function scenarioIdFromArgs(argv: string[]): string {
  const id = argv[2]
  if (!id) {
    console.error('Usage: npm run videos:<capture|render|build> -- <scenario>')
    process.exit(2)
  }
  return id
}
