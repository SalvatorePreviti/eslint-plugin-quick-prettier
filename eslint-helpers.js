const path = require('path')
const fs = require('fs')

const { isArray } = Array
const { assign: objectAssign } = Object

const _eslintExpectedPath = `node_modules${path.sep}eslint${path.sep}`

/**
 * Resolve eslint package folder.
 * @param {function} [callerFunction] The caller function
 * @param {number} [stackTraceLimit] The stack trace size to check
 * @returns {string} The path of the eslint package root
 */
function resolveCallerEslintApi(callerFunction, stackTraceLimit = 25) {
  const oldPrepareStackTrace = Error.prepareStackTrace
  const oldStackTraceLimit = Error.stackTraceLimit
  let stack
  Error.stackTraceLimit = stackTraceLimit
  try {
    Error.prepareStackTrace = (_error, callinfos) => callinfos
    try {
      const error = new Error()
      Error.captureStackTrace(error, callerFunction || module.exports.resolveCallerEslintApi)
      throw error
    } catch (error) {
      stack = error.stack
    } finally {
      Error.prepareStackTrace = oldPrepareStackTrace
    }
  } finally {
    Error.stackTraceLimit = oldStackTraceLimit
  }
  if (Array.isArray(stack)) {
    try {
      for (const item of stack) {
        if (typeof item.getFileName === 'function') {
          const name = item.getFileName()
          if (typeof name === 'string') {
            const idx = name.lastIndexOf(_eslintExpectedPath)
            if (idx >= 0) {
              const p = path.resolve(name.slice(0, idx + _eslintExpectedPath.length))
              if (fs.existsSync(p)) {
                return p
              }
            }
          }
        }
      }
    } catch (_error) {}
  }
  return path.dirname(require.resolve('eslint/package.json'))
}

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
 * @param {*} [overriddenRules] Additional rules to add for every item.
 * @returns {T} A new eslint configuration with replaced rules
 */
function addEslintConfigPrettierRules(eslintConfig, overriddenRules) {
  eslintConfig = { ...eslintConfig, plugins: eslintConfig.plugins ? Array.from(eslintConfig.plugins) : [] }

  const pluginSet = new Set()
  addToPluginsSet(pluginSet, eslintConfig)

  const recommended = require('.').configs.recommended

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

module.exports.resolveCallerEslintApi = resolveCallerEslintApi

module.exports.addEslintConfigPrettierRules = addEslintConfigPrettierRules
