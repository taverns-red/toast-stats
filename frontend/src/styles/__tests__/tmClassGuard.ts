/* Extraction and resolution logic behind classesAndVarsResolve.test.ts (#2642).
   Kept out of the test file so the guard itself can be tested: a guard that
   accepts compound selectors or skips multi-line strings hides the bugs it
   exists to catch. */

/** Every `tm-*` token used in a string literal of the given sources. */
export function extractTmTokens(texts: string[]): Set<string> {
  const tokens = new Set<string>()
  for (const text of texts) {
    for (const lit of text.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*?)\1/g)) {
      for (const word of lit[2].split(/\s+/)) {
        if (word.startsWith('--')) continue // a custom property, not a class
        if (!/(^|[:!-])tm-[a-z0-9]/.test(word)) continue
        // strip variants (hover:, md:, dark:) and the important marker
        const base = word.replace(/^.*:/, '').replace(/^!/, '')
        if (/^[a-z0-9-]*tm-[a-z0-9-]*[a-z0-9]$/.test(base)) tokens.add(base)
      }
    }
  }
  return tokens
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')

export function tmTokenResolves(css: string, token: string): boolean {
  // A hand-written class rule: `.token` followed by a non-identifier char.
  if (new RegExp(`\\.${escapeRe(token)}(?![\\w-])`).test(css)) return true
  // A Tailwind 4 utility generated from a theme key: `<ns>-tm-<name>` reads
  // `--<themeNs>-tm-<name>`; font-* reads --font-*, the rest read --color-*.
  const m = token.match(/^([a-z]+)-(tm-[a-z0-9-]+)$/)
  if (m) {
    const [, ns, rest] = m
    const keys =
      ns === 'font'
        ? [`--font-${rest}`]
        : [`--color-${rest}`, `--${ns}-${rest}`, `--spacing-${rest}`]
    return keys.some(k => new RegExp(`${escapeRe(k)}\\s*:`).test(css))
  }
  return false
}
