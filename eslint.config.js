import eslintRecommended from '@eslint/js';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

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
  prettierRecommended,
  {
    rules: {
      eqeqeq: 'error',
      'no-console': 'warn',
    },
  },
];
