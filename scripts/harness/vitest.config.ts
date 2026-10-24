import { defineConfig } from 'vitest/config'

// The local pipeline harness (#1768, ADR-015 step 10): end-to-end mode runs
// against the gcloud shim. Its own partition, run by the path-filtered
// .github/workflows/pipeline-harness.yml job, not by `test:scripts` (the
// partition is asserted in scripts/lib/__tests__/pipelineHarness.test.ts).
// Each scenario's whole pipeline runs once in a beforeAll hook.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/harness/__tests__/**/*.e2e.test.ts'],
    testTimeout: 10000,
    hookTimeout: 60000,
  },
})
