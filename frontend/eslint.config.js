import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

// Shared by both selectors below (the `as` form and the angle-bracket form).
const SNAPSHOT_DATE_CAST_MESSAGE =
  'Do not cast to SnapshotDate — it launders an unvalidated date into a per-snapshot fetch and re-admits the #1315 blank-UI bug. Mint it instead: toSnapshotDate(raw) for URL/API input, or snapshotDatesFrom(index) / snapshotDateFromManifest(manifest) when the CDN index is at hand.'

export default [
  js.configs.recommended,
  {
    ignores: ['e2e/**', 'playwright.config.ts'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.es2020,
        React: 'readonly',
        JSX: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // TypeScript Steering Document Requirements - Relaxed for Maintenance Mode
      '@typescript-eslint/no-explicit-any': 'error',
      // Allow underscore-prefixed variables to be unused (for intentionally unused params)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'off', // Disabled for maintenance mode - too many warnings
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
        },
      ],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': 'allow-with-description',
          'ts-expect-error': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-console': 'warn',
      // Keep the SnapshotDate brand honest (#1323, epic #1319). The brand makes
      // the #1315 closing-window bug class (as-of date keyed into a
      // snapshots/{date}/... fetch) unrepresentable — but `raw as SnapshotDate`
      // re-admits all of it in five characters, and no type-level guard can see
      // a cast. The mint module below is exempt; everywhere else must go through
      // toSnapshotDate / snapshotDatesFrom / snapshotDateFromManifest.
      //
      // Syntactic by necessity: this config runs tsparser with no `project`, so
      // type-aware rules are unavailable. Behaviour (not severity) is asserted
      // by src/__tests__/lint/no-snapshot-date-cast.test.ts — an AST selector is
      // an unchecked string and silently matches nothing if the ESTree shape
      // drifts (Lesson 82). It shipped doing exactly that: a `>` combinator here
      // let `as SnapshotDate[]` / `| undefined` / `Array<SnapshotDate>` through
      // until review caught it, which is why every variant is now pinned.
      //
      // Blind spots, stated rather than papered over (L166): this bans the CAST,
      // not every route to a lie. `toSnapshotDate(data.asOfDate)` mints the
      // #1315 bug through the front door (format is checked, provenance cannot
      // be), and `snapshotDatesFrom({ dates: [asOfDate] })` forges the index
      // shape. The brand raises the cost of the mistake and makes the honest
      // path the easy one; it is not a proof.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'TSAsExpression TSTypeReference > Identifier[name="SnapshotDate"]',
          message: SNAPSHOT_DATE_CAST_MESSAGE,
        },
        {
          selector:
            'TSTypeAssertion TSTypeReference > Identifier[name="SnapshotDate"]',
          message: SNAPSHOT_DATE_CAST_MESSAGE,
        },
      ],
    },
  },
  {
    // The mint module is where the brand is CREATED — the casts here are the
    // one place the nominal type can come into existence, guarded by the
    // validation in toSnapshotDate. Exempting it is what makes the ban above
    // enforceable everywhere else rather than impossible to satisfy.
    files: ['src/types/snapshotDate.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['scripts/**/*.js', 'scripts/**/*.mjs', 'src/scripts/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2020,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      // TypeScript Steering Document Requirements - Relaxed for Maintenance Mode
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off', // Disabled for maintenance mode
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': 'allow-with-description',
          'ts-expect-error': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],
    },
  },
  {
    files: ['**/__tests__/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2020,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2020,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
        NodeListOf: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // TypeScript Steering Document Requirements - Test Files (Relaxed)
      '@typescript-eslint/no-explicit-any': 'warn', // Relaxed for test files
      '@typescript-eslint/explicit-function-return-type': 'off', // Disabled for test files
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': 'allow-with-description',
          'ts-expect-error': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
]
