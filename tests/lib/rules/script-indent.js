/**
 * @author Toru Nagashima
 * @copyright 2016 Toru Nagashima. All rights reserved.
 * See LICENSE file in root directory for full license.
 */
'use strict'

const fs = require('fs')
const path = require('path')
const semver = require('semver')
const RuleTester = require('../../eslint-compat').RuleTester
const rule = require('../../../lib/rules/script-indent')

const FIXTURE_ROOT = path.resolve(__dirname, '../../fixtures/script-indent/')

/**
 * Load test patterns from fixtures.
 *
 * - Valid tests:   All codes in FIXTURE_ROOT are valid code.
 * - Invalid tests: There is an invalid test for every valid test. It removes
 *                  all indentations from the valid test and checks whether
 *                  `html-indent` rule restores the removed indentations exactly.
 *
 * If a test has some ignored line, we can't use the mechanism.
 * So `additionalValid` and `additionalInvalid` exist for asymmetry test cases.
 *
 * @param {object[]} additionalValid The array of additional valid patterns.
 * @param {object[]} additionalInvalid The array of additional invalid patterns.
 * @returns {object} The loaded patterns.
 */
function loadPatterns(additionalValid, additionalInvalid) {
  const valid = fs
    .readdirSync(FIXTURE_ROOT)
    .map((filename) => {
      const commentPattern = /^(<!--|\/\*)(.+?)(-->|\*\/)/
      const code0 = fs.readFileSync(path.join(FIXTURE_ROOT, filename), 'utf8')
      const code = code0.replace(commentPattern, `$1${filename}$3`)
      const baseObj = JSON.parse(commentPattern.exec(code0)[2])
      if ('parser' in baseObj) {
        baseObj.parser = require.resolve(baseObj.parser)
      }
      if ('languageOptions' in baseObj && 'parser' in baseObj.languageOptions) {
        baseObj.languageOptions.parser = require(baseObj.languageOptions.parser)
      }
      return Object.assign(baseObj, { code, filename })
    })
    .filter((obj) => {
      if (obj.requirements) {
        if (
          Object.entries(obj.requirements).some(([pkgName, pkgVersion]) => {
            const pkg = require(`${pkgName}/package.json`)
            return !semver.satisfies(pkg.version, pkgVersion)
          })
        ) {
          return false
        }
        delete obj.requirements
      }
      return true
    })
  const invalid = valid
    .map((pattern) => {
      const kind =
        (pattern.options && pattern.options[0]) === 'tab' ? 'tab' : 'space'
      const output = pattern.code
      const lines = output.split('\n').map((text, number) => ({
        number,
        text,
        indentSize: (/^[\t ]+/.exec(text) || [''])[0].length
      }))
      const code = lines
        .map((line) => line.text.replace(/^[\t ]+/, ''))
        .join('\n')
      const errors = lines
        .map((line) =>
          line.indentSize === 0
            ? null
            : {
                message: `Expected indentation of ${line.indentSize} ${kind}${
                  line.indentSize === 1 ? '' : 's'
                } but found 0 ${kind}s.`,
                line: line.number + 1
              }
        )
        .filter(Boolean)

      return Object.assign({}, pattern, { code, output, errors })
    })
    .filter((invalid) => invalid.errors.length > 0) // Empty errors cannot be verified with eslint 7.3.
    .filter(Boolean)

  return {
    valid: [...valid, ...additionalValid],
    invalid: [...invalid, ...additionalInvalid]
  }
}

/**
 * Prevents leading spaces in a multiline template literal from appearing in the resulting string
 * @param {string[]} strings The strings in the template literal
 * @returns {string} The template literal, with spaces removed from all lines
 */
function unIndent(strings) {
  const templateValue = strings[0]
  const lines = templateValue
    .replace(/^\n/, '')
    .replace(/\n\s*$/, '')
    .split('\n')
  const lineIndents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/ */)[0].length)
  const minLineIndent = Math.min.apply(null, lineIndents)

  return lines.map((line) => line.slice(minLineIndent)).join('\n')
}

const tester = new RuleTester({
  languageOptions: {
    parser: require('vue-eslint-parser'),
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: {
      parser: require.resolve('espree') // espree v8.0.0-beta.x
    }
  }
})

tester.run(
  'script-indent',
  rule,
  loadPatterns(
    // Valid
    [
      // TemplateLiteral
      {
        filename: 'test.vue',
        code: unIndent`
        <script>
        \`
          test
        test
          test
          \`
        </script>
      `
      },

      // Comments
      {
        filename: 'test.vue',
        code: unIndent`
        <script>
        // comment
        // comment
        foo
        </script>
      `
      },
      {
        filename: 'test.vue',
        code: unIndent`
        <script>
        /*
        * comment
        */
        message
        </script>
      `
      },
      {
        filename: 'test.vue',
        code: unIndent`
        <script>
        message
        /*
        * comment
        */
        </script>
      `
      },

      // Ignores files other than .vue
      {
        filename: 'test.js',
        code: unIndent`
        <script>
          \`
          test
        test
            test
          \`
        </script>
      `
      },

      // Ignores
      {
        filename: 'test.vue',
        code: unIndent`
        <script>
        var a
                =
          1 +
        2
        </script>
      `,
        options: [
          4,
          {
            // Ignore all :D
            ignores: ['*']
          }
        ]
      }
    ],

    // Invalid
    [
      // TemplateLiteral
      {
        filename: 'test.vue',
        code: unIndent`
        <script>
          \`
          test
        test
            test
          \`
        </script>
      `,
        output: unIndent`
        <script>
        \`
          test
        test
            test
          \`
        </script>
      `,
        options: [4],
        errors: [
          {
            message: 'Expected indentation of 0 spaces but found 2 spaces.',
            line: 2
          }
        ]
      },

      // A mix of spaces and tabs.
      {
        filename: 'test.vue',
        code: unIndent`
        <script>
        var a =
        \t1
        </script>
      `,
        output: unIndent`
        <script>
        var a =
          1
        </script>
      `,
        errors: [
          {
            message: String.raw`Expected " " character, but found "\t" character.`,
            line: 3
          }
        ]
      },
      {
        filename: 'test.vue',
        code: unIndent`
        <script>
        var obj = {
          a: 1,
          b: 2
        }
        </script>
      `,
        output: unIndent`
        <script>
        var obj = {
        \ta: 1,
        \tb: 2
        }
        </script>
      `,
        options: ['tab'],
        errors: [
          {
            message: String.raw`Expected "\t" character, but found " " character.`,
            line: 3
          },
          {
            message: String.raw`Expected "\t" character, but found " " character.`,
            line: 4
          }
        ]
      }
    ]
  )
)
