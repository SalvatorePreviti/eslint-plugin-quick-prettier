'use strict'

const eslintConfigPrettier = require('eslint-config-prettier')

module.exports = {
  configs: {
    recommended: {
      extends: ['quick-prettier'],
      plugins: ['quick-prettier'],
      rules: {
        ...eslintConfigPrettier.rules,
        'max-len': [0, 120],
        'no-confusing-arrow': [
          1,
          {
            allowParens: true
          }
        ],
        'no-mixed-operators': [
          'warn',
          {
            allowSamePrecedence: false,
            groups: [
              ['&', '|', '^', '~', '<<', '>>', '>>>'],
              ['==', '!=', '===', '!==', '>', '>=', '<', '<='],
              ['&&', '||'],
              ['in', 'instanceof']
            ]
          }
        ],
        'no-tabs': 1,
        'no-unexpected-multiline': 1,
        'quick-prettier/prettier': 1,
        'prefer-arrow-callback': [
          1,
          {
            allowNamedFunctions: true,
            allowUnboundThis: true
          }
        ],
        indent: [
          0,
          2,
          {
            SwitchCase: 1,
            ArrayExpression: 1,
            ObjectExpression: 1,
            ImportDeclaration: 1,
            MemberExpression: 1,
            VariableDeclarator: 1,
            outerIIFEBody: 1,
            FunctionDeclaration: { parameters: 1, body: 1 },
            FunctionExpression: { parameters: 1, body: 1 },
            CallExpression: { arguments: 1 },
            flatTernaryExpressions: false,
            ignoredNodes: ['JSXElement', 'JSXElement *']
          }
        ]
      }
    }
  },
  rules: {
    prettier: require('./rules/prettier')
  }
}
