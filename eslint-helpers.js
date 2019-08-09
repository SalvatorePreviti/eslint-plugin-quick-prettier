const { isArray } = Array
const { assign: objectAssign } = Object

function addToPluginsSet(set, eslintConfig) {
  const add = plugin => {
    if (typeof plugin !== 'string' || plugin.length === 0) {
      return
    }
    if (plugin.startsWith('plugin:')) {
      plugin = plugin.slice('plugin:'.length)
    }
    if (plugin.startsWith('eslint-plugin-')) {
      plugin = plugin.slice('eslint-plugin-'.length)
    }
    if (plugin.endsWith('/eslint-plugin')) {
      plugin = plugin.slice(0, plugin.length - '/eslint-plugin'.length)
    }
    set.add(plugin)
    set.add('plugin:' + plugin)
    set.add('eslint-plugin-' + plugin)
    if (plugin.startsWith('@')) {
      set.add(plugin + '/eslint-plugin')
    }
  }

  if (isArray(eslintConfig.plugins)) {
    for (let plugin of eslintConfig.plugins) {
      add(plugin)
    }
  }

  let extend = eslintConfig.extends
  if (typeof extend === 'string') {
    extend = [extend]
  }

  if (isArray(extend)) {
    for (let extension of extend) {
      if (typeof extension === 'string' && extension.startsWith('plugin:')) {
        const indexOfSlash = extension.indexOf('/')
        if (indexOfSlash > 0) {
          extension = extension.slice(0, indexOfSlash)
        }
        add(extension)
      }
    }
  }
}

/**
 * Overrides formatting rules with eslint-config-prettier
 * @template T
 * @param  {...readonly T} eslintConfig The source eslint configuration to override
 * @param {object} [overriddenRules] Additional rules to add for every override.
 * @param {object} [quickPrettierRules] Additional rules to add to quick-prettier/prettier inner rules.
 * @returns {T} A new eslint configuration with replaced rules
 */
function addEslintConfigPrettierRules(eslintConfig, overriddenRules, quickPrettierRules) {
  eslintConfig = { ...eslintConfig, plugins: eslintConfig.plugins ? Array.from(eslintConfig.plugins) : [] }

  const pluginSet = new Set()
  addToPluginsSet(pluginSet, eslintConfig)

  let recommended = require('.').configs.recommended

  recommended.rules = { ...recommended.rules }

  const additionalRules = {}

  for (const recommendedPlugin of recommended.plugins) {
    if (!pluginSet.has(recommendedPlugin)) {
      eslintConfig.plugins.push(recommendedPlugin)
    }
  }

  if (pluginSet.has('vue')) {
    objectAssign(additionalRules, require('eslint-config-prettier/vue').rules)
  }

  if (pluginSet.has('unicorn')) {
    objectAssign(additionalRules, require('eslint-config-prettier/unicorn').rules)
  }

  if (pluginSet.has('standard')) {
    objectAssign(additionalRules, require('eslint-config-prettier/standard').rules)
  }

  if (pluginSet.has('react')) {
    objectAssign(additionalRules, require('eslint-config-prettier/react').rules)
  }

  if (pluginSet.has('flowtype')) {
    objectAssign(additionalRules, require('eslint-config-prettier/flowtype').rules)
  }

  if (pluginSet.has('babel')) {
    objectAssign(additionalRules, require('eslint-config-prettier/babel').rules)
  }

  if (pluginSet.has('@typescript-eslint')) {
    objectAssign(additionalRules, require('eslint-config-prettier/@typescript-eslint').rules)
  }

  const rules = {
    ...additionalRules,
    ...recommended.rules,
    ...eslintConfig.rules,
    ...overriddenRules
  }

  if (quickPrettierRules) {
    if (rules['quick-prettier/prettier']) {
      rules['quick-prettier/prettier'] = [
        rules['quick-prettier/prettier'][0] || rules['quick-prettier/prettier'] || 0,
        {
          ...rules['quick-prettier/prettier'][1],
          ...quickPrettierRules
        }
      ]
    }
  }

  if (pluginSet.has('package-json')) {
    rules['package-json/order-properties'] = 0
    rules['package-json/sort-collections'] = 0
  }

  eslintConfig.rules = rules

  if (isArray(eslintConfig.overrides)) {
    eslintConfig.overrides = eslintConfig.overrides.map(item => {
      return module.exports.addEslintConfigPrettierRules(item, overriddenRules)
    })
  }

  return eslintConfig
}

module.exports.addEslintConfigPrettierRules = addEslintConfigPrettierRules
