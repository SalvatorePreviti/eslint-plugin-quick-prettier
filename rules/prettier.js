'use strict'

const { getCallerEslintApi, getPrettier, getPrettierConfig } = require('../helpers')

const meta = {
  docs: {
    url: 'https://github.com/SalvatorePreviti/eslint-plugin-quick-prettier'
  },
  fixable: 'code'
}

let schema = undefined

const emptyObject = {}

exports.meta = meta
exports.create = create
Object.defineProperty(exports, 'schema', {
  get() {
    patchEslintApi()
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
  const linterContext = linterContextes[linterContextes.length - 1]
  if (linterContext && !linterContext.id) {
    linterContext.id = context.id
  }

  return emptyObject
}

const prettierSym = Symbol.for('️quick-prettier')

/**
 * Patches eslint public API to support prettier fix afterwards
 */
function patchEslintApi() {
  if (!linterContextes) {
    linterContextes = []
  }

  const eslintApi = getCallerEslintApi(patchEslintApi)
  if (eslintApi[prettierSym]) {
    return
  }

  eslintApi[prettierSym] = true

  const oldVerifyAndFix = eslintApi.Linter.prototype.verifyAndFix

  function verifyAndFix(code, config, options) {
    let fix, filename
    if (typeof options === 'string') {
      fix = true
      filename = options
    } else {
      fix = options.fix
      filename = options.filename
    }
    if (!fix || !filename) {
      if (!linterContextes[linterContextes.length - 1]) {
        return oldVerifyAndFix.call(this, code, config, options)
      }
      linterContextes.push(null)
      try {
        return oldVerifyAndFix.call(this, code, config, options)
      } finally {
        linterContextes.pop()
      }
    }
    const linterContext = { id: null }
    linterContextes.push(linterContext)
    try {
      const result = oldVerifyAndFix.call(this, code, config, options)
      if (linterContext.id === null) {
        return result
      }
      return verifyAndFixAndPrettify(this, linterContext, result, filename, config, options)
    } finally {
      linterContext.id = null
      linterContextes.pop()
    }
  }

  eslintApi.Linter.prototype.verifyAndFix = verifyAndFix
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

function verifyAndFixAndPrettify(linter, linterContext, result, filename, config, options) {
  const prettier = getPrettier()

  const prettierFileInfo = prettier.getFileInfo.sync(filename, { ignorePath: '.prettierignore' })

  if (prettierFileInfo.ignored) {
    return result
  }

  let parser = prettierFileInfo.parser
  if (parserBlocklist.has(parser)) {
    parser = 'babylon'
  }

  const prettierConfig = getPrettierConfig()

  let prettifiedCode
  try {
    prettifiedCode = prettier.format(result.output, {
      parser,
      ...prettierConfig,
      filepath: filename
    })
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error
    }

    // Prettier's message contains a codeframe style preview of the
    // invalid code and the line/column at which the error occured.
    // ESLint shows those pieces of information elsewhere already so
    // remove them from the message
    let message = 'Parsing error: ' + error.message
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
    result.output = prettifiedCode
    if (result.messages.length !== 0) {
      result.messages = linter.verify(prettifiedCode, config, options)
    }
  }

  return result
}
