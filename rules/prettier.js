'use strict'

const { basename } = require('path')
const { getPrettier, getPrettierConfig } = require('../prettier-interface')
const jsonUtils = require('../json-utils')
const fs = require('fs')
const { resolve: pathResolve, dirname: pathDirname, sep: pathSep } = require('path')

const { isArray } = Array
const { keys: objectKeys, create: objectCreate, assign: objectAssign } = Object

const messages = {}

const meta = {
  docs: {
    url: 'https://github.com/SalvatorePreviti/eslint-plugin-quick-prettier'
  },
  fixable: 'code',
  messages
}

let schema = [
  {
    type: 'object',
    'prettify-package-json': { type: 'boolean' },
    rules: { type: 'object' }
  }
]

exports.meta = meta

exports.create = create

Object.defineProperty(exports, 'schema', {
  get() {
    try {
      patchEslintApi()
    } catch (_error) {}
    return schema
  },
  set(value) {
    schema = value
  },
  configurable: true,
  enumerable: true
})

const linterContextes = []

function create(context) {
  const result = {}

  const linterContext = linterContextes[linterContextes.length - 1]

  if (!linterContext || linterContext.id) {
    return result
  }

  linterContext.id = context.id

  if (linterContext.filename.endsWith('.json')) {
    return result
  }

  const options = context.options
  let rules
  if (options) {
    const settings = options[0]
    if (settings) {
      linterContext.options = settings
      rules = settings.rules
    }
  }

  if (!rules) {
    return result
  }

  for (const key of objectKeys(rules)) {
    const rule = rules[key]
    const pluginContext = objectCreate(context, {
      id: { value: key },
      options: { value: isArray(rule) ? rule.slice(1) : [] }
    })

    const requiredPlugin = linterContext.requirePlugin(key)
    const plugin = requiredPlugin.create(pluginContext)
    for (const key of objectKeys(plugin)) {
      const value = plugin[key]
      if (typeof value === 'function') {
        const prev = result[key]
        if (typeof prev === 'function') {
          result[key] = (...args) => {
            prev(...args)
            return value(...args)
          }
        } else {
          result[key] = value
        }
      }
    }
  }

  return result
}

let _shouldFixInIde = undefined

const patchedEslintSet = new Set()

/**
 * Patches eslint public API to support prettier fix afterwards
 */
function patchEslintApi() {
  const eslintPath = resolveCallerEslintApi(patchEslintApi)
  //const eslintApi = require(eslintPath)
  if (patchedEslintSet.has(eslintPath)) {
    return
  }

  patchedEslintSet.add(eslintPath)

  let _legacyLinter
  function getEslintApiLegacyLinter() {
    if (_legacyLinter === undefined) {
      _legacyLinter = require(eslintPath).linter || null
    }
    return _legacyLinter
  }

  let _SourceCodeFixerClass

  function getSourceCodeFixer() {
    if (_SourceCodeFixerClass === undefined) {
      _SourceCodeFixerClass = requireSourceCodeFixer(eslintPath) || null
    }
    return _SourceCodeFixerClass
  }

  const LinterClass = requireLinterClass(eslintPath)
  let linterPrototype = (LinterClass && LinterClass.prototype) || getEslintApiLegacyLinter()

  const eslintRequireMap = new Map()

  class LinterContext {
    constructor(filename) {
      this.id = null
      this.filename = filename
    }

    requirePlugin(id) {
      let result = eslintRequireMap.get(id)
      if (result === undefined) {
        result = requirePluginRule(id, eslintPath)
        eslintRequireMap.set(id, result)
        if (result && result.meta && result.meta.messages) {
          // Add loaded plugin warning messages to this plugin meta messages
          objectAssign(messages, result.meta.messages)
        }
      }
      return result
    }
  }

  LinterContext.prototype.settings = {}

  const oldVerifyAndFix = linterPrototype.verifyAndFix

  linterPrototype.verifyAndFix = function verifyAndFix(code, config, options) {
    const self = LinterClass ? this : getEslintApiLegacyLinter() || this
    let fix, filename
    if (typeof options === 'string') {
      fix = true
      filename = options
    } else {
      fix = !!options.fix
      filename = options.filename
    }

    if (!fix && _shouldFixInIde === undefined) {
      _shouldFixInIde = loadShouldFixInIde()
    }

    if ((!fix && !_shouldFixInIde) || !filename) {
      if (!linterContextes[linterContextes.length - 1]) {
        return oldVerifyAndFix.call(self, code, config, options)
      }
      linterContextes.push(null)
      try {
        return oldVerifyAndFix.call(self, code, config, options)
      } finally {
        linterContextes.pop()
      }
    }

    const linterContext = new LinterContext(filename)
    linterContextes.push(linterContext)
    try {
      let result = oldVerifyAndFix.call(self, code, config, options)
      if (fix && linterContext.id) {
        result = verifyAndFixAndPrettify(self, linterContext, result, filename, config, options, getSourceCodeFixer)
      }
      return result
    } finally {
      linterContext.id = null
      linterContextes.pop()
    }
  }
}

function requireLinterClass(eslintPath) {
  try {
    const r = require(pathResolve(eslintPath, 'lib/linter/linter')).Linter
    if (r) {
      return r
    }
  } catch (_error) {}
  try {
    const r = require(pathResolve(eslintPath, 'lib/linter')).Linter
    if (r) {
      return r
    }
  } catch (_error) {}
  try {
    return require(eslintPath).Linter || null
  } catch (_error) {}
}

function requireSourceCodeFixer(eslintPath) {
  try {
    return require(pathResolve(eslintPath, 'lib/linter/source-code-fixer'))
  } catch (_error1) {}
  try {
    return require(pathResolve(eslintPath, 'lib/linter')).SourceCodeFixer
  } catch (_error2) {}
  return null
}

function loadShouldFixInIde() {
  if (process.env.VSCODE_PID) {
    try {
      const vsCodeSettings = fs.readFileSync('.vscode/settings.json', 'utf8')
      return (
        /fixAll.eslint"\s*\s*:\s*true/.test(vsCodeSettings) ||
        /eslint.autoFixOnSave"\s*\s*:\s*true/.test(vsCodeSettings)
      )
    } catch (_error) {}
  }
  return false
}

function verifyAndFixAndPrettify(linter, linterContext, result, filename, config, options, getSourceCodeFixer) {
  const prettier = getPrettier()
  const prettierFileInfo = prettier.getFileInfo.sync(filename, { ignorePath: '.prettierignore' })

  if (prettierFileInfo.ignored) {
    return result
  }

  let parser = prettierFileInfo.parser || prettierFileInfo.inferredParser
  if (!parser) {
    return result
  }

  const prettierConfig = getPrettierConfig()

  let prettifiedCode = result.output

  if (
    parser === 'json-stringify' &&
    filename &&
    (linterContext.settings['prettify-package-json'] ||
      linterContext.settings['prettify-package-json'] === undefined) &&
    basename(filename) === 'package.json'
  ) {
    try {
      const manifest = JSON.parse(prettifiedCode)
      if (typeof manifest === 'object' && manifest !== null && !Array.isArray(manifest)) {
        if (typeof manifest.name === 'string' && typeof manifest.version === 'string') {
          prettifiedCode = JSON.stringify(jsonUtils.sortPackageJson(manifest), null, 2)
        }
      }
    } catch (_error) {}
  }

  try {
    prettifiedCode = prettier.format(prettifiedCode, {
      parser,
      ...prettierConfig,
      filepath: filename
    })
  } catch (e) {
    if (parser === null || parser === undefined) {
      return result
    }

    const error = e instanceof Error ? e : new Error()

    // Prettier's message contains a codeframe style preview of the
    // invalid code and the line/column at which the error occured.
    // ESLint shows those pieces of information elsewhere already so
    // remove them from the message
    let message = (error instanceof SyntaxError ? 'Parsing error: ' : ' Prettier error: ') + error.message

    message += ` - parser:${parser}`

    if (error.codeFrame) {
      message = message.replace(`${error.codeFrame}`, '')
    }

    const loc = error.loc
    let line = undefined
    let column = NaN
    if (loc && loc.start && loc.start.line) {
      line = loc.start.line || undefined
      column = loc.start.column || NaN
      message = message.replace(/ \(\d+:\d+\)\s?$/, '')
    }

    result.messages.push({
      ruleId: linterContext.id,
      severity: 2,
      message,
      line,
      column,
      nodeType: null
    })

    return result
  }

  if (result.output !== prettifiedCode) {
    result.fixed = true
    let messages = linter.verify(prettifiedCode, config, options)
    if (messages.length !== 0) {
      const SourceCodeFixer = getSourceCodeFixer()
      if (SourceCodeFixer && SourceCodeFixer.applyFixes) {
        const fixedResult = SourceCodeFixer.applyFixes(prettifiedCode, messages, true)
        messages = fixedResult.messages
        prettifiedCode = fixedResult.output
      }
    }

    result.messages = messages
    result.output = prettifiedCode
  }

  return result
}

const _eslintExpectedPath = `node_modules${pathSep}eslint${pathSep}`

function resolveCallerEslintApi(callerFunction) {
  const oldPrepareStackTrace = Error.prepareStackTrace
  const oldStackTraceLimit = Error.stackTraceLimit
  let stack
  Error.stackTraceLimit = 25
  try {
    Error.prepareStackTrace = (_error, callinfos) => callinfos
    try {
      const error = new Error()
      Error.captureStackTrace(error, callerFunction)
      throw error
    } catch (error) {
      stack = error.stack
    } finally {
      Error.prepareStackTrace = oldPrepareStackTrace
    }
  } finally {
    Error.stackTraceLimit = oldStackTraceLimit
  }

  if (isArray(stack)) {
    try {
      for (const item of stack) {
        if (typeof item.getFileName === 'function') {
          const name = item.getFileName()
          if (typeof name === 'string') {
            const idx = name.lastIndexOf(_eslintExpectedPath)
            if (idx >= 0) {
              return pathResolve(name.slice(0, idx + _eslintExpectedPath.length))
            }
          }
        }
      }
    } catch (_error) {}
  }

  for (let p = module; p; p = p.parent) {
    const name = p.id
    if (typeof name === 'string') {
      const idx = name.lastIndexOf(_eslintExpectedPath)
      if (idx >= 0) {
        return pathResolve(name.slice(0, idx + _eslintExpectedPath.length))
      }
    }
  }

  return pathDirname(require.resolve('eslint/package.json'))
}

function normalizePackageName(name) {
  if (name.includes('\\')) {
    name = name.replace(/\\/gu, '/')
  }
  if (name.startsWith('@')) {
    const scopedPackageShortcutRegex = /^(@[^/]+)(?:\/(?:eslint-plugin)?)?$/u
    const scopedPackageNameRegex = /^eslint-plugin(-|$)/u
    if (scopedPackageShortcutRegex.test(name)) {
      name = name.replace(scopedPackageShortcutRegex, '$1/eslint-plugin')
    } else if (!scopedPackageNameRegex.test(name.split('/')[1])) {
      name = name.replace(/^@([^/]+)\/(.*)$/u, '@$1/eslint-plugin-$2')
    }
  }
  return name.startsWith('eslint-plugin-') ? name : `eslint-plugin-${name}`
}

function requirePluginRule(id, eslintPath) {
  if (id.indexOf('/') <= 0) {
    return require(pathResolve(eslintPath, 'lib', 'rules', id))
  }

  const n = normalizePackageName(id)
  const indexOfSlash = n.indexOf('/')

  const plugin = require(n.slice(0, indexOfSlash))
  if (!plugin || !plugin.rules) {
    throw new Error('Invalid eslint rule ' + id)
  }
  const found = plugin.rules[n.slice(indexOfSlash + 1)]
  if (!found || typeof found.create !== 'function') {
    throw new Error('Invalid eslint rule ' + id)
  }
  return found
}
