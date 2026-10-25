/**
 * `npm run videos:capture -- <scenario>` — record the scenario's walkthrough
 * on the live site into videos/public/captures/<scenario>/ (gitignored).
 * Opt-in only: never part of npm test, the pre-push hook or CI (#2293).
 */
import { join } from 'node:path'
import { runCapture } from '../capture/runCapture'
import { getScenario } from '../scenarios'
import { validateScenario } from '../scenarios/validate'
import { captureRelDir, PUBLIC_DIR, scenarioIdFromArgs } from './paths'

const scenario = getScenario(scenarioIdFromArgs(process.argv))
const problems = validateScenario(scenario)
if (problems.length > 0) {
  console.error(
    `Scenario ${scenario.id} is invalid:\n- ${problems.join('\n- ')}`
  )
  process.exit(1)
}

const rel = captureRelDir(scenario.id)
console.error(`Capturing ${scenario.id} from ${scenario.url} …`)
const manifest = await runCapture(scenario, join(PUBLIC_DIR, rel), rel)
for (const beat of manifest.beats) {
  console.error(
    `  ${beat.id}: starts ${beat.videoStartSec.toFixed(2)} s in the recording, highlight ${beat.box ? 'found' : 'none'}`
  )
}
console.error(`Wrote ${join(PUBLIC_DIR, rel)}/capture.mp4 and manifest.json`)
