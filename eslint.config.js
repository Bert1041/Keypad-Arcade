import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '.vercel/**',
    'api/**',
    'dist/**',
    'dev-dist/**',
    'test-results/**',
    'playwright-report/**',
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],
  prettier,
  {
    languageOptions: { globals: { ...globals.browser } },
  },
  // Rules that need type information: they catch real bugs, not style.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // An un-awaited promise loses its error (e.g. a score that silently fails to save).
      '@typescript-eslint/no-floating-promises': 'error',
      // Passing an async function where a sync callback is expected drops its errors.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      // A switch over a union (placement results, share outcomes…) must handle every case.
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // App code may not use `!`: it hides the "can this be missing?" question.
    // Tests may, where a fixture guarantees the value.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'error' },
  },
  {
    // Node-side tooling and tests.
    files: ['*.config.{ts,js}', 'scripts/**', 'e2e/**'],
    languageOptions: { globals: { ...globals.node } },
  },
]);
