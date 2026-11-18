/// <reference types="vite/client" />
/// <reference types="@testing-library/jest-dom/vitest" />

/**
 * The CDN the bundle reads data from, baked in by `define` in vite.config.ts
 * and vitest.config.ts (#3000). A constant, not a module: a shared module
 * became a chunk of its own that index.html modulepreloaded.
 */
declare const __CDN_BASE_URL__: string

interface ImportMetaEnv {
  readonly VITE_ENV: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** gtag.js queue, defined by the inline GA snippet in index.html (prod only). */
interface Window {
  gtag?: (...args: unknown[]) => void
}
