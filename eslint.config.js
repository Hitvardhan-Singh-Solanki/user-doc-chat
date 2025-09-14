import eslintRecommended from '@eslint/js';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'python_service/',
      'proto/',
      'venv/',
      'dist/',
      'node_modules/',
      'migrate.config.js',
      'analyze.js',
      'eslint.config.js',
      'jest.config.js',
      'webpack.config.js',
      '*.config.js',
      '*.config.cjs',
      '*.config.mjs',
      'coverage/',
      '.git/',
      '.idea/',
      '*.min.js',
      '*.d.ts',
      'src/proto/',
    ],
  },
  eslintRecommended.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      eqeqeq: 'error',
      'no-console': 'warn',
      // Disable TypeScript any and unused vars rules
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  prettierRecommended,
];
