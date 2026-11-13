/* Extraction and resolution logic behind classesAndVarsResolve.test.ts (#2642).
   Kept out of the test file so the guard itself can be tested: a guard that
   accepts compound selectors or skips multi-line strings hides the bugs it
   exists to catch. */
import { rules } from './cssColor'

/** Quoted strings; template literals may span lines, quotes may not. */
const STRING_LITERAL =
  /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g

/** Every `tm-*` token (with any `/N` colour modifier) in string literals. */
export function extractTmTokens(texts: string[]): Set<string> {
  const tokens = new Set<string>()
  for (const text of texts) {
    for (const lit of text.matchAll(STRING_LITERAL)) {
      const body = lit[1] ?? lit[2] ?? lit[3] ?? ''
      for (const word of body.split(/\s+/)) {
        if (word.startsWith('--')) continue // a custom property, not a class
        if (!/(^|[:!-])tm-[a-z0-9]/.test(word)) continue
        // strip variants (hover:, md:, dark:) and the important marker
        const base = word.replace(/^.*:/, '').replace(/^!/, '')
        if (/^[a-z0-9-]*tm-[a-z0-9-]*[a-z0-9](?:\/\d+)?$/.test(base))
          tokens.add(base)
      }
    }
  }
  return tokens
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')

/** Does `css` give `token` a definition the browser will apply? */
export function tmTokenResolves(css: string, token: string): boolean {
  // `<ns>-tm-<name>[/N]` is a Tailwind 4 utility generated from a theme key:
  // font-* reads --font-*, the rest read --color-*. A /N modifier only works
  // on a colour key.
  const [name, alpha] = token.split('/')
  const m = name.match(/^([a-z]+)-(tm-[a-z0-9-]+)$/)
  if (m) {
    const [, ns, rest] = m
    const keys =
      ns === 'font'
        ? [`--font-${rest}`]
        : [`--color-${rest}`, `--${ns}-${rest}`, `--spacing-${rest}`]
    if (alpha !== undefined && ns === 'font') return false
    if (keys.some(k => new RegExp(`${escapeRe(k)}\\s*:`).test(css))) return true
  }
  if (alpha !== undefined) return false
  // A hand-written rule whose selector STARTS with the class alone (optionally
  // with pseudo-classes / elements, and optionally followed by descendants:
  // `.x--error .x` is a real ancestor modifier). `.a.token` and `.a .token`
  // do not define it: they only apply inside another class, which is how
  // `tm-h2` went unnoticed.
  const standalone = new RegExp(
    `^\\.${escapeRe(token)}(?:::?[\\w-]+(?:\\([^)]*\\))?)*(?:[\\s>+~]|$)`
  )
  return rules(css).some(r => standalone.test(r.selector))
}
