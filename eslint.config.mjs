import base from '@jabrown93/dev-config/eslint';

export default [
  ...base,
  {
    ignores: ['**/dist'],
  },
];
