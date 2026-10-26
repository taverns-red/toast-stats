/**
 * Plan a video publish — Runner (#2310)
 *
 * Thin glue around ./lib/videoPublish.js for videos-publish.yml: lists the
 * downloaded artifact directory and prints the publish plan as JSON on
 * stdout (`[{format, file, object, url}]`). It fails unless the directory
 * holds exactly the render CLI's `<scenario>.mp4` (desktop) and
 * `<scenario>-mobile.mp4`, and the scenario and version make a valid
 * `videos/` object.
 *
 * Logs go to stderr (R4); stdout carries only the plan.
 *
 * Usage: npx tsx scripts/plan-video-publish.ts <scenario> <version> <dir>
 */
import { readdirSync } from 'node:fs'
import { planVideoPublish } from './lib/videoPublish.js'

const [scenario, version, dir] = process.argv.slice(2)
if (!scenario || !version || !dir) {
  console.error(
    'Usage: npx tsx scripts/plan-video-publish.ts <scenario> <version> <dir>'
  )
  process.exit(2)
}

try {
  const files = readdirSync(dir, { withFileTypes: true }).map(e =>
    e.isFile() ? e.name : `${e.name}/`
  )
  const plan = planVideoPublish({ scenario, version, files })
  for (const item of plan)
    console.error(`[INFO] ${item.file} -> ${item.object}`)
  console.log(JSON.stringify(plan))
} catch (error) {
  console.error(
    `[ERROR] ${error instanceof Error ? error.message : String(error)}`
  )
  process.exit(1)
}
