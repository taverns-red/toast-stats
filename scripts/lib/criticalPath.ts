/**
 * criticalPath — which built JS chunks every route pays for (#1830).
 *
 * A chunk is on the critical path when the browser fetches it before the app
 * can render anything: the entry `<script type="module">`, every
 * `<link rel="modulepreload">` Vite writes into index.html, and everything
 * those reach through STATIC imports (`import … from "./x.js"` /
 * `import "./x.js"`). Dynamic `import("./x.js")` is a lazy edge and does not
 * count — that is exactly how a route-only chunk stays off the critical path.
 *
 * The mobile review (2026-10-11) found the Recharts `charts` chunk on this
 * path for every route — a chunking rule that let React itself land in the
 * charts group made every module import from it. This module lets CI assert
 * the shape of the build, not just its size.
 */

const ENTRY_RE =
  /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/gi
const PRELOAD_RE =
  /<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+)["']/gi
// Static import/export-from edges in minified ESM. `import(` (dynamic) never
// matches: the specifier must follow `from` or a bare `import`.
const STATIC_IMPORT_RE =
  /(?:\bfrom\s*|\bimport\s*)["'](\.{1,2}\/[^"']+\.js)["']/g

/** Normalise `/assets/x.js` or `./x.js` to the bare file name `x.js`. */
export function chunkName(specifier: string): string {
  const clean = specifier.split(/[?#]/)[0] ?? specifier
  return clean.slice(clean.lastIndexOf('/') + 1)
}

/** Entry scripts and modulepreload hrefs named in the built index.html. */
export function htmlCriticalRoots(indexHtml: string): string[] {
  const roots = new Set<string>()
  for (const re of [ENTRY_RE, PRELOAD_RE]) {
    for (const m of indexHtml.matchAll(re)) {
      if (m[1] && m[1].endsWith('.js')) roots.add(chunkName(m[1]))
    }
  }
  return [...roots]
}

/** The chunk files a chunk imports statically. */
export function staticImports(chunkSource: string): string[] {
  const out = new Set<string>()
  for (const m of chunkSource.matchAll(STATIC_IMPORT_RE)) {
    if (m[1]) out.add(chunkName(m[1]))
  }
  return [...out]
}

/**
 * Every chunk reachable from the html roots over static imports.
 * `readChunk` returns a chunk's source, or null when it does not exist.
 */
export function criticalPathChunks(
  indexHtml: string,
  readChunk: (name: string) => string | null
): string[] {
  const seen = new Set<string>()
  const queue = htmlCriticalRoots(indexHtml)
  while (queue.length > 0) {
    const name = queue.shift() as string
    if (seen.has(name)) continue
    seen.add(name)
    const src = readChunk(name)
    if (src === null) continue
    for (const dep of staticImports(src)) if (!seen.has(dep)) queue.push(dep)
  }
  return [...seen].sort()
}

/** Chunks on the critical path whose name matches a forbidden prefix. */
export function forbiddenOnCriticalPath(
  chunks: readonly string[],
  forbiddenPrefixes: readonly string[]
): string[] {
  return chunks.filter(c => forbiddenPrefixes.some(p => c.startsWith(p)))
}
