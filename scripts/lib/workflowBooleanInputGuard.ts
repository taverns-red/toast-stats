/**
 * Workflow Boolean-Input Guard — Pure Functions (#1133)
 *
 * In GitHub Actions expressions, a `workflow_dispatch` input declared
 * `type: boolean` is a BOOLEAN in the `inputs` context. Comparing it to the
 * string 'true' coerces both sides to numbers (true → 1, 'true' → NaN), and
 * NaN never equals anything — so `inputs.dry_run != 'true'` is ALWAYS true
 * and `inputs.dry_run == 'true'` is ALWAYS false, whatever the operator
 * selected. data-pipeline.yml's prune deletion step carried exactly this
 * inert dry-run guard: a dry_run=true dispatch would still have deleted
 * from GCS.
 *
 * The sanctioned pattern is to normalize boolean inputs to step-output
 * STRINGS once (the `mode` step) and compare strings to strings in every
 * `if:`. This guard fails the test suite when any workflow compares a
 * boolean-typed input to a quoted string, so the bug class cannot drift
 * back in (Lesson 082: the sentinel lints a known-bad snippet; Lesson 121:
 * pair the fix with a drift guard).
 */

export interface BooleanInputComparison {
  /** The boolean-typed input name (e.g. 'dry_run'). */
  input: string
  /** 1-based line number of the offending comparison. */
  line: number
  /** The offending source line, trimmed. */
  text: string
}

/**
 * Collect the names of `workflow_dispatch` inputs declared `type: boolean`.
 *
 * Structure-aware enough for workflow files without a YAML dependency: an
 * input name is a key one indent level above a `type: boolean` line within
 * the same block.
 */
export function findBooleanInputNames(yamlSource: string): string[] {
  const lines = yamlSource.split('\n')
  const names: string[] = []
  let currentInput: { name: string; indent: number } | null = null

  for (const line of lines) {
    const keyMatch = line.match(/^(\s*)([A-Za-z0-9_-]+):\s*$/)
    if (keyMatch) {
      currentInput = { name: keyMatch[2], indent: keyMatch[1].length }
      continue
    }
    if (currentInput) {
      const typeMatch = line.match(/^(\s*)type:\s*boolean\s*$/)
      if (typeMatch && typeMatch[1].length > currentInput.indent) {
        names.push(currentInput.name)
        currentInput = null
      } else if (
        line.trim() !== '' &&
        (line.match(/^(\s*)/)?.[1].length ?? 0) <= currentInput.indent
      ) {
        currentInput = null
      }
    }
  }

  return [...new Set(names)]
}

/**
 * Find every comparison of a boolean-typed input against a quoted string
 * (`inputs.x == 'true'`, `'false' != inputs.x`, double quotes included).
 */
export function findBooleanInputStringComparisons(
  yamlSource: string
): BooleanInputComparison[] {
  const booleanInputs = findBooleanInputNames(yamlSource)
  if (booleanInputs.length === 0) return []

  const violations: BooleanInputComparison[] = []
  const lines = yamlSource.split('\n')

  for (const input of booleanInputs) {
    const patterns = [
      new RegExp(`inputs\\.${input}\\s*[!=]=\\s*['"]`),
      new RegExp(`['"]\\s*[!=]=\\s*inputs\\.${input}\\b`),
    ]
    lines.forEach((text, i) => {
      if (patterns.some(p => p.test(text))) {
        violations.push({ input, line: i + 1, text: text.trim() })
      }
    })
  }

  return violations.sort((a, b) => a.line - b.line)
}
