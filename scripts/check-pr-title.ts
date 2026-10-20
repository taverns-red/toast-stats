/**
 * CI check: the PR title (the squash subject → changelog line) must not
 * contain a tag-like `<x` sequence that breaks release-please (#2185).
 * Reads PR_TITLE from the environment. Exits 1 with a readable verdict.
 */
import { findReleaseNotesHazards } from './lib/releaseNotesSafeTitle'

const title = process.env.PR_TITLE ?? ''
const hazards = findReleaseNotesHazards(title)

if (hazards.length > 0) {
  console.error(
    `PR title contains tag-like text that breaks release-please's ` +
      `multi-component release parsing (#2185): ${hazards.join(', ')}\n` +
      `Rewrite it without '<' before a letter, e.g. snapshots/{date}/x.json.`
  )
  process.exit(1)
}
console.error('PR title is release-notes safe (#2185).')
