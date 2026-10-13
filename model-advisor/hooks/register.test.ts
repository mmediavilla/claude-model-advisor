import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderElement, TurnStepInput } from 'claude-code'

type Sent = { model: string; effort: TurnStepInput['effort'] }

const BAND = {
  plugin: 'model-advisor',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

/** Stands in for the engine beneath the plugin: answers the prompt, the status line and each request. */
function engine(on: On, contextTokens = 20_000): Sent[] {
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

    return {
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

async function step($: Engine, agentId?: string) {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', effort: 'xhigh', messageCount: 1, ...(agentId ? { agentId } : {}) })
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

  test('never undoes a choice you made', { options: { mode: 'auto' } }, async ($, on) => {
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

describe('off', () => {
  test('sends what the session sends', { options: { mode: 'off' } }, async ($, on) => {
    const sent = engine(on)
    await step($)
    await submit($, 'commit this and push')
    await step($)
    expect(sent.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })
  })
})
