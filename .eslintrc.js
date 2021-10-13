module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2021: true,
    jest: true,
  },
  root: true,
  extends: ['eslint:recommended', 'plugin:prettier/recommended'],
  parser: 'babel-eslint',
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
    extraFileExtensions: ['.json'],
    ecmaFeatures: {
      modules: true,
      experimentalObjectRestSpread: true,
    },
  },
  rules: {
    'no-undef': 0,
  },
};
