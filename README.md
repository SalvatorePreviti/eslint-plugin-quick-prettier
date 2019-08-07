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

To run some native fixable eslint rules only in fix mode, without raising waenings, in `.eslintrc`

```json
{
  "plugins": ["quick-prettier"],
  "rules": {
    "quick-prettier/prettier": [
      1,
      {
        // Prettifies package.json files
        "prettify-package-json": true,
        "rules": {
          // eslint native rules to run only in --fix mode
          "padding-line-between-statements": [
            1,
            {
              "blankLine": "always",
              "next": "import",
              "prev": "let"
            }
          ],
          "...another-rule": [1, "..."]
        }
      }
    ]
  }
}
```
