const Module = require('module')
const path = require('path')
const fs = require('fs')

const { isArray, from: arrayFrom } = Array
const { keys: objectKeys, assign: objectAssign, defineProperty } = Object
const { existsSync } = fs

const _eslintExpectedPath = `node_modules${path.sep}eslint${path.sep}`
const _hasPackageCache = new Map()
const _globalPathsArray = Module.globalPaths || []
const _globalPathsSet = new Set(_globalPathsArray)
let _prettier = null
let _prettierConfig
let _oldNodeModulePaths = null

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
  return _prettier || (_prettier = module.exports.tryRequireLocal('prettier') || require('prettier'))
}

function getPrettierConfig() {
  if (_prettierConfig === undefined) {
    _prettierConfig = {
      ...require('./.prettierrc.json'),
      ...getPrettier().resolveConfig.sync(module.exports.baseFolder, {
        editorconfig: true,
        useCache: true
      })
    }
  }
  return _prettierConfig
}

function mergeEslintConfigs(...sources) {
  let result = {}
  for (const source of sources) {
    result = deepmerge(result, source, true)
  }
  return result
}

function deepmerge(target, src, combine, isRule) {
  /*
   * This code is inspired from deepmerge and eslint
   * (https://github.com/KyleAMathews/deepmerge)
   */
  const array = isArray(src) || isArray(target)
  let dst = (array && []) || {}

  if (array) {
    const resolvedTarget = target || []

    // src could be a string, so check for array
    if (isRule && Array.isArray(src) && src.length > 1) {
      dst = dst.concat(src)
    } else {
      dst = dst.concat(resolvedTarget)
    }
    const resolvedSrc = typeof src === 'object' ? src : [src]
    const keys = objectKeys(resolvedSrc)
    for (let i = 0, len = keys.length; i !== len; ++i) {
      const e = resolvedSrc[i]
      if (dst[i] === undefined) {
        dst[i] = e
      } else if (typeof e === 'object') {
        if (isRule) {
          dst[i] = e
        } else {
          dst[i] = deepmerge(resolvedTarget[i], e, combine, isRule)
        }
      } else if (!combine) {
        dst[i] = e
      } else if (dst.indexOf(e) === -1) {
        dst.push(e)
      }
    }
  } else {
    if (target && typeof target === 'object') {
      objectAssign(dst, target)
    }
    const keys = objectKeys(src)
    for (let i = 0, len = keys.length; i !== len; ++i) {
      const key = keys[i]
      if (key === 'overrides') {
        dst[key] = (target[key] || []).concat(src[key] || [])
      } else if (Array.isArray(src[key]) || Array.isArray(target[key])) {
        dst[key] = deepmerge(target[key], src[key], key === 'plugins' || key === 'extends', isRule)
      } else if (typeof src[key] !== 'object' || !src[key] || key === 'exported' || key === 'astGlobals') {
        dst[key] = src[key]
      } else {
        dst[key] = deepmerge(target[key] || {}, src[key], combine, key === 'rules')
      }
    }
  }

  return dst
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

function addEslintConfigPrettierRules(eslintConfig) {
  eslintConfig = deepmerge({}, eslintConfig, true)

  const pluginSet = new Set()
  addToPluginsSet(pluginSet, eslintConfig)

  if (!pluginSet.has('quick-prettier')) {
    if (!eslintConfig.plugins) {
      eslintConfig.plugins = []
    }
    eslintConfig.plugins.push('quick-prettier')
  }

  eslintConfig.rules = {
    ...require('.').configs.rules,
    ...eslintConfig.rules
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

/**
 * Checks if a path is a global require module path.
 * @param {string|null|undefined} filepath The file path to check
 * @returns {boolean} True if the path is a global node_modules path, false if not.
 */
function isGlobalPath(filepath) {
  if (typeof filepath === 'string' && filepath.length !== 0) {
    if (filepath.startsWith(module.exports.baseFolder)) {
      return false
    }
    if (_globalPathsSet.has(filepath)) {
      return true
    }
    for (let i = 0; i < _globalPathsArray.length; ++i) {
      if (filepath.startsWith(_globalPathsArray[i])) {
        return true
      }
    }
  }
  return false
}

let _resolvePaths

function getResolvePathsSet() {
  if (!_resolvePaths) {
    _resolvePaths = new Set(
      (
        (require.resolve && require.resolve.paths && require.resolve.paths(module.exports.baseFolder)) ||
        Module._nodeModulePaths(module.exports.baseFolder)
      ).filter(x => !isGlobalPath(x) && existsSync(x))
    )
    const thisPackage = path.join(__dirname, 'node_modules')
    if (existsSync(thisPackage)) {
      _resolvePaths.add(thisPackage)
    }
  }
  return _resolvePaths
}

/**
 * Tries to resolve the path of a module.
 * @param {string} id The module to resolve.
 * @returns {string|null} The resolved module path or null if not found.
 */
function hasLocalPackage(id) {
  if (id.startsWith('.')) {
    id = path.resolve(module.exports.baseFolder, id)
  } else if (id.startsWith(path.sep) || id.startsWith('/')) {
    id = path.resolve(id)
  }
  let result = _hasPackageCache.get(id)
  if (result === undefined) {
    result = false
    try {
      if (isGlobalPath(require.resolve(id))) {
        result = true
      }
    } catch (_error) {}
    _hasPackageCache.set(id, result)
  }
  return result
}

function _nodeModulePaths(from) {
  const set = new Set()
  let customAdded = false
  const defaults = _oldNodeModulePaths.call(Module, from)

  for (let i = 0, defaultsLen = defaults.length; i !== defaultsLen; ++i) {
    const value = defaults[i]
    if (!customAdded && _globalPathsSet.has(value)) {
      customAdded = true
      for (const p of _resolvePaths || getResolvePathsSet()) {
        set.add(p)
      }
    }
    set.add(defaults[i])
  }
  if (!customAdded) {
    for (const p of _resolvePaths || getResolvePathsSet()) {
      set.add(p)
    }
  }
  return arrayFrom(set)
}

function addNodeRequirePath(additionalPath) {
  if (_oldNodeModulePaths === null) {
    _oldNodeModulePaths = Module._nodeModulePaths
    if (typeof _oldNodeModulePaths !== 'function') {
      throw new Error(
        'Module._nodeModulePaths is undefined. Maybe node version ' + process.version + ' does not support it?'
      )
    }
    Module._nodeModulePaths = _nodeModulePaths
  }

  if (additionalPath) {
    getResolvePathsSet().add(path.resolve(additionalPath))
  }
}

function defineLazyProperty(target, name, getter) {
  defineProperty(target, name, {
    get() {
      const result = getter()
      this[name] = result
      return result
    },
    set(value) {
      defineProperty(target, name, {
        value,
        configurable: true,
        writable: true,
        enumerable: true
      })
    },
    configurable: true,
    enumerable: true
  })
}

exports.baseFolder = process.cwd()
exports.hasLocalPackage = hasLocalPackage
exports.isGlobalPath = isGlobalPath
exports.getPrettier = getPrettier
exports.getPrettierConfig = getPrettierConfig
exports.getCallerEslintApi = getCallerEslintApi
exports.mergeEslintConfigs = mergeEslintConfigs
exports.addEslintConfigPrettierRules = addEslintConfigPrettierRules
exports.addNodeRequirePath = addNodeRequirePath
exports.defineLazyProperty = defineLazyProperty
