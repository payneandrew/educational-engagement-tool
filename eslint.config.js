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

  // One addition beyond create-vue's defaults: typescript-eslint's promise rules (part of its
  // `recommendedTypeChecked` preset). An unhandled promise rejection crashes the Node server, and these
  // catch promises that are neither awaited nor handled. `void promise` marks a deliberate fire-and-forget.
  {
    name: 'app/promises',
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
    },
  },

  // Must stay last: turns off every rule that would conflict with Prettier's formatting.
  skipFormatting,
)
