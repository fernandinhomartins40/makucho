import { baseConfig } from './base.js';

export default [
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: { sourceType: 'commonjs' },
    },
    rules: {
      // Decorators do Nest exigem classes sem membros inicializados
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/interface-name-prefix': 'off',
    },
  },
];
