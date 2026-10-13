import { describe, expect, test } from 'claude-code/testing'

import type { Tier } from '../types'
import { assess, EFFORTS, RECOMMENDED, turnCost } from './assess'
import { CASES, FOLLOW_ONS, FRESH, HOLDOUT, MISREADS } from './assess.corpus'

const TIERS: readonly Tier[] = ['trivial', 'light', 'standard', 'involved', 'deep']
const RANK = { haiku: 0, sonnet: 1, opus: 2, fable: 3 } as const
const ALL = [...CASES, ...HOLDOUT, ...FRESH]

describe('the labelled corpus', () => {
  test('reads each prompt as labelled, but for the misreads on record', () => {
    const found: Record<string, Tier> = {}
    for (const c of ALL) {
      const tier = assess(c.prompt, null).tier
      if (tier !== c.tier) found[c.prompt] = tier
    }
    expect(found).toEqual(MISREADS)
  })

  test('no prompt auto would act on reads two tiers cheaper than its label', () => {
    const tooCheap = ALL.filter(c => {
      const a = assess(c.prompt, null)

      return a.isSure && TIERS.indexOf(a.tier) <= TIERS.indexOf(c.tier) - 2
    })
    expect(tooCheap.map(c => c.prompt)).toEqual([])
  })

  test('a follow-on or a correction carries the last reading; a new instruction does not', () => {
    const got = FOLLOW_ONS.map(f => {
      const a = assess(f.prompt, assess(f.after, null))

      return [f.prompt, a.tier, a.isFollowOn]
    })
    expect(got).toEqual(FOLLOW_ONS.map(f => [f.prompt, f.tier, f.isFollowOn]))
  })
})

describe('words that are not the ask', () => {
  test('quoted text is not read as an instruction', () => {
    expect(assess("why is the advisor reading 'start next phase' as light?", null).reasons).not.toContain('carries out a plan')
    expect(assess('the build is failing with "Cannot find module zod", fix it', null).reasons).not.toContain('new feature')
  })

  test('an apostrophe is not a quote', () => {
    expect(assess("it doesn't save and the form's broken", null).reasons).toContain('fixes a bug')
  })

  test('a path is not read for keywords', () => {
    expect(assess('create a branch called feature/advisor-calibration', null).reasons).not.toContain('new feature')
  })

  test('"make sure" is care, not building', () => {
    expect(assess('make sure the tests pass', null).reasons).not.toContain('builds something')
  })

  test('a command that is the job of what is built is not a chore', () => {
    expect(assess('set up GitHub Actions to run the tests on every PR', null).reasons).not.toContain('runs a command')
    expect(assess('commit this, then run the tests', null).reasons).toContain('runs a command')
  })

  test('a small change is not a stack swap, and stale branches are not a stale-data bug', () => {
    const small = ['switch the timeout to 30 seconds', 'convert the dates from UTC to Manila time', 'switch the export from CSV to JSON', 'remove stale branches']
    expect(small.map(p => [p, assess(p, null).tier])).toEqual(small.map(p => [p, 'light']))
    expect(assess('move the app from MySQL to Postgres', null).reasons).toContain('swaps the stack')
  })

  test('asking why is never a quick question', () => {
    expect(assess("what's causing the N+1 queries on the orders page?", null).reasons).not.toContain('quick question')
  })

  test('asking for deep thinking is honoured on its own', () => {
    expect(assess('ultrathink about how to make the advisor learn from past sessions', null).tier).toBe('deep')
  })
})

describe('odd input', () => {
  test('reads anything without throwing', () => {
    const odd = ['', '   ', '```', '```\nconst x = 1', '🙂', "'", '"unclosed', '/', 'a/b/c', '\n\n\n', 'ok '.repeat(500)]
    for (const text of odd) expect(TIERS).toContain(assess(text, null).tier)
  })

  test('a very long prompt reads quickly, since the band reads every keystroke', () => {
    const long = 'refactor the auth flow across all controllers, make sure nothing breaks when users log in. '.repeat(1_200)
    const start = Date.now()
    assess(long, null)
    expect(Date.now() - start).toBeLessThan(250)
  })
})

describe('calibration', () => {
  test('each tier up gets a setup at least as strong, and dearer', () => {
    let below: Tier | null = null
    for (const tier of TIERS) {
      if (below !== null) {
        const lower = RECOMMENDED[below]
        const upper = RECOMMENDED[tier]
        expect(RANK[upper.model]).toBeGreaterThanOrEqual(RANK[lower.model])
        if (upper.model === lower.model) expect(EFFORTS.indexOf(upper.effort)).toBeGreaterThan(EFFORTS.indexOf(lower.effort))
        expect(turnCost(upper, tier, 50_000)).toBeGreaterThan(turnCost(lower, below, 50_000))
      }
      below = tier
    }
  })
})
