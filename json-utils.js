const { isArray } = Array
const { keys: objectKeys } = Object

/**
 * Compares two json objects for equality
 */
function jsonEqual(a, b) {
  if (!(a !== b)) {
    return true
  }
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false
  }
  if (isArray(a)) {
    if (!isArray(b) || a.length !== b.length) {
      return false
    }
    for (let i = 0; i < a.length; ++i) {
      if (!jsonEqual(a[i], b[i])) {
        return false
      }
    }
    return true
  }
  const keys = objectKeys(a)
  if (keys.length !== objectKeys(b).length) {
    return false
  }
  for (let i = 0; i < keys.length; ++i) {
    const key = keys[i]
    if (!jsonEqual(a[key], b[key])) {
      return false
    }
  }
  return true
}

exports.jsonEqual = jsonEqual

function sortObjectKeys(object) {
  if (typeof object !== 'object' || object === null) {
    return object
  }
  if (isArray(object)) {
    return object.slice().sort()
  }
  const result = {}
  for (const key of objectKeys(object).sort()) {
    const value = object[key]
    result[key] = isArray(value) ? value.slice() : sortObjectKeys(value)
  }
  return result
}

exports.sortObjectKeys = sortObjectKeys

function sortPackageJson(manifest) {
  if (typeof manifest !== 'object' || manifest === null || isArray(manifest)) {
    return manifest
  }
  const map = new Map()
  for (const key of exports.packageJsonSortOrder) {
    if (manifest[key] !== undefined) {
      map.set(key, manifest[key])
    }
  }
  for (const key of objectKeys(manifest)) {
    if (manifest[key] !== undefined) {
      map.set(key, manifest[key])
    }
  }

  const result = {}
  for (const [key, value] of map) {
    result[key] = value
  }
  for (const key of exports.packageJsonSortableFields) {
    if (typeof result[key] === 'object' && result[key] !== null) {
      const v = result[key]
      if (isArray(v)) {
        if (v.length === 0) {
          delete result[key]
        } else {
          v.sort()
        }
      } else {
        const sorted = sortObjectKeys(v)
        if (objectKeys(sorted).length === 0) {
          delete result[key]
        } else {
          result[key] = sorted
        }
      }
    }
  }
  return result
}

exports.sortPackageJson = sortPackageJson

exports.packageJsonSortableFields = [
  'prettier',
  'engines',
  'engineStrict',
  'bundleDependencies',
  'bundledDependencies',
  'peerDependencies',
  'dependencies',
  'devDependencies',
  'optionalDependencies'
]

exports.packageJsonSortOrder = [
  'name',
  'version',
  'private',
  'description',
  'keywords',
  'license',
  'author',
  'homepage',
  'bugs',
  'repository',
  'contributors',
  'os',
  'cpu',
  'engines',
  'engineStrict',
  'sideEffects',
  'main',
  'umd:main',
  'type',
  'types',
  'typings',
  'bin',
  'browser',
  'files',
  'directories',
  'unpkg',
  'module',
  'source',
  'jsnext:main',
  'style',
  'example',
  'examplestyle',
  'assets',
  'man',
  'workspaces',
  'scripts',
  'betterScripts',
  'husky',
  'pre-commit',
  'commitlint',
  'lint-staged',
  'config',
  'nodemonConfig',
  'browserify',
  'babel',
  'browserslist',
  'xo',
  'eslintConfig',
  'eslintIgnore',
  'stylelint',
  'jest',
  'flat',
  'resolutions',
  'preferGlobal',
  'publishConfig',
  'bundleDependencies',
  'bundledDependencies',
  'peerDependencies',
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'prettier'
]
