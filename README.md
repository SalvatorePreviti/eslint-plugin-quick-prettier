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

This package exposes also a `helpers` module that can be required as `require('quick-prettier/eslint-helpers')`.

## helpers.addEslintConfigPrettierRules

Inject [eslint-config-prettier](https://github.com/prettier/eslint-config-prettier) configurations to your configuration dynamically, detecting which plugins are enabled in your config.

For example, in your `.eslintrc.js`, do

```js
const helpers = require('quick-prettier/eslint-helpers')

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

## helpers.mergeEslintConfigs

Merges multiple eslint configuration objects together.
Returns a new configuration object.

```js
const mergedConfig = mergeEslintConfigs(config1, config2, config3 ...)
```

## helpers.getPrettierConfig

Gets the cached `.prettierrc` configuration for the current directory.
If none is present, uses the default configuration defined in `eslint-plugin-quick-prettier/.prettierrc.json`

```js
const prettierConfig = helpers.getPrettierConfig()
console.log(prettierConfig.printWidth)
```

## helpers.getPrettier

Requires `require("prettier")`, but prefer the version installed in your current directory if present.

## helpers.hasLocalPackage

Returns true if the given module (or submodule file) is a locally installed module or file.
Returns false if the module does not exists or is installed only globally.
This function caches the result.

```js
const isSomeModuleInstalledLocally = helpers.hasLocalPackage('some-module')
```

## helpers.isGlobalPath

Checks if a path is a global require module path.

```js
const isGlobalPath = helpers.isGlobalPath(helpers.tryResolveLocal('some-module'))
console.log('some-module is installed', isGlobalPath ? 'globally' : 'locally')
```

## helpers.addNodeRequirePath

Adds additional require paths to node module resolve mechanism to allow eslint to load plugins and extends from other folders.
It does it by overriding the function `require('module')._nodeModulePaths`.
Called the first time, adds also helpers.baseFolder (that by default is process.cwd()).

```js
helpers.addNodeRequirePath()
```

```js
helpers.addNodeRequirePath('/folter/a/node_modules')
```
