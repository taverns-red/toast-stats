/**
 * Vite build check for the CDN target (#2994). Stub: does not check yet.
 */

export interface CdnTargetPlugin {
  name: string
  apply: 'build'
  buildStart: () => void
}

export function cdnTargetPlugin(
  _env: Record<string, string | undefined>,
  _prodUrl: string
): CdnTargetPlugin {
  return { name: 'cdn-target-check', apply: 'build', buildStart: () => {} }
}
