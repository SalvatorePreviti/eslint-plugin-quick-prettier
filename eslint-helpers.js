const path = require('path')
const fs = require('fs')
const Module = require('module')

const { isArray } = Array

const _eslintExpectedPath = `node_modules${path.sep}eslint${path.sep}`
let _prettier = null
let _prettierConfig
let _tryPrettierConfig

/**
 * Requires eslint. Does it by understanding which one is the currently running eslint.
 * @param {function} [callerFunction] The caller function
 * @param {number} [stackTraceLimit] The stack trace size to check
 * @returns {typeof import('eslint')} The required eslint
 */
function getCallerEslintApi(callerFunction, stackTraceLimit = 10) {
  const oldPrepareStackTrace = Error.prepareStackTrace
  const oldStackTraceLimit = Error.stackTraceLimit
  let stack
  Error.stackTraceLimit = stackTraceLimit
  try {
    Error.prepareStackTrace = (_error, callinfos) => callinfos
    try {
      const error = new Error()
      Error.captureStackTrace(error, callerFunction || module.exports.getCallerEslintApi)
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
    for (const item of stack) {
      if (typeof item.getFileName === 'function') {
        const name = item.getFileName()
        if (typeof name === 'string') {
          const idx = name.lastIndexOf(_eslintExpectedPath)
          if (idx >= 0) {
            return require(name.slice(0, idx + _eslintExpectedPath.length))
          }
        }
      }
    }
  }
  return require('eslint')
}

/**
 * @returns {typeof import('prettier')}
 */
function getPrettier() {
  return _prettier || (_prettier = requirePrettier())
}

/**
 * @returns {null | typeof import('prettier')}
 */
function tryGetPrettier() {
  if (_prettier === undefined) {
    try {
      return requirePrettier()
    } catch (_error) {
      _prettier = null
    }
  }
  return _prettier
}

function requirePrettier() {
  if (_prettier) {
    return _prettier
  }

  const globalPathsSet = new Set(Module.globalPaths || [])

  function isGlobalPath(filepath) {
    if (typeof filepath === 'string' && filepath.length !== 0) {
      if (filepath.startsWith(module.exports.baseFolder)) {
        return false
      }
      for (const p of globalPathsSet) {
        if (filepath.startsWith(p)) {
          return true
        }
      }
    }
    return false
  }

  const resolvePaths = new Set(
    (
      (require.resolve && require.resolve.paths && require.resolve.paths(module.exports.baseFolder)) ||
      Module._nodeModulePaths(module.exports.baseFolder)
    ).filter(x => !isGlobalPath(x) && fs.existsSync(x))
  )
  const thisPackage = path.join(__dirname, 'node_modules')
  if (fs.existsSync(thisPackage)) {
    resolvePaths.add(thisPackage)
  }

  const cwdPaths = require.resolve.paths(path.join(process.cwd(), 'package.json'))
  for (const p of cwdPaths) {
    resolvePaths.add(p)
  }

  try {
    return require(require.resolve('prettier', { paths: Array.from(resolvePaths) }))
  } catch (_error) {
    return require('prettier')
  }
}

/**
 * Loads the prettier configuration for the specified project.
 * @returns {{
 *   parser?: string
 *   bracketSpacing?: boolean,
 *   jsxBracketSameLine?: boolean,
 *   printWidth?: number,
 *   semi?: boolean,
 *   singleQuote?: boolean,
 *   tabWidth?: number,
 *   endOfLine?: string,
 *   trailingComma?: string,
 *   useTabs?: boolean
 * }}
 */
function loadPrettierConfig(baseFolder = module.exports.baseFolder) {
  return {
    ...require('./.prettierrc.json'),
    ...getPrettier().resolveConfig.sync(baseFolder, {
      editorconfig: true,
      useCache: true
    })
  }
}

/**
 * Gets the prettier configuration for the current project.
 * @returns {{
 *   parser?: string
 *   bracketSpacing?: boolean,
 *   jsxBracketSameLine?: boolean,
 *   printWidth?: number,
 *   semi?: boolean,
 *   singleQuote?: boolean,
 *   tabWidth?: number,
 *   endOfLine?: string,
 *   trailingComma?: string,
 *   useTabs?: boolean
 * }}
 */
function getPrettierConfig() {
  if (_prettierConfig) {
    return _prettierConfig
  }
  _prettierConfig = loadPrettierConfig()
  _tryPrettierConfig = _prettierConfig
  return _prettierConfig
}

function tryGetPrettierConfig() {
  if (_tryPrettierConfig) {
    return _tryPrettierConfig
  }
  try {
    getPrettierConfig()
  } catch (_error) {
    _tryPrettierConfig = { ...require('./.prettierrc.json') }
  }
  return _tryPrettierConfig
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
 * @returns {T} A new eslint configuration with replaced rules
 */
function addEslintConfigPrettierRules(eslintConfig) {
  eslintConfig = { ...eslintConfig, plugins: eslintConfig.plugins ? Array.from(eslintConfig.plugins) : [] }

  const pluginSet = new Set()
  addToPluginsSet(pluginSet, eslintConfig)

  const recommended = require('.').configs.recommended

  eslintConfig.rules = {
    ...recommended.rules,
    ...eslintConfig.rules
  }

  for (const recommendedPlugin of recommended.plugins) {
    if (!pluginSet.has(recommendedPlugin)) {
      eslintConfig.plugins.push(recommendedPlugin)
    }
  }

  if (pluginSet.has('vue')) {
    eslintConfig.rules = {
      ...require('eslint-config-prettier/vue').rules,
      ...eslintConfig.rules
    }
  }

  if (pluginSet.has('unicorn')) {
    eslintConfig.rules = {
      ...require('eslint-config-prettier/unicorn').rules,
      ...eslintConfig.rules
    }
  }

  if (pluginSet.has('standard')) {
    eslintConfig.rules = {
      ...require('eslint-config-prettier/standard').rules,
      ...eslintConfig.rules
    }
  }

  if (pluginSet.has('react')) {
    eslintConfig.rules = {
      ...require('eslint-config-prettier/react').rules,
      ...eslintConfig.rules
    }
  }

  if (pluginSet.has('flowtype')) {
    eslintConfig.rules = {
      ...require('eslint-config-prettier/flowtype').rules,
      ...eslintConfig.rules
    }
  }

  if (pluginSet.has('babel')) {
    eslintConfig.rules = {
      ...require('eslint-config-prettier/babel').rules,
      ...eslintConfig.rules
    }
  }

  if (pluginSet.has('@typescript-eslint')) {
    eslintConfig.rules = {
      ...require('eslint-config-prettier/@typescript-eslint').rules,
      ...eslintConfig.rules
    }
  }

  if (isArray(eslintConfig.overrides)) {
    eslintConfig.overrides = eslintConfig.overrides.map(module.exports.addEslintConfigPrettierRules)
  }

  return eslintConfig
}

module.exports.baseFolder = process.cwd()
module.exports.getPrettier = getPrettier
module.exports.tryGetPrettier = tryGetPrettier
module.exports.getPrettierConfig = getPrettierConfig
module.exports.tryGetPrettierConfig = tryGetPrettierConfig
module.exports.getCallerEslintApi = getCallerEslintApi
module.exports.addEslintConfigPrettierRules = addEslintConfigPrettierRules
