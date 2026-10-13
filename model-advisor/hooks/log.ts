// A log of the prompts the advisor read and how their turns went, kept in the
// plugin's own store on this machine, so the weights can be calibrated on real
// prompts instead of made-up ones.

import type { LogEntry, PendingEntry, Tier } from '../types'
import { TIER_LABEL } from './assess'

/** Newest entries kept; older ones drop off. */
export const LOG_ENTRIES = 400
/** A longer prompt is cut here; `chars` keeps its full length. */
export const LOG_PROMPT_CHARS = 4_000

const TIERS: readonly Tier[] = ['trivial', 'light', 'standard', 'involved', 'deep']

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

/** Best effort, for what a prompt may carry by accident: keys, tokens, passwords. */
const SECRETS: readonly [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[secret]'],
  [/\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, '[secret]'],
  [/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{16,}/g, '[secret]'],
  [/\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g, '[secret]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[secret]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[secret]'],
  [/\bAIza[0-9A-Za-z_-]{35}/g, '[secret]'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[secret]'],
  [/(\b[a-z][\w+.-]*:\/\/[^\s:@/]+:)[^\s@/]+@/gi, '$1[secret]@'],
  [/\b((password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*)\S+/gi, '$1[secret]'],
]

export function mask(text: string): string {
  return SECRETS.reduce((t, [re, to]) => t.replace(re, to), text)
}

/** The prompt as the log keeps it: masked, then cut. */
export function logPrompt(text: string): { prompt: string; chars: number } {
  const masked = mask(text.trim())

  return { prompt: masked.slice(0, LOG_PROMPT_CHARS), chars: masked.length }
}

export function isTier(word: string): word is Tier {
  return (TIERS as readonly string[]).includes(word)
}

/** The log as the store holds it; anything else there reads as empty. */
export function entriesOf(value: unknown): LogEntry[] {
  return Array.isArray(value) ? (value as LogEntry[]) : []
}

export function appended(log: readonly LogEntry[], entry: LogEntry): LogEntry[] {
  return [...log, entry].slice(-LOG_ENTRIES)
}

export function jsonLines(log: readonly LogEntry[]): string {
  return log.map(entry => JSON.stringify(entry)).join('\n') + (log.length > 0 ? '\n' : '')
}

/** Whether the turn after a prompt ran past what its reading promised. */
const struggled = (entry: LogEntry) => entry.ended === 'error' || entry.toolErrors >= 3 || entry.didRunLong

function counts(log: readonly LogEntry[], keep: (e: LogEntry) => boolean): string {
  return TIERS.map(tier => {
    const all = log.filter(e => e.tier === tier)

    return all.length === 0 ? null : `${tier} ${all.filter(keep).length} of ${all.length}`
  })
    .filter(Boolean)
    .join(', ')
}

/** What /advise log says: how prompts were read, how their turns went, and how the labels agree. */
export function summary(log: readonly LogEntry[], isOn: boolean): string {
  const state = isOn ? 'Logging is on.' : 'Logging is off: turn it on in the config menu.'
  if (log.length === 0) return `Model advisor log: nothing logged yet. ${state}`

  const sessions = new Set(log.map(e => e.session)).size
  const readAs = TIERS.map(tier => [tier, log.filter(e => e.tier === tier).length] as const)
    .filter(([, n]) => n > 0)
    .map(([tier, n]) => `${tier} ${n}`)
    .join(', ')
  const labelled = log.filter(e => e.label !== undefined)
  const low = labelled.filter(e => TIERS.indexOf(e.label as Tier) > TIERS.indexOf(e.tier)).length
  const high = labelled.filter(e => TIERS.indexOf(e.label as Tier) < TIERS.indexOf(e.tier)).length

  return [
    `Model advisor log: ${plural(log.length, 'prompt')} from ${plural(sessions, 'session')}, newest ${LOG_ENTRIES} kept. ${state}`,
    `Read as: ${readAs}.`,
    `Turns that struggled: ${counts(log, struggled)}. A high share in a tier means it is read too low.`,
    labelled.length === 0
      ? 'No labels yet.'
      : `Your labels: ${labelled.length}; ${labelled.length - low - high} agree, ${low} read too low, ${high} read too high.`,
    '/advise label <tier> corrects the last reading. /advise export saves the log for scripts/calibrate.ts.',
  ].join('\n')
}

export function labelReply(entry: PendingEntry, label: Tier): string {
  const was = entry.tier === label ? 'as read' : `read as ${TIER_LABEL[entry.tier]}`
  const line = entry.prompt.split('\n')[0] ?? ''

  return `Labelled "${line.length > 60 ? `${line.slice(0, 59)}…` : line}" ${TIER_LABEL[label]} (${was}).`
}
