import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderElement, TurnStepInput } from 'claude-code'

type Sent = { model: string; effort: TurnStepInput['effort'] }

const BAND = {
  plugin: 'model-advisor',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

/**
 * Stands in for the engine beneath the plugin: answers the prompt, the status
 * line and each request. A request on Fable gets no response unless
 * `fableAnswers`, as for an account without usage credits; each response
 * consults the advisor `advisorCalls` times.
 */
function engine(on: On, contextTokens = 20_000, { fableAnswers = true, advisorCalls = 0 } = {}): Sent[] {
  const sent: Sent[] = []
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.status', () => ({ value: undefined }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: 'exit 1', text: 'exit 1', isError: true }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return h(Text, {}, 'the engine band') as RenderElement
  })
  on('turn.step', async function* ($, e) {
    sent.push({ model: e.model, effort: e.effort })
    if (!fableAnswers && /fable/.test(e.model)) return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }
    const serverToolUses = Array.from({ length: advisorCalls }, (_, i) => ({ id: `adv-${i}`, name: 'advisor', input: {}, startedAt: 0, endedAt: 1 }))

    return {
      ...(advisorCalls > 0 ? { serverToolUses } : {}),
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: {
        model: e.model,
        input_tokens: 500,
        output_tokens: 200,
        cache_read_input_tokens: contextTokens - 500,
        cache_creation_input_tokens: 0,
      },
    }
  })

  return sent
}

async function step($: Engine, agentId?: string, model = 'claude-opus-5-5', effort: TurnStepInput['effort'] = 'xhigh') {
  const stream = $.turn.step({ turnId: 't', index: 0, model, effort, messageCount: 1, ...(agentId ? { agentId } : {}) })
  for await (const _ of stream) {
    // drain
  }

  return stream.result
}

const submit = ($: Engine, text: string) => $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
const finish = ($: Engine) => $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: false, reason: 'answer' })
/** A tool call that fails, in the main loop or, given an id, a subagent's. */
const failingTool = ($: Engine, agentId?: string) => $.tool.call({ tool: 'Bash', command: 'npm test', ...(agentId ? { agentId } : {}) })
const advise = ($: Engine, args = '') =>
  $.command.run({ command: 'advise', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

describe('suggest', () => {
  test('a light prompt on Opus at xhigh offers Sonnet at low, and Use sends the next request on it', async ($, on) => {
    const sent = engine(on)
    await step($)
    await submit($, 'fix the typo in README.md')

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: /Sonnet 5\.5 · low would do · you're on Opus 5\.5 · xhigh/ })).toBeDefined()
      expect(await ui.find({ key: 'use' })).toBeDefined()
    }

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'use' })
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-sonnet-5-5', effort: 'low' })

    const after = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await after.find({ text: /Sending as Sonnet 5\.5 · low in place of Opus 5\.5 · xhigh/ })).toBeDefined()
    await after.press({ key: 'back' })
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })
  })

  test('suggest alone changes nothing that is sent', async ($, on) => {
    const sent = engine(on)
    await step($)
    await submit($, 'commit this and push')
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })
  })

  test("a subagent's requests are never touched", async ($, on) => {
    const sent = engine(on)
    await step($)
    await submit($, 'fix the typo in README.md')
    await (await $.ui.mount({ ...BAND, surface: 'terminal' })).press({ key: 'use' })
    await step($, 'agent-1')
    expect(sent.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })
  })

  test('the advice sits on top of the band and keeps what the other mods draw under it', async ($, on) => {
    engine(on)
    expect((await (await $.ui.mount({ ...BAND, surface: 'terminal' })).findAll({ type: 'Text' })).map(t => t.text)).toEqual(['the engine band'])

    await step($)
    await submit($, 'fix the typo in README.md')
    for (const surface of ['terminal', 'desktop'] as const) {
      const texts = (await (await $.ui.mount({ ...BAND, surface })).findAll({ type: 'Text' })).map(t => t.text)
      expect(texts[0]).toMatch(/Sonnet 5\.5 · low would do/)
      expect(texts.at(-1)).toBe('the engine band')
    }
  })

  test('on a big context a cheaper setup that does not pay for its re-cache is not offered, and /advise says why', async ($, on) => {
    engine(on, 200_000)
    await step($)
    await submit($, 'fix the typo in README.md')

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /✓ Staying on Opus 5\.5 · xhigh · a switch costs more than this light prompt saves/ })).toBeDefined()
    expect(await ui.find({ key: 'use' })).toBeUndefined()
    expect(await ui.find({ key: 'hide' })).toBeUndefined()
    expect((await advise($)).text).toMatch(/Sonnet 5\.5 · low would do it, but switching re-caches 200k tokens \(≈\$0\.46\), more than a turn like this would save/)
  })

  test('on a big context a stronger model is still offered when the re-cache is small next to the turn', { options: { fable: 'yes' } }, async ($, on) => {
    engine(on, 200_000)
    await step($)
    await submit($, 'ultrathink: there is a race condition in the ledger that only happens in production, find the root cause')

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Fable 5\.1 · high suits this better than Opus 5\.5 · xhigh/ })).toBeDefined()
    expect(await ui.find({ key: 'use' })).toBeDefined()
  })

  test('Hide puts the band away until the next prompt', async ($, on) => {
    engine(on)
    await step($)
    await submit($, 'fix the typo in README.md')
    await (await $.ui.mount({ ...BAND, surface: 'terminal' })).press({ key: 'hide' })
    expect(await (await $.ui.mount({ ...BAND, surface: 'terminal' })).find({ key: 'use' })).toBeUndefined()

    await submit($, 'run the tests')
    expect(await (await $.ui.mount({ ...BAND, surface: 'terminal' })).find({ key: 'use' })).toBeDefined()
  })
})

describe('midway', () => {
  const WORKING = { ...BAND, props: { ...BAND.props, isWorking: true }, surface: 'terminal' } as const

  test('a long run on a light prompt offers the cheaper setup, and Use applies to the next request', async ($, on) => {
    const sent = engine(on)
    await submit($, 'fix the typo in README.md')
    for (let i = 0; i < 12; i++) await step($)

    const ui = await $.ui.mount(WORKING)
    expect(await ui.find({ type: 'Text', text: /Running long: 12 requests in/ })).toBeDefined()
    await ui.press({ key: 'use' })
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-sonnet-5-5', effort: 'low' })
  })

  test('says nothing before the limit, or once the turn is not running', async ($, on) => {
    engine(on)
    await submit($, 'fix the typo in README.md')
    for (let i = 0; i < 11; i++) await step($)
    expect(await (await $.ui.mount(WORKING)).find({ text: /Running long/ })).toBeUndefined()

    await step($)
    expect(await (await $.ui.mount({ ...WORKING, props: { ...WORKING.props, isWorking: false } })).find({ text: /Running long/ })).toBeUndefined()
  })

  test('a new prompt starts the count again', async ($, on) => {
    engine(on)
    await submit($, 'fix the typo in README.md')
    for (let i = 0; i < 12; i++) await step($)
    await submit($, 'fix the typo in README.md')
    await step($)
    expect(await (await $.ui.mount(WORKING)).find({ text: /Running long/ })).toBeUndefined()
  })
})

describe('auto', () => {
  test('takes a sure, cheaper reading, keeps it for a follow-on, and goes back for a hard prompt', { options: { mode: 'auto' } }, async ($, on) => {
    const sent = engine(on)
    await step($)

    await submit($, 'commit this and push')
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-haiku-5-5', effort: 'low' })

    await submit($, 'continue')
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-haiku-5-5', effort: 'low' })

    await submit($, 'why does the queue worker deadlock under load?')
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })
  })

  test('never undoes a choice you made', { options: { mode: 'auto', fable: 'yes' } }, async ($, on) => {
    const sent = engine(on)
    await step($)
    await submit($, 'there is a race condition in the queue worker, find the root cause')
    await advise($, 'use')
    await submit($, 'commit this and push')
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-fable-5-1', effort: 'high' })
  })
})

describe('the session so far', () => {
  test('a short prompt that points back is read with the work before it', async ($, on) => {
    engine(on)
    await step($)
    await submit($, 'why does the queue worker deadlock under load?')
    await step($)
    await finish($)
    await submit($, 'add a test for it')

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Involved: Opus 5\.5 · high would do/ })).toBeDefined()
  })

  test("failing tool calls in the main loop make a struggle, and the next follow-on a tier harder; a subagent's do not count", async ($, on) => {
    engine(on)
    await step($)
    await submit($, 'fix the typo in README.md')
    await step($)
    for (let i = 0; i < 3; i++) await failingTool($)
    await failingTool($, 'agent-1')
    await finish($)
    await submit($, 'try again')

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Standard: Sonnet 5\.5 · medium would do/ })).toBeDefined()
    expect((await advise($)).text).toContain('Last turn: 1 request, 3 tool errors, harder than it read.')
  })

  test('two failing tool calls are not a struggle', async ($, on) => {
    engine(on)
    await step($)
    await submit($, 'fix the typo in README.md')
    await step($)
    for (let i = 0; i < 2; i++) await failingTool($)
    await finish($)
    await submit($, 'try again')

    expect((await advise($)).text).toContain('Last turn: 1 request, 2 tool errors.')
    expect(await (await $.ui.mount({ ...BAND, surface: 'terminal' })).find({ type: 'Text', text: /Follows on from the last prompt/ })).toBeDefined()
  })

  test('a /clear forgets the work before it', async ($, on) => {
    engine(on)
    on('session.end', ($, e) => ({ sessionId: 's' }))
    await step($)
    await submit($, 'why does the queue worker deadlock under load?')
    await step($)
    await finish($)
    await $.session.end({ reason: 'clear', sessionId: 's', resume: { id: 's' } })
    await submit($, 'add a test for it')

    expect(await (await $.ui.mount({ ...BAND, surface: 'terminal' })).find({ type: 'Text', text: /Standard: Sonnet 5\.5 · medium would do/ })).toBeDefined()
    expect((await advise($)).text).not.toContain('Last turn')
  })

  test("after a turn that ran long, auto goes back to the session's own setup, and until a turn goes as read only a chore goes cheap", { options: { mode: 'auto' } }, async ($, on) => {
    const sent = engine(on)
    await step($)
    await submit($, 'fix the typo in README.md')
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-sonnet-5-5', effort: 'low' })
    for (let i = 1; i < 12; i++) await step($)
    await finish($)

    await submit($, 'try again')
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })

    await submit($, 'fix the typo in the footer')
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })

    await submit($, 'commit this and push')
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-haiku-5-5', effort: 'low' })
  })
})

describe('the prompt log', () => {
  const LOG_ON = { options: { log: 'on' } } as const

  /** The world the log stands on, in memory: a store, a clock, a session id, and the files written. */
  function world(on: On, store: Record<string, unknown> = {}) {
    mock.store(on, store)
    mock.clock(on, { now: 1_000 })
    on('session.id', () => ({ value: 's1' }))
    const written: { path: string; text: string }[] = []
    on('fs.write', ($, e) => {
      written.push({ path: e.path, text: e.text })

      return { value: undefined }
    })

    return written
  }
  /** The log as /advise export saves it. */
  async function logOf($: Engine, written: { text: string }[]) {
    await advise($, 'export log.jsonl')
    const text = written.at(-1)?.text ?? ''

    return text.trim() === '' ? [] : text.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
  }

  test('logs each prompt with how its turn went', LOG_ON, async ($, on) => {
    const written = world(on)
    engine(on)
    await step($)
    await submit($, 'fix the typo in README.md, my key is sk-ant-api03-abcdefghijklmnopqrstuv')
    await step($)
    await step($)
    await failingTool($)
    await finish($)

    expect(await logOf($, written)).toEqual([
      {
        at: 1_000,
        session: 's1',
        prompt: 'fix the typo in README.md, my key is [secret]',
        chars: 45,
        tier: 'light',
        reasons: ['cosmetic edit', 'fixes a bug'],
        isSure: true,
        isFollowOn: false,
        mode: 'suggest',
        own: { model: 'opus', effort: 'xhigh' },
        ranOn: { model: 'opus', effort: 'xhigh' },
        chosenBy: null,
        steps: 2,
        toolErrors: 1,
        contextTokens: 20_000,
        ended: 'answer',
        didRunLong: false,
        wasHidden: false,
        advisor: null,
        advisorCalls: 0,
      },
    ])
  })

  test('records the setup you chose with Use', LOG_ON, async ($, on) => {
    const written = world(on)
    engine(on)
    await step($)
    await submit($, 'fix the typo in README.md')
    await (await $.ui.mount({ ...BAND, surface: 'terminal' })).press({ key: 'use' })
    await step($)
    await finish($)

    expect(await logOf($, written)).toEqual([expect.objectContaining({ ranOn: { model: 'sonnet', effort: 'low' }, chosenBy: 'you' })])
  })

  test('records a band you hid', LOG_ON, async ($, on) => {
    const written = world(on)
    engine(on)
    await step($)
    await submit($, 'fix the typo in README.md')
    await (await $.ui.mount({ ...BAND, surface: 'terminal' })).press({ key: 'hide' })
    await step($)
    await finish($)

    expect(await logOf($, written)).toEqual([expect.objectContaining({ wasHidden: true })])
  })

  test('/advise label corrects the last reading, and refuses a word that is not a tier', LOG_ON, async ($, on) => {
    const written = world(on)
    engine(on)
    await step($)
    await submit($, 'fix the typo in README.md')
    await step($)
    await finish($)

    expect((await advise($, 'label huge')).text).toBe('Label with a tier: trivial, light, standard, involved or deep.')
    expect((await advise($, 'label standard')).text).toBe('Labelled "fix the typo in README.md" Standard (read as Light).')
    expect(await logOf($, written)).toEqual([expect.objectContaining({ tier: 'light', label: 'standard' })])
  })

  test('/advise label during a turn labels the prompt that is running', LOG_ON, async ($, on) => {
    const written = world(on)
    engine(on)
    await step($)
    await submit($, 'fix the typo in README.md')
    await step($)
    await advise($, 'label involved')
    await finish($)

    expect(await logOf($, written)).toEqual([expect.objectContaining({ label: 'involved' })])
  })

  test('/advise log sums it up, and /advise log clear empties it', LOG_ON, async ($, on) => {
    const written = world(on)
    engine(on)
    await step($)
    await submit($, 'fix the typo in README.md')
    await step($)
    await finish($)

    expect((await advise($, 'log')).text).toContain('Model advisor log: 1 prompt from 1 session')
    expect((await advise($, 'log clear')).text).toBe('Cleared 1 logged prompt.')
    expect(await logOf($, written)).toEqual([])
  })

  test('/advise export saves JSON lines where you say, or under your home folder', async ($, on) => {
    const written = world(on, { log: [{ prompt: 'a' }, { prompt: 'b' }] })
    // Windows sets USERPROFILE and often no HOME.
    mock.env(on, { USERPROFILE: '/users/mc' })
    engine(on)

    expect((await advise($, 'export logs/advisor.jsonl')).text).toBe(
      'Saved 2 logged prompts to logs/advisor.jsonl.\nCalibrate with: npx tsx scripts/calibrate.ts logs/advisor.jsonl',
    )
    expect((await advise($, 'export')).text).toContain('to /users/mc/.claude/model-advisor-log.jsonl.')
    expect(written.map(w => w.text)).toEqual(['{"prompt":"a"}\n{"prompt":"b"}\n', '{"prompt":"a"}\n{"prompt":"b"}\n'])
    expect(written[0]?.path.endsWith('/logs/advisor.jsonl')).toBe(true)
    expect(written[1]?.path).toBe('/users/mc/.claude/model-advisor-log.jsonl')
  })

  test('"export the CSV as JSON" is a prompt to judge, not the command', async ($, on) => {
    const written = world(on)
    engine(on)

    expect((await advise($, 'export the CSV as JSON')).text).toContain('"export the CSV as JSON"')
    expect(written).toEqual([])
  })

  test("a subagent's turn is not logged", LOG_ON, async ($, on) => {
    const written = world(on)
    engine(on)
    await step($)
    await submit($, 'fix the typo in README.md')
    await $.turn.complete({ turnId: 'sub', agentId: 'agent-1', answer: '', durationMs: 1, isAborted: false, reason: 'answer' })

    expect(await logOf($, written)).toEqual([])
  })

  test('keeps nothing with the advisor off', LOG_ON, async ($, on) => {
    const written = world(on)
    engine(on)
    await step($)
    await advise($, 'off')
    await submit($, 'fix the typo in README.md')
    await step($)
    await finish($)

    expect(await logOf($, written)).toEqual([])
  })

  test('keeps nothing unless you turn it on', async ($, on) => {
    const written = world(on)
    engine(on)
    await step($)
    await submit($, 'fix the typo in README.md')
    await step($)
    await finish($)

    expect(await logOf($, written)).toEqual([])
    expect((await advise($, 'log')).text).toContain('Logging is off')
  })

  test('a log that cannot be written never stops the prompt or the advice', LOG_ON, async ($, on) => {
    const sent = engine(on)
    await step($)
    await submit($, 'fix the typo in README.md')
    await step($)
    await finish($)

    expect(sent).toHaveLength(2)
    expect(await (await $.ui.mount({ ...BAND, surface: 'terminal' })).find({ type: 'Text', text: /Sonnet 5\.5 · low would do/ })).toBeDefined()
  })
})

describe('Fable needs usage credits', () => {
  const DEEP = 'ultrathink: there is a race condition in the ledger that only happens in production, find the root cause'
  const crash = ($: Engine, reason: 'error' | 'aborted') =>
    $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: reason === 'aborted', reason })
  function toasts(on: On): string[] {
    const said: string[] = []
    on('ui.toast', ($, e) => {
      said.push(e.text)

      return { value: undefined }
    })

    return said
  }

  test('under check, a deep prompt on Sonnet is offered Opus at xhigh, not Fable, and the band says why', async ($, on) => {
    mock.store(on)
    engine(on)
    await step($, undefined, 'claude-sonnet-5-5', 'medium')
    await submit($, DEEP)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Deep: Opus 5\.5 · xhigh would be safer than Sonnet 5\.5 · medium/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Fable 5\.1 may do better, but needs usage credits/ })).toBeDefined()
    expect((await advise($, 'use')).text).toBe('Sending as Opus 5.5 · xhigh until /advise reset.')
  })

  test('a Fable request that gets no answer drops Fable, goes back to the session setup, and is remembered', { options: { fable: 'yes' } }, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 5 })
    const said = toasts(on)
    const sent = engine(on, 20_000, { fableAnswers: false })
    await step($)
    await submit($, DEEP)
    await (await $.ui.mount({ ...BAND, surface: 'terminal' })).press({ key: 'use' })
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-fable-5-1', effort: 'high' })
    await crash($, 'error')

    expect(said).toEqual(['Fable 5.1 did not answer, most likely for lack of usage credits. Back to Opus 5.5 · xhigh. /advise fable yes if you have them.'])
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })
  })

  test('under check, a failure overrules your own yes, and Fable is no longer offered', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 7 })
    toasts(on)
    const sent = engine(on, 20_000, { fableAnswers: false })
    await step($, undefined, 'claude-sonnet-5-5', 'medium')
    await advise($, 'fable yes')
    await submit($, DEEP)
    expect((await advise($, 'use')).text).toBe('Sending as Fable 5.1 · high until /advise reset.')
    await step($, undefined, 'claude-sonnet-5-5', 'medium')
    await crash($, 'error')

    expect((await advise($, 'fable')).text).toBe('Fable 5.1: not offered. A request on it got no answer. /advise fable yes to try it again.')
    await step($, undefined, 'claude-sonnet-5-5', 'medium')
    expect(sent.at(-1)).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' })
    expect(await (await $.ui.mount({ ...BAND, surface: 'terminal' })).find({ type: 'Text', text: /Deep: Opus 5\.5 · xhigh would be safer/ })).toBeDefined()
  })

  test('an interrupt on a Fable request says nothing about credits', { options: { fable: 'yes' } }, async ($, on) => {
    mock.store(on)
    const said = toasts(on)
    const sent = engine(on, 20_000, { fableAnswers: false })
    await step($)
    await submit($, DEEP)
    await advise($, 'use')
    await step($)
    await crash($, 'aborted')

    expect(said).toEqual([])
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-fable-5-1', effort: 'high' })
  })

  test('under check, after Fable failed it is no longer offered, and /advise fable yes brings it back', async ($, on) => {
    mock.store(on, { fable: { works: false, by: 'seen', at: 1 } })
    mock.clock(on, { now: 9 })
    engine(on)
    await step($, undefined, 'claude-sonnet-5-5', 'medium')
    await submit($, DEEP)
    expect((await advise($, 'fable')).text).toBe('Fable 5.1: not offered. A request on it got no answer. /advise fable yes to try it again.')

    expect((await advise($, 'fable yes')).text).toBe('Fable 5.1: offered, as you said. /advise fable check to go back to checking.')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Deep: Fable 5\.1 · high would be safer than Sonnet 5\.5 · medium/ })).toBeDefined()

    expect((await advise($, 'fable check')).text).toBe('Fable 5.1: not offered until it is seen to answer, since it needs usage credits. /advise fable yes if you have them.')
  })

  test('a session already on Fable has it, and a request on it that answers is remembered', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 3 })
    engine(on)
    await step($, undefined, 'claude-fable-5-1', 'high')
    expect((await advise($, 'fable')).text).toBe('Fable 5.1: offered. A request on it answered.')
    await step($)
    expect((await advise($, 'fable')).text).toBe('Fable 5.1: offered. A request on it answered.')
  })

  test('the fable setting no never offers it', { options: { fable: 'no' } }, async ($, on) => {
    mock.store(on)
    engine(on)
    await step($)
    await submit($, DEEP)
    expect(await (await $.ui.mount({ ...BAND, surface: 'terminal' })).find({ type: 'Text', text: /Fable 5\.1 · high/ })).toBeUndefined()
    expect((await advise($, 'fable')).text).toBe('Fable 5.1: never offered, by the fable setting. Change it in /plugin configure model-advisor@mmediavilla.')
  })
})

describe('the advisor', () => {
  test('an advisor as strong as the step up keeps the session setup, and /advise names it and counts its calls', async ($, on) => {
    mock.store(on)
    on('settings.read', () => ({ value: { advisorModel: 'opus' } }))
    engine(on, 20_000, { advisorCalls: 2 })
    await step($, undefined, 'claude-sonnet-5-5', 'medium')
    await submit($, 'refactor the billing service')

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /✓ Sonnet 5\.5 · medium fits · the Opus advisor covers the hard calls of this involved prompt/ })).toBeDefined()
    expect(await ui.find({ key: 'use' })).toBeUndefined()

    await step($, undefined, 'claude-sonnet-5-5', 'medium')
    await finish($)
    const text = (await advise($)).text
    expect(text).toContain('Advisor: Opus.')
    expect(text).toContain('Last turn: 1 request, 0 tool errors, 2 advisor calls.')
  })

  test('/advise says when the main model outranks the advisor, which Claude Code then leaves off', async ($, on) => {
    mock.store(on)
    on('settings.read', () => ({ value: { advisorModel: 'sonnet' } }))
    engine(on)
    await step($)
    await submit($, 'refactor the billing service')
    expect((await advise($)).text).toContain('Advisor: Sonnet, off while the main model is Opus 5.5, which it ranks below.')
  })

  test('CLAUDE_CODE_DISABLE_ADVISOR_TOOL turns the advisor off', async ($, on) => {
    mock.store(on)
    mock.env(on, { CLAUDE_CODE_DISABLE_ADVISOR_TOOL: '1' })
    on('settings.read', () => ({ value: { advisorModel: 'opus' } }))
    engine(on)
    await step($)
    await submit($, 'refactor the billing service')
    expect((await advise($)).text).not.toContain('Advisor:')
  })
})

describe('off', () => {
  test('sends what the session sends', { options: { mode: 'off' } }, async ($, on) => {
    const sent = engine(on)
    await step($)
    await submit($, 'commit this and push')
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })
  })
})
