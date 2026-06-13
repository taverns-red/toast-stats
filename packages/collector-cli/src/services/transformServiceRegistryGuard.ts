/**
 * transformServiceRegistryGuard — structural enforcement of TransformService's
 * closing-date-registry injection contract (#1160, follow-up to #1129).
 *
 * `TransformService`'s `closingDateRegistry` is optional on the config type so
 * test fixtures can opt into legacy fail-open behavior. In production, every
 * construction site MUST inject it — a site that forgets silently reverts to
 * fail-open and can publish a closing-window date under its raw date (the
 * #1129 hole). That contract was previously documented only in a doc-comment.
 *
 * This guard converts the comment into a structural, CI-enforced invariant:
 * scan production source for `new TransformService(...)` and flag any
 * construction whose argument object does not pass `closingDateRegistry`.
 * (Lesson 82 — a sentinel must catch a known-bad snippet, not assert config.)
 */

/** A flagged construction site: its byte offset and the captured argument. */
export interface RegistryInjectionViolation {
  index: number
  snippet: string
}

const CTOR_TOKEN = 'new TransformService('

/**
 * Find every `new TransformService(...)` in `source` whose constructor
 * argument does NOT mention `closingDateRegistry`.
 *
 * The scan is brace/paren-depth aware: from each `new TransformService(` it
 * walks to the matching close paren (respecting nested `(` `[` `{`) and
 * inspects the captured argument text. A site that passes the registry —
 * literally or by spread/option pass-through that names the key — is honest;
 * one that omits the key is a fail-open regression waiting to happen.
 */
export function findUninjectedTransformServiceConstructions(
  source: string
): RegistryInjectionViolation[] {
  const violations: RegistryInjectionViolation[] = []
  let from = 0
  for (;;) {
    const start = source.indexOf(CTOR_TOKEN, from)
    if (start === -1) break

    // Walk from the opening paren to its match, tracking nesting depth.
    const openParen = start + CTOR_TOKEN.length - 1
    let depth = 0
    let end = openParen
    for (let i = openParen; i < source.length; i++) {
      const ch = source[i]
      if (ch === '(' || ch === '[' || ch === '{') depth++
      else if (ch === ')' || ch === ']' || ch === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }

    const snippet = source.slice(openParen, end + 1)
    if (!snippet.includes('closingDateRegistry')) {
      violations.push({ index: start, snippet })
    }
    from = end + 1
  }
  return violations
}
