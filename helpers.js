const path = require('path')
const fs = require('fs')

const { isArray } = Array
const { keys: objectKeys, assign: objectAssign } = Object

const eslintExpectedPath = `node_modules${path.sep}eslint${path.sep}`

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
      Error.captureStackTrace(error, callerFunction || exports.getCallerEslintApi)
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
          const idx = name.lastIndexOf(eslintExpectedPath)
          if (idx >= 0) {
            return require(name.slice(0, idx + eslintExpectedPath.length))
          }
        }
      }
    }
  }
  return require('eslint')
}

let prettier = null

/**
 * @returns {typeof import('prettier')}
 */
function getPrettier() {
  if (prettier !== null) {
    return prettier
  }

  const resolvedPrettier = path.resolve(path.join(process.cwd(), 'node_modules', 'prettier'))
  if (fs.existsSync(resolvedPrettier)) {
    try {
      prettier = require(resolvedPrettier)
      return prettier
    } catch (_error) {}
  }

  prettier = require('prettier')
  return prettier
}

let prettierConfig

function getPrettierConfig() {
  if (prettierConfig === undefined) {
    prettierConfig = {
      ...fs.readFileSync(path.resolve(path.join(__dirname, './.prettierrc'))),
      ...getPrettier().resolveConfig.sync(process.cwd(), {
        editorconfig: true,
        useCache: true
      })
    }
  }
  return prettierConfig
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

function mergeEslintConfigs(...sources) {
  let result = {}
  for (const source of sources) {
    result = deepmerge(result, source, true)
  }
  return result
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
    ...require('./').rules,
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
    for (const override of eslintConfig.overrides) {
      addEslintConfigPrettierRules(override)
    }
  }

  return eslintConfig
}

exports.getPrettier = getPrettier
exports.getCallerEslintApi = getCallerEslintApi
exports.getPrettierConfig = getPrettierConfig
exports.mergeEslintConfigs = mergeEslintConfigs
exports.addEslintConfigPrettierRules = addEslintConfigPrettierRules
