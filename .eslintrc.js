const eslintPluginQuickPrettier = require('./')

const rules = {
  ...eslintPluginQuickPrettier.configs.recommended.rules,
  'self/prettier': 1,
  'no-console': 1,
  'no-empty': 0,
  'no-confusing-arrow': [2, { allowParens: false }]
}

delete rules['quick-prettier/prettier']

module.exports = {
  extends: ['plugin:eslint-plugin/recommended', 'plugin:node/recommended', 'eslint:recommended'],
  plugins: ['eslint-plugin', 'json', 'self'],
  env: { mocha: true },
  root: true,
  rules
}
