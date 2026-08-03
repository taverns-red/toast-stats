/**
 * methodologyUrl — URL contract for the /methodology page's open-section state
 * (#981, epic #969 Sprint 5 — deep-link Methodology sections).
 *
 * Two entry points encode "which sections are open" so reload / back / share
 * all preserve it:
 *   - `?openSections=borda-count,glossary` — the persistent multi-section state,
 *     round-tripped through `useUrlState`.
 *   - `#borda-count` fragment — an on-mount directive to expand + scroll to one
 *     section (the natural shape of a shared anchor link).
 *
 * Both are adversarial input: a hand-edited or shared URL is a write path that
 * bypasses every guard on the toggle handler (Lesson 144). So the parse here is
 * the chokepoint — it whitelists ids against the page's known section list and
 * de-dups, exactly so `?openSections=bogus` or `#bogus` can never seed a phantom
 * open id.
 */

/** URL search-param key for the persistent multi-section open state. */
export const OPEN_SECTIONS_PARAM = 'openSections'

/**
 * Parse `?openSections=` into a de-duped, whitelisted, order-preserving id list.
 *
 * Curried on the valid-id set so the page can build a module-scope `parse` with
 * stable identity (keeps `useUrlState`'s memoised value/setter stable).
 */
export const parseOpenSections =
  (validIds: ReadonlySet<string>) =>
  (raw: string): string[] => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const part of raw.split(',')) {
      const id = part.trim()
      if (id && validIds.has(id) && !seen.has(id)) {
        seen.add(id)
        out.push(id)
      }
    }
    return out
  }

/** Serialize an open-section id list back to the `?openSections=` value. */
export const serializeOpenSections = (ids: ReadonlyArray<string>): string =>
  ids.join(',')

/**
 * What a valid fragment resolves to: the section to expand, and the element to
 * scroll to. They differ when the fragment names an anchor *inside* a section
 * — a program-year rule-change entry (#1400).
 */
export interface MethodologyHashTarget {
  sectionId: string
  scrollToId: string
}

/**
 * Resolve a location hash to its expand + scroll target, or null when the
 * fragment is empty / unknown. Both accepted shapes are whitelisted for the
 * same reason as parse — a shared `#bogus` must not drive an expand/scroll:
 *
 *   - `#borda-count` — a section id; expand and scroll to it.
 *   - `#py-2026-2027-…` — a rule-change entry inside a section. Expanding its
 *     owner is what makes the entry reachable at all: on mobile the section is
 *     collapsed, so scrolling to a hidden entry lands the reader on nothing.
 */
export const resolveHashTarget = (
  hash: string,
  validSectionIds: ReadonlySet<string>,
  anchorOwners: ReadonlyMap<string, string> = new Map()
): MethodologyHashTarget | null => {
  const id = hash.replace(/^#/, '').trim()
  if (!id) return null
  if (validSectionIds.has(id)) return { sectionId: id, scrollToId: id }
  const owner = anchorOwners.get(id)
  return owner ? { sectionId: owner, scrollToId: id } : null
}
