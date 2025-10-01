const eslintRecommended = require('@eslint/js');
const prettierRecommended = require('eslint-plugin-prettier/recommended');
const tseslint = require('typescript-eslint');

module.exports = [
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
      'src/infrastructure/external-services/grpc/proto/',
    ],
  },
  eslintRecommended.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      eqeqeq: 'error',
      'no-console': 'warn',
      // Set TypeScript any and unused vars rules to warn for better visibility
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  prettierRecommended,
];
