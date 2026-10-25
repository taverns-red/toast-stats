/**
 * `npm run videos:capture -- <scenario>` — record the scenario's walkthrough
 * on the live site into videos/public/captures/<scenario>/ (gitignored).
 * Opt-in only: never part of npm test, the pre-push hook or CI (#2293).
 */
import { join } from 'node:path'
import { runCapture } from '../capture/runCapture'
import {
  captureRelDir,
  loadValidScenario,
  PUBLIC_DIR,
  runIfMain,
} from './paths'

export async function capture(id: string): Promise<void> {
  const scenario = loadValidScenario(id)
  const rel = captureRelDir(scenario.id)
  console.error(`Capturing ${scenario.id} from ${scenario.url} …`)
  const manifest = await runCapture(
    scenario,
    'desktop',
    join(PUBLIC_DIR, rel),
    rel
  )
  for (const beat of manifest.beats) {
    console.error(
      `  ${beat.id}: starts ${beat.videoStartSec.toFixed(2)} s in the recording, highlight ${beat.box ? 'found' : 'none'}`
    )
  }
  console.error(`Wrote ${join(PUBLIC_DIR, rel)}/capture.mp4 and manifest.json`)
}

runIfMain(import.meta.url, capture)
