import nestConfig from '@makucho/eslint-config/nest';

export default [
  ...nestConfig,
  {
    // O dist e gerado pelo tsc; o .tsbuildinfo, pelo typecheck.
    ignores: ['dist/**', 'node_modules/**', '*.tsbuildinfo*'],
  },
];
