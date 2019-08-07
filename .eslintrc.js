const eslintPluginQuickPrettier = require('./')

const rules = {
  ...eslintPluginQuickPrettier.configs.recommended.rules,
  'no-console': 1,
  'no-empty': 0,
  'no-confusing-arrow': [2, { allowParens: false }]
}

const quickPrettierRules = rules['quick-prettier/prettier']
delete rules['quick-prettier/prettier']
rules['self/prettier'] = quickPrettierRules

module.exports = {
  extends: ['plugin:eslint-plugin/recommended', 'plugin:node/recommended', 'eslint:recommended'],
  plugins: ['eslint-plugin', 'json', 'self'],
  env: { mocha: true },
  root: true,
  rules
}
