/**
 * Finds code that names the prod CDN (`cdn.taverns.red`) in frontend source
 * (#3000). The frontend gets its CDN from one build-time value that
 * vite.config.ts bakes in (`__CDN_BASE_URL__`); a file that spells the host
 * out has its own copy, which a PR preview build (staging CDN) would ignore.
 *
 * It matches the host itself, so it does not depend on quoting (single,
 * double or backtick), on a `||` fallback, or on what the constant is called.
 * Comments are skipped: they may say where data comes from.
 */

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g
// `//` that starts a comment: at the line start or after whitespace, never the
// `//` of `https://`.
const LINE_COMMENT = /(^|\s)\/\/.*$/gm
const PROD_CDN = /[\w:/.-]*\bcdn\.taverns\.red\b[\w/.-]*/g

/** The source with block and line comments removed. */
export function stripComments(source: string): string {
  return source.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '$1')
}

/** Each place the code (comments removed) names the prod CDN. */
export function findProdCdnUses(source: string): string[] {
  return [...stripComments(source).matchAll(PROD_CDN)].map(m => m[0])
}
