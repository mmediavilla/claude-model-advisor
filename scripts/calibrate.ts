// Replays an exported prompt log (/advise export) through the advisor as it
// reads prompts now, and says where it disagrees with your labels and with how
// the turns went.
//
//   npx tsx scripts/calibrate.ts <log.jsonl>            the report
//   npx tsx scripts/calibrate.ts <log.jsonl> --corpus   labelled prompts as assess.corpus.ts lines

import { readFileSync } from 'node:fs'

import type { Assessment, LastTurn, LogEntry, Tier } from '../model-advisor/types/index.d.ts'
import { assess, struggleOf } from '../model-advisor/hooks/assess.ts'

const TIERS: readonly Tier[] = ['trivial', 'light', 'standard', 'involved', 'deep']
const rank = (tier: Tier) => TIERS.indexOf(tier)
const pct = (n: number, of: number) => (of === 0 ? '-' : `${Math.round((100 * n) / of)}%`)
const line = (text: string) => JSON.stringify(text.split('\n')[0]?.slice(0, 90) ?? '')

type Replayed = { entry: LogEntry; now: Assessment; struggled: boolean }

/** Each session's prompts in the order sent, each read after the one before it and the turn that followed. */
function replay(log: readonly LogEntry[]): Replayed[] {
  const sessions = new Map<string, LogEntry[]>()
  for (const entry of log) sessions.set(entry.session, [...(sessions.get(entry.session) ?? []), entry])

  return [...sessions.values()].flatMap(entries => {
    let previous: Assessment | null = null
    let last: LastTurn | null = null

    return [...entries]
      .sort((a, b) => a.at - b.at)
      .map(entry => {
        const now = assess(entry.prompt, previous, last)
        last = { tier: now.tier, steps: entry.steps, toolErrors: entry.toolErrors, contextTokens: entry.contextTokens, ended: entry.ended }
        previous = now

        return { entry, now, struggled: struggleOf(last) !== null }
      })
  })
}

function report(rows: readonly Replayed[]): string[] {
  const out: string[] = []
  const sessions = new Set(rows.map(r => r.entry.session)).size
  const labelled = rows.filter(r => r.entry.label !== undefined)
  const cut = rows.filter(r => r.entry.chars > r.entry.prompt.length).length
  out.push(`${rows.length} prompts from ${sessions} sessions; ${labelled.length} labelled${cut > 0 ? `; ${cut} cut short in the log, so size signals may read lower` : ''}.`)

  const moved = rows.filter(r => r.now.tier !== r.entry.tier)
  out.push('', `Read differently now than when logged: ${moved.length}.`)
  for (const r of moved.slice(0, 20)) out.push(`  ${r.entry.tier} → ${r.now.tier}  ${line(r.entry.prompt)}`)

  if (labelled.length > 0) {
    const exact = labelled.filter(r => r.now.tier === r.entry.label).length
    const near = labelled.filter(r => Math.abs(rank(r.now.tier) - rank(r.entry.label as Tier)) <= 1).length
    const low = labelled.filter(r => rank(r.now.tier) < rank(r.entry.label as Tier)).length
    out.push('', `Against your labels: exact ${pct(exact, labelled.length)}, within one tier ${pct(near, labelled.length)}; ${low} read too low, ${labelled.length - exact - low} too high.`)
    out.push(`  ${'label \\ read'.padEnd(12)}${TIERS.map(t => t.padStart(9)).join('')}`)
    for (const label of TIERS) {
      const of = labelled.filter(r => r.entry.label === label)
      if (of.length > 0) out.push(`  ${label.padEnd(12)}${TIERS.map(t => String(of.filter(r => r.now.tier === t).length).padStart(9)).join('')}`)
    }
    for (const r of labelled.filter(r => r.now.tier !== r.entry.label)) {
      out.push(`  labelled ${r.entry.label}, read ${r.now.tier}  ${line(r.entry.prompt)}  [${r.now.reasons.join(', ')}]`)
    }
  }

  out.push('', 'Turns that struggled (ran long, 3+ tool errors, or an error), by how the prompt reads now:')
  for (const tier of TIERS) {
    const of = rows.filter(r => r.now.tier === tier)
    if (of.length > 0) out.push(`  ${tier.padEnd(9)} ${pct(of.filter(r => r.struggled).length, of.length).padStart(4)} of ${of.length}`)
  }
  const suspects = rows.filter(r => r.struggled && r.entry.label === undefined && rank(r.now.tier) <= rank('standard'))
  if (suspects.length > 0) {
    out.push('', `Read low but struggled, and not labelled yet: ${suspects.length}. Worth a label.`)
    for (const r of suspects.slice(0, 20)) out.push(`  ${r.now.tier.padEnd(9)} ${r.entry.steps} requests, ${r.entry.toolErrors} tool errors  ${line(r.entry.prompt)}`)
  }

  return out
}

/** Labelled prompts that read on their own, as lines for CASES in assess.corpus.ts. */
function corpus(rows: readonly Replayed[]): string[] {
  return rows
    .filter(r => r.entry.label !== undefined && !r.now.reasons.includes('refers back to the last prompt') && !r.entry.isFollowOn)
    .sort((a, b) => rank(a.entry.label as Tier) - rank(b.entry.label as Tier))
    .map(r => `  { prompt: ${JSON.stringify(r.entry.prompt)}, tier: '${r.entry.label}' },`)
}

const [path, flag] = process.argv.slice(2)
if (path === undefined) {
  console.error('Usage: npx tsx scripts/calibrate.ts <log.jsonl> [--corpus]')
  process.exit(1)
}
const log = readFileSync(path, 'utf8')
  .split('\n')
  .filter(text => text.trim() !== '')
  .map(text => JSON.parse(text) as LogEntry)
const rows = replay(log)
console.log((flag === '--corpus' ? corpus(rows) : report(rows)).join('\n'))
