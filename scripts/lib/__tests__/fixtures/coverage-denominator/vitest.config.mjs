// Synthetic workspace for the coverage-denominator guard tests (#1536).
// The guard must read this exclude through vitest's own config resolution —
// never a hand-restated copy of the glob.
export default {
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      exclude: ['src/excluded/**'],
    },
  },
}
