# [eslint-plugin-quick-prettier](https://github.com/SalvatorePreviti/eslint-plugin-quick-prettier)

[eslint-plugin-quick-prettier](https://github.com/SalvatorePreviti/eslint-plugin-quick-prettier) package is meant to be used instead of [eslint-plugin-prettier](https://github.com/prettier/eslint-plugin-prettier) to
quickly fix formatting problems (in editor or command line with `eslint --fix`) without raising any warning during editing.

[eslint-plugin-prettier](https://github.com/prettier/eslint-plugin-prettier) can be slow for very big projects.
[eslint-plugin-prettier](https://github.com/prettier/eslint-plugin-prettier) raises warnings and errors for formatting.

# installation

Install the package with

```sh
npm install --save-dev eslint-plugin-quick-prettier
```

Enable the plugin in your `.eslintrc` using the recommended configuration

```json
{
  "extends": ["plugin:quick-prettier/recommended"]
}
```

Or enable just plugin in your `.eslintrc`

```json
{
  "plugins": ["quick-prettier"],
  "rules": {
    "quick-prettier/prettier": 1
  }
}
```

# helpers

This package exposes also a `helpers` module that can be required as `require('quick-prettier/helpers')`.

## helpers.addEslintConfigPrettierRules

Modifying your `.eslintrc.js` in this way:

```js
const helpers = require('quick-prettier/helpers')

const myConfiguration = {
  extends: ['plugin:react/recommended'],

  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint']
    }
  ]
}

module.exports = helpers.addEslintConfigPrettierRules(eslintConfig)
```

will automatically inject this plugin and the required overrides coming from [eslint-config-prettier](https://github.com/prettier/eslint-config-prettier) to your configuration.

## helpers.mergeEslintConfigs

Merges multiple eslint configuration objects together.
Returns a new configuration object.

```js
const mergedConfig = mergeEslintConfigs(config1, config2, config3 ...)
```

## helpers.getPrettierConfig

Gets the cached `.prettierrc` configuration for the current directory.
If none is present, uses the default configuration defined in `eslint-plugin-quick-prettier/.prettierrc`

```js
const prettierConfig = helpers.getPrettierConfig()
console.log(prettierConfig.printWidth)
```

## helpers.getPrettier

Requires `require("prettier")`, but prefer the version installed in your current directory if present.
