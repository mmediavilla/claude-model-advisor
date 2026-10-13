import { describe, expect, test } from 'claude-code/testing'

import type { LogEntry } from '../types'
import { appended, entriesOf, jsonLines, LOG_ENTRIES, LOG_PROMPT_CHARS, logPrompt, mask, summary } from './log'

const entry = (over: Partial<LogEntry>): LogEntry => ({
  at: 0,
  session: 's1',
  prompt: 'fix the typo in README.md',
  chars: 25,
  tier: 'light',
  reasons: ['cosmetic edit', 'fixes a bug'],
  isSure: true,
  isFollowOn: false,
  mode: 'suggest',
  own: { model: 'opus', effort: 'xhigh' },
  ranOn: { model: 'opus', effort: 'xhigh' },
  chosenBy: null,
  steps: 2,
  toolErrors: 0,
  contextTokens: 20_000,
  ended: 'answer',
  didRunLong: false,
  wasHidden: false,
  ...over,
})

describe('what the log keeps of a prompt', () => {
  test('masks keys, tokens and passwords, and leaves the words about them', () => {
    const secrets = [
      'use sk-ant-api03-abcdefghijklmnopqrstuv to call it',
      'the PAT is ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      'AWS key AKIAABCDEFGHIJKLMNOP',
      'connect to postgres://admin:hunter2@db.local/app',
      'set password: hunter2 in the env',
      'API_KEY=abc123def456',
      'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----',
    ]
    for (const text of secrets) expect(mask(text)).toContain('[secret]')
    expect(mask('connect to postgres://admin:hunter2@db.local/app')).toBe('connect to postgres://admin:[secret]@db.local/app')
    expect(mask('the token count is wrong after the password reset')).toBe('the token count is wrong after the password reset')
  })

  test('cuts a long prompt and keeps its full length', () => {
    const kept = logPrompt('x'.repeat(LOG_PROMPT_CHARS + 500))
    expect(kept.prompt).toHaveLength(LOG_PROMPT_CHARS)
    expect(kept.chars).toBe(LOG_PROMPT_CHARS + 500)
  })
})

describe('the log', () => {
  test('keeps the newest entries', () => {
    const full = Array.from({ length: LOG_ENTRIES }, (_, i) => entry({ at: i }))
    const next = appended(full, entry({ at: LOG_ENTRIES }))
    expect(next).toHaveLength(LOG_ENTRIES)
    expect(next[0]?.at).toBe(1)
    expect(next.at(-1)?.at).toBe(LOG_ENTRIES)
  })

  test('reads anything else in the store as empty', () => {
    expect(entriesOf(undefined)).toEqual([])
    expect(entriesOf({ not: 'a log' })).toEqual([])
  })

  test('saves as one JSON object a line', () => {
    const log = [entry({ at: 1 }), entry({ at: 2, label: 'standard' })]
    const lines = jsonLines(log).trimEnd().split('\n')
    expect(lines.map(line => JSON.parse(line))).toEqual(log)
    expect(jsonLines([])).toBe('')
  })

  test('sums up how prompts were read, how their turns went, and how the labels agree', () => {
    const log = [
      entry({}),
      entry({ toolErrors: 3 }),
      entry({ session: 's2', tier: 'involved', didRunLong: true, label: 'deep' }),
      entry({ session: 's2', tier: 'standard', label: 'standard' }),
      entry({ session: 's2', tier: 'deep', label: 'involved' }),
    ]
    expect(summary(log, true)).toBe(
      [
        'Model advisor log: 5 prompts from 2 sessions, newest 400 kept. Logging is on.',
        'Read as: light 2, standard 1, involved 1, deep 1.',
        'Turns that struggled: light 1 of 2, standard 0 of 1, involved 1 of 1, deep 0 of 1. A high share in a tier means it is read too low.',
        'Your labels: 3; 1 agree, 1 read too low, 1 read too high.',
        '/advise label <tier> corrects the last reading. /advise export saves the log for scripts/calibrate.ts.',
      ].join('\n'),
    )
    expect(summary([], false)).toBe('Model advisor log: nothing logged yet. Logging is off: set the log option to on in /plugin configure.')
  })
})
