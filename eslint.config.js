import js from '@eslint/js'
import pluginVitest from '@vitest/eslint-plugin'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import { globalIgnores } from 'eslint/config'
import pluginVue from 'eslint-plugin-vue'

export default defineConfigWithVueTs(
  { name: 'app/files-to-lint', files: ['**/*.{ts,mts,vue}'] },
  globalIgnores(['**/dist/**', '**/.data/**', '**/coverage/**']),

  js.configs.recommended,
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  { ...pluginVitest.configs.recommended, files: ['**/*.test.ts'] },

  // Beyond create-vue's defaults:
  // - typescript-eslint's promise rules (part of its `recommendedTypeChecked` preset). An unhandled
  //   promise rejection crashes the Node server, and these catch promises that are neither awaited nor
  //   handled. `void promise` marks a deliberate fire-and-forget.
  // - Explicit return types on exported functions: what a module returns is a contract, so it is
  //   written down instead of inferred from the body. Inner closures and Vue handlers are exempt.
  // - No `!` and no object-literal casts: both tell the compiler to stop checking. Narrow the value (or
  //   throw) instead, and give a literal a type with `: Type` or `satisfies`. Other `as` casts stay
  //   allowed (`as const` is not really a cast), but each is a deliberate decision.
  {
    name: 'app/strict-types',
    files: ['**/*.{ts,mts,vue}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
    },
  },

  // Must stay last: turns off every rule that would conflict with Prettier's formatting.
  skipFormatting,
)
