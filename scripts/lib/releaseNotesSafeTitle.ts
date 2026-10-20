/**
 * Release-notes-safe PR titles — Pure Function (#2185)
 *
 * A squash-merged PR title becomes a changelog line. release-please (17.6.0)
 * HTML-escapes it (`<date>` → `&lt;date&gt;`). When it creates the GitHub
 * releases, it parses the notes with node-html-parser, reads each
 * `<details>` block's `textContent` (which DECODES the entity back to a
 * raw `<date>`), re-renders the body and parses it again. On that second
 * parse `<date>` is an unclosed element, and it swallows every later
 * component's `<details>` block. That component's notes then hold the whole
 * rest of the release, and the others silently get no release:
 *   - 2.62.0: root swallowed all; only `toast-stats-v2.62.0` was released.
 *   - 2.63.0: frontend swallowed the rest → 141,488 chars, over GitHub's
 *     125,000 limit → the job failed and the deploy never ran.
 *
 * node-html-parser opens an element on `<` followed by a letter, `/`, `!`
 * or `?`. `->`, `a < b`, `<=` and `<3` are harmless. Write `{date}` instead.
 */

const TAG_LIKE = /<[A-Za-z!/?][^\s<>]*>?/g

/** Every tag-like fragment in `title`, in order; empty when it is safe. */
export function findReleaseNotesHazards(title: string): string[] {
  return title.match(TAG_LIKE) ?? []
}
