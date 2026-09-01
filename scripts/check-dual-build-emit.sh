#!/usr/bin/env bash
#
# Verify the dual ESM + CJS builds by their OUTPUT, not by tsc's exit code (#1489).
#
# `shared-contracts` and `analytics-core` compile the same `"type": "module"`
# sources twice: tsconfig.esm.json -> dist/esm, tsconfig.cjs.json -> dist/cjs,
# then `build:cjs-package` drops {"type":"commonjs"} into dist/cjs/.
#
# The failure mode this guards is SILENT. `moduleResolution: node16|nodenext`
# derives the emit format from the SOURCE package.json ("type": "module"), not
# from outDir — so the CJS config compiles clean, exits 0, and writes ESM into
# dist/cjs. Because dist/ is gitignored and never auto-rebuilt (R16), that
# surfaces later as a baffling consumer error rather than a red build. Only
# reading the emitted bytes, and actually loading each entry point, catches it.
#
# Run AFTER `npm run build:shared-contracts && npm run build:analytics-core`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# package name -> a named export that must survive both emits
PACKAGES=("shared-contracts:SCHEMA_VERSION" "analytics-core:ANALYTICS_SCHEMA_VERSION")
FAILURES=0

fail() {
  echo "FAIL: $*" >&2
  FAILURES=$((FAILURES + 1))
}

ok() {
  echo "  ok  $*"
}

for entry in "${PACKAGES[@]}"; do
  pkg="${entry%%:*}"
  probe="${entry##*:}"
  dist="$REPO_ROOT/packages/$pkg/dist"
  echo "== $pkg =="

  esm_entry="$dist/esm/index.js"
  cjs_entry="$dist/cjs/index.js"
  cjs_pkg="$dist/cjs/package.json"

  if [[ ! -f "$esm_entry" ]]; then
    fail "$pkg: $esm_entry missing — run npm run build:$pkg first"
    continue
  fi
  if [[ ! -f "$cjs_entry" ]]; then
    fail "$pkg: $cjs_entry missing — run npm run build:$pkg first"
    continue
  fi

  # --- dist/esm must be ESM ------------------------------------------------
  if grep -qE '^(export|import) ' "$esm_entry"; then
    ok "dist/esm/index.js has top-level import/export"
  else
    fail "$pkg: dist/esm/index.js has no top-level import/export — not ESM"
  fi
  if grep -qE '\brequire\(' "$esm_entry"; then
    fail "$pkg: dist/esm/index.js contains require() — CJS leaked into the ESM build"
  else
    ok "dist/esm/index.js contains no require()"
  fi

  # --- dist/cjs must be CommonJS ------------------------------------------
  if grep -qE '\brequire\(' "$cjs_entry" && grep -qE '\bexports\b' "$cjs_entry"; then
    ok "dist/cjs/index.js uses require()/exports"
  else
    fail "$pkg: dist/cjs/index.js has no require()/exports — not CommonJS"
  fi
  if grep -qE '^(export|import) ' "$cjs_entry"; then
    fail "$pkg: dist/cjs/index.js has top-level import/export — ESM was emitted into dist/cjs"
  else
    ok "dist/cjs/index.js has no top-level import/export"
  fi

  # --- the {"type":"commonjs"} marker must still be written ---------------
  if [[ -f "$cjs_pkg" ]] && node -e '
    const t = require(process.argv[1]).type
    if (t !== "commonjs") {
      console.error(`expected {"type":"commonjs"}, got ${JSON.stringify(t)}`)
      process.exit(1)
    }
  ' "$cjs_pkg"; then
    ok 'dist/cjs/package.json declares {"type":"commonjs"}'
  else
    fail "$pkg: dist/cjs/package.json missing or not {\"type\":\"commonjs\"}"
  fi

  # --- a consumer must be able to load each entry point -------------------
  # Exercises the CJS require() path rather than assuming it, and the ESM
  # import() path, asserting a known export actually arrives.
  if node -e '
    const [entry, probe] = process.argv.slice(1)
    const mod = require(entry)
    if (typeof mod[probe] === "undefined") {
      console.error(`${probe} missing from the CJS build`)
      process.exit(1)
    }
  ' "$cjs_entry" "$probe"; then
    ok "require('dist/cjs/index.js') resolves and exports $probe"
  else
    fail "$pkg: require('dist/cjs/index.js') failed or lost $probe"
  fi

  if node --input-type=module -e '
    const [entry, probe] = process.argv.slice(1)
    const mod = await import(entry)
    if (typeof mod[probe] === "undefined") {
      console.error(`${probe} missing from the ESM build`)
      process.exit(1)
    }
  ' "$esm_entry" "$probe"; then
    ok "import('dist/esm/index.js') resolves and exports $probe"
  else
    fail "$pkg: import('dist/esm/index.js') failed or lost $probe"
  fi
done

echo
if [[ "$FAILURES" -gt 0 ]]; then
  echo "Dual-build emit check FAILED ($FAILURES problem(s))." >&2
  exit 1
fi
echo "Dual-build emit check passed: dist/esm is ESM, dist/cjs is CommonJS, both load."
