import { describe, expect, test } from 'claude-code/testing'

import { advise, assess, idFor, longRunLimit, midway, modelKeyOf, switchCost } from './assess'

const tierOf = (text: string) => assess(text, null).tier

describe('reading a prompt', () => {
  test('chores and chat are trivial', () => {
    expect(tierOf('thanks!')).toBe('trivial')
    expect(tierOf('commit this and push')).toBe('trivial')
  })

  test('small edits and quick questions are light', () => {
    expect(tierOf('fix the typo in README.md')).toBe('light')
    expect(tierOf('what does useConversation do?')).toBe('light')
    expect(tierOf('run the tests')).toBe('light')
  })

  test('building a feature is standard', () => {
    expect(tierOf('add a dark mode toggle to the settings page')).toBe('standard')
  })

  test('asking why, refactoring across files, and carrying out a plan are involved', () => {
    expect(tierOf('why does the router keep picking the Secretary for Hevy prompts?')).toBe('involved')
    expect(tierOf('refactor the auth flow across all controllers, make sure nothing breaks')).toBe('involved')
    expect(tierOf('start phase 23.7')).toBe('involved')
  })

  test('a hard-to-pin bug hunted to its root is deep', () => {
    expect(tierOf('there is a race condition in the queue worker that only happens in production, find the root cause')).toBe('deep')
  })

  test('a polite request is not a quick question', () => {
    const a = assess('can you build a mod that suggests a model for each prompt?', null)
    expect(a.reasons).not.toContain('quick question')
  })

  test('a follow-on keeps the last reading', () => {
    const last = assess('refactor the auth flow across all controllers', null)
    const next = assess('continue', last)
    expect(next.isFollowOn).toBe(true)
    expect(next.tier).toBe(last.tier)
    expect(next.isSure).toBe(false)
  })

  test('a word that only starts like a follow-on is not one', () => {
    expect(assess('yarn add zod and wire it into the form', null).isFollowOn).toBe(false)
  })

  test('code in a fence is not read for keywords', () => {
    const a = assess('what is this?\n```\n// refactor across every file, race condition\n```', null)
    expect(a.reasons).not.toContain('touches many files')
    expect(a.reasons).toContain('pasted code')
  })
})

describe('comparing with what would be sent', () => {
  test('a light prompt on Opus at xhigh is cheaper on Sonnet at low, and worth the switch on a small context', () => {
    const advice = advise(assess('fix the typo in README.md', null), { model: 'opus', effort: 'xhigh' }, 20_000)
    expect(advice.kind).toBe('cheaper')
    if (advice.kind === 'fits') return
    expect(advice.isWorthIt).toBe(true)
  })

  test('a deep prompt on Sonnet at low says a stronger setup would be safer', () => {
    const a = assess('there is a race condition in the queue worker that only happens in production, find the root cause', null)
    expect(advise(a, { model: 'sonnet', effort: 'low' }, 20_000).kind).toBe('stronger')
  })

  test('an unknown effort compares on the model alone, and claims no saving', () => {
    const advice = advise(assess('fix the typo in README.md', null), { model: 'opus', effort: null }, 20_000)
    expect(advice.kind).toBe('cheaper')
    if (advice.kind === 'fits') return
    expect(advice.costNow).toBeNull()
    expect(advice.isWorthIt).toBe(false)
  })

  test('the re-cache grows with the conversation', () => {
    expect(switchCost({ model: 'sonnet', effort: 'low' }, 200_000)).toBeGreaterThan(switchCost({ model: 'sonnet', effort: 'low' }, 20_000))
  })
})

describe('model ids', () => {
  test('a family is read off any spelling of its id', () => {
    expect(modelKeyOf('claude-opus-5-5[1m]')).toBe('opus')
    expect(modelKeyOf('Sonnet 5.5')).toBe('sonnet')
    expect(modelKeyOf('claude-mythos-5-1')).toBe('fable')
    expect(modelKeyOf('gpt-5')).toBeNull()
  })

  test('a context suffix on the session id is kept on the id sent', () => {
    expect(idFor('sonnet', 'claude-opus-5-5[1m]')).toBe('claude-sonnet-5-5[1m]')
    expect(idFor('haiku', 'claude-opus-5-5')).toBe('claude-haiku-5-5')
  })
})

describe('a run that goes long', () => {
  const light = assess('fix the typo in README.md', null)
  const standard = assess('add a dark mode toggle to the settings page', null)

  test('says nothing until the prompt has been outrun', () => {
    expect(longRunLimit('light', 20_000)).toBe(12)
    expect(longRunLimit('standard', 20_000)).toBe(18)
    expect(midway(light, { model: 'opus', effort: 'xhigh' }, 11, 20_000)).toBeNull()
  })

  test('a long run on a dearer model than the prompt needed offers the cheaper setup, if it pays', () => {
    const m = midway(light, { model: 'opus', effort: 'xhigh' }, 12, 20_000)
    expect(m?.kind).toBe('cheaper')
    expect(m?.rec).toEqual({ model: 'sonnet', effort: 'low' })
    expect(m?.saving).toBeGreaterThan(0)
  })

  test('a long run on a weaker model than the next tier up offers that tier', () => {
    const m = midway(standard, { model: 'sonnet', effort: 'medium' }, 18, 20_000)
    expect(m?.kind).toBe('stronger')
    expect(m?.rec).toEqual({ model: 'opus', effort: 'high' })
  })

  test('a heavy context makes a run long sooner, and alone it only says so', () => {
    expect(longRunLimit('light', 200_000)).toBe(6)
    expect(midway(light, { model: 'sonnet', effort: 'low' }, 6, 20_000)).toBeNull()
    const m = midway(light, { model: 'sonnet', effort: 'low' }, 6, 200_000)
    expect(m?.kind).toBe('stay')
    expect(m?.rec).toBeNull()
  })

  test('knows nothing when the session model is unknown', () => {
    expect(midway(light, null, 50, 20_000)).toBeNull()
  })
})
