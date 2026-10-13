// Release checks for the plugin, run by CI and by hand.
//
//   node scripts/release.mjs version             the plugin's version
//   node scripts/release.mjs notes [version]     the CHANGELOG section for a version, for its GitHub release
//   node scripts/release.mjs check <base-ref>    a change to the plugin must bump its version and say what changed
//
// Claude Code keeps an installed plugin by its version: a change shipped
// under a version already out never reaches the people who installed it.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const MANIFEST = 'model-advisor/.claude-plugin/plugin.json'
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/
/** Files under the plugin that ship but change nothing it does. */
const INERT = /(\.test\.ts|\.corpus\.ts)$/

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })
const versionOf = text => JSON.parse(text).version
const parts = version => (SEMVER.exec(version) ?? []).slice(1).map(Number)

function isNewer(next, was) {
  const [a, b] = [parts(next), parts(was)]
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]

  return false
}

/** The body of a version's `## [x.y.z]` section in CHANGELOG.md; null when there is none. */
export function notes(version, changelog = readFileSync('CHANGELOG.md', 'utf8')) {
  const lines = changelog.split('\n')
  const start = lines.findIndex(line => line.startsWith(`## [${version}]`))
  if (start < 0) return null
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '))
  const body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim()

  return body === '' ? null : body
}

function check(base) {
  const was = versionOf(git('show', `${base}:${MANIFEST}`))
  const now = versionOf(readFileSync(MANIFEST, 'utf8'))
  const shipped = git('diff', '--name-only', `${base}...HEAD`)
    .split('\n')
    .filter(file => file.startsWith('model-advisor/') && !INERT.test(file))
  const problems = []

  if (!SEMVER.test(now)) problems.push(`${MANIFEST} has version "${now}", which is not x.y.z.`)
  else if (now !== was) {
    if (!isNewer(now, was)) problems.push(`The version goes from ${was} to ${now}; it may only go up.`)
    if (notes(now) === null) problems.push(`CHANGELOG.md has no "## [${now}]" section saying what changed.`)
    if (git('tag', '--list', `v${now}`).trim() !== '') problems.push(`v${now} is already released; bump the version again.`)
  } else if (shipped.length > 0) {
    problems.push(
      `The plugin changed (${shipped.join(', ')}) but its version is still ${was}.`,
      `Bump "version" in ${MANIFEST} and add a CHANGELOG.md section: people who installed ${was} only get the change under a new version.`,
    )
  }

  for (const problem of problems) console.log(`::error::${problem}`)
  if (problems.length === 0) console.log(now === was ? `No plugin change; still ${now}.` : `Releases ${now} (was ${was}) once merged.`)

  return problems.length === 0
}

const [command, arg] = process.argv.slice(2)
if (command === 'version') console.log(versionOf(readFileSync(MANIFEST, 'utf8')))
else if (command === 'notes') {
  const body = notes(arg ?? versionOf(readFileSync(MANIFEST, 'utf8')))
  if (body === null) process.exit(1)
  console.log(body)
} else if (command === 'check' && arg !== undefined) process.exit(check(arg) ? 0 : 1)
else {
  console.error('Usage: node scripts/release.mjs version | notes [version] | check <base-ref>')
  process.exit(2)
}
