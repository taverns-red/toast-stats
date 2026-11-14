/**
 * picomatch ships no types and @types/picomatch is not a dependency (it would
 * be a new dev dependency for one import). Declare only the surface
 * scripts/lib/coverageDenominator.ts uses: a matcher factory taking globs and
 * `dot` / `ignore` options.
 */
declare module 'picomatch' {
  interface PicomatchOptions {
    dot?: boolean
    ignore?: string | string[]
  }
  function picomatch(
    glob: string | string[],
    options?: PicomatchOptions
  ): (input: string) => boolean
  export default picomatch
}
