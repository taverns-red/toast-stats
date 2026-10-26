/**
 * `npm run videos:verify -- <file.mp4> [...]` — ffprobe each render and exit
 * non-zero unless it is h264/yuv420p tagged bt709 (primaries, transfer and
 * matrix) with an AAC audio stream (#2293). videos.yml runs it on every
 * render before the artifact upload.
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  checkProbe,
  PROBE_STREAM_ENTRIES,
  type ProbeOutput,
} from '../output/encoding'

export function verify(files: string[]): number {
  if (files.length === 0) {
    console.error('Usage: npm run videos:verify -- <file.mp4> [...]')
    return 2
  }
  // npm runs the workspace script from videos/, so resolve the arguments
  // against the directory npm was invoked from (INIT_CWD), not process.cwd().
  const base = process.env['INIT_CWD'] ?? process.cwd()
  let failed = 0
  for (const file of files.map(f => resolve(base, f))) {
    const probe = JSON.parse(
      execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          `stream=${PROBE_STREAM_ENTRIES.join(',')}`,
          '-of',
          'json',
          file,
        ],
        { encoding: 'utf8' }
      )
    ) as ProbeOutput
    const problems = checkProbe(probe)
    for (const stream of probe.streams) {
      console.error(
        `${file}: ${Object.entries(stream)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ')}`
      )
    }
    if (problems.length === 0) {
      console.error(`${file}: OK`)
    } else {
      failed++
      for (const p of problems) console.error(`${file}: FAIL ${p}`)
    }
  }
  return failed === 0 ? 0 : 1
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  process.exitCode = verify(process.argv.slice(2))
}
