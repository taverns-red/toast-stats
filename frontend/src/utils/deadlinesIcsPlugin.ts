import type { Plugin } from 'vite'
import {
  DEADLINES_ICS_FILE,
  buildDeadlinesIcs,
  feedProgramYears,
} from './deadlinesIcs'

/**
 * Emits `deadlines.ics` into the build (#2429): a static file generated from
 * the cited deadline table at build time. The build date picks the program
 * years and stamps DTSTAMP; the UIDs do not depend on it.
 */
export function deadlinesIcsPlugin(now: () => Date = () => new Date()): Plugin {
  return {
    name: 'deadlines-ics',
    apply: 'build',
    generateBundle() {
      const at = now()
      this.emitFile({
        type: 'asset',
        fileName: DEADLINES_ICS_FILE,
        source: buildDeadlinesIcs(feedProgramYears(at), at),
      })
    },
  }
}
