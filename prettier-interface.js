const path = require('path')
const fs = require('fs')
const Module = require('module')

let _prettier
let _defaultPrettierConfig
let _prettierConfig
let _tryPrettierConfig

exports.baseFolder = process.cwd()

/**
 * @returns {typeof import('prettier')}
 */
function getPrettier() {
  return _prettier || (_prettier = requirePrettier())
}

exports.getPrettier = getPrettier

/**
 * Tries to require prettier. Return null if not installed.
 * Prefers the local installed prettier.
 *
 * @returns {null | typeof import('prettier')}
 */
function tryGetPrettier() {
  if (_prettier === undefined) {
    try {
      return requirePrettier()
    } catch (_error) {}
    if (!_prettier) {
      _prettier = null
    }
  }
  return _prettier
}

exports.tryGetPrettier = tryGetPrettier

/**
 * Loads the prettier configuration for the specified project.
 *
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
function loadPrettierConfig(baseFolder = exports.baseFolder) {
  return {
    ...getDefaultPrettierConfig(),
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

exports.getPrettierConfig = getPrettierConfig

/**
 * Tries to get the prettier configuration for the current project.
 * Returns a default one if not found or an error occourred.
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
function tryGetPrettierConfig() {
  if (_tryPrettierConfig) {
    return _tryPrettierConfig
  }
  try {
    getPrettierConfig()
  } catch (_error) {
    _tryPrettierConfig = {
      ...getDefaultPrettierConfig()
    }
  }
  return _tryPrettierConfig
}

exports.tryGetPrettierConfig = tryGetPrettierConfig

/**
 * Formats a piece of code using prettier.
 *
 * @param {string} source
 * @param {{
 *   ignoreErrors?: boolean
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
 * }} [options]
 *
 * @returns {string} The prettified code.
 */
function format(source, options) {
  if (!options || !options.ignoreErrors) {
    return exports.getPrettier().format(source, { ...exports.getPrettierConfig(), ...options })
  }

  const prettier = exports.tryGetPrettier()
  if (!prettier) {
    return source
  }
  try {
    return prettier.format(source, { ...exports.tryGetPrettierConfig(), ...options })
  } catch (_error) {}
  return source
}

exports.format = format

/**
 * Invalidates the loaded prettier configuration discarding the previous one.
 */
function reloadPrettierConfig() {
  _defaultPrettierConfig = undefined
  _tryPrettierConfig = undefined
  _prettierConfig = undefined

  if (_prettier) {
    _prettier.clearConfigCache()
  }
}

exports.reloadPrettierConfig = reloadPrettierConfig

/**
 * Invalidates the loaded prettier and the loaded configuration.
 * The next call to getPrettier will require it again.
 */
function reloadPrettier() {
  reloadPrettierConfig()
  _prettier = undefined
}

exports.reloadPrettier = reloadPrettier

/**
 * Gets the default prettier configuration.
 * Can be overridden.
 * @type {{
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
function loadDefaultPrettierConfig() {
  // eslint-disable-next-line node/no-missing-require
  return require('./.prettierrc.json')
}

exports.loadDefaultPrettierConfig = loadDefaultPrettierConfig

function getDefaultPrettierConfig() {
  return (
    _defaultPrettierConfig ||
    (_defaultPrettierConfig = exports.loadDefaultPrettierConfig() || loadDefaultPrettierConfig())
  )
}

function requirePrettier() {
  if (_prettier) {
    return _prettier
  }

  const globalPathsSet = new Set(Module.globalPaths || [])

  function isGlobalPath(filepath) {
    if (typeof filepath === 'string' && filepath.length !== 0) {
      if (filepath.startsWith(exports.baseFolder)) {
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
      (require.resolve && require.resolve.paths && require.resolve.paths(exports.baseFolder)) ||
      Module._nodeModulePaths(exports.baseFolder)
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
