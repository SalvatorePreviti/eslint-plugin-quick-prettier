module.exports = {
  extends: ['prettier', 'plugin:eslint-plugin/recommended', 'plugin:node/recommended', 'eslint:recommended'],
  plugins: ['eslint-plugin', 'json', 'self'],
  env: { mocha: true },
  root: true,
  rules: {
    'self/prettier': 1,
    'no-console': 1,
    'no-empty': 0,
    'no-confusing-arrow': [2, { allowParens: false }]
  }
}
