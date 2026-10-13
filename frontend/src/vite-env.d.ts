/// <reference types="vite/client" />
/// <reference types="@testing-library/jest-dom/vitest" />

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
