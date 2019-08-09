'use strict'

const { basename } = require('path')
const { getPrettier, getPrettierConfig } = require('../prettier-interface')
const jsonUtils = require('../json-utils')
const fs = require('fs')
const { resolve: pathResolve, dirname: pathDirname, sep: pathSep } = require('path')

const { isArray } = Array
const { keys: objectKeys, create: objectCreate, assign: objectAssign } = Object
const prettierSym = Symbol.for('️quick-prettier')

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

let linterContextes = null

function create(context) {
  if (!linterContextes) {
    patchEslintApi()
  }

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

/**
 * Patches eslint public API to support prettier fix afterwards
 */
function patchEslintApi() {
  if (!linterContextes) {
    linterContextes = []
  }

  const eslintPath = resolveCallerEslintApi(patchEslintApi)

  const eslintApi = require(eslintPath)
  if (eslintApi[prettierSym]) {
    return
  }

  eslintApi[prettierSym] = true

  function requireSourceCodeFixer() {
    try {
      return require(pathResolve(eslintPath, 'lib', 'linter', 'source-code-fixer'))
    } catch (_error) {
      return null
    }
  }

  const Linter = eslintApi.Linter
  let SourceCodeFixer

  function getSourceCodeFixer() {
    if (SourceCodeFixer === undefined) {
      SourceCodeFixer = requireSourceCodeFixer() || null
    }
    return SourceCodeFixer
  }

  let linter = (Linter && Linter.prototype) || eslintApi.linter

  const oldVerifyAndFix = linter.verifyAndFix

  const eslintRequireMap = new Map()

  class LinterContext {
    constructor(filename) {
      this.id = null
      this.filename = filename
    }

    requirePlugin(id) {
      let result = eslintRequireMap.get(id)
      if (result === undefined) {
        result = require(pathResolve(eslintPath, 'lib', 'rules', id))
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

  function verifyAndFix(code, config, options) {
    const self = Linter ? this : eslintApi.linter || this
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

  linter.verifyAndFix = verifyAndFix
}

function loadShouldFixInIde() {
  if (process.env.VSCODE_PID) {
    try {
      return fs.readFileSync('.vscode/settings.json', 'utf8').indexOf('"eslint.autoFixOnSave": true') >= 0
    } catch (_error) {}
  }
  return false
}

// ESLint suppports processors that let you extract and lint JS
// fragments within a non-JS language. In the cases where prettier
// supports the same language as a processor, we want to process
// the provided source code as javascript (as ESLint provides the
// rules with fragments of JS) instead of guessing the parser
// based off the filename. Otherwise, for instance, on a .md file we
// end up trying to run prettier over a fragment of JS using the
// markdown parser, which throws an error.
// If we can't infer the parser from from the filename, either
// because no filename was provided or because there is no parser
// found for the filename, use javascript.
// This is added to the options first, so that
// prettierRcOptions and eslintPrettierOptions can still override
// the parser.
//
// `parserBlocklist` should contain the list of prettier parser
// names for file types where:
// * Prettier supports parsing the file type
// * There is an ESLint processor that extracts JavaScript snippets
//   from the file type.
const parserBlocklist = new Set([null, 'graphql', 'markdown', 'html'])

function verifyAndFixAndPrettify(linter, linterContext, result, filename, config, options, getSourceCodeFixer) {
  const prettier = getPrettier()
  const prettierFileInfo = prettier.getFileInfo.sync(filename, { ignorePath: '.prettierignore' })

  if (prettierFileInfo.ignored) {
    return result
  }

  let parser = prettierFileInfo.parser || prettierFileInfo.inferredParser
  if (parserBlocklist.has(parser)) {
    parser = 'babylon'
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
