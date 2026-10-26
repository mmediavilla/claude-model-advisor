import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Assessment, FableKnown, FableOption, LastTurn, LogEntry, Mode, PendingEntry, Reach, SessionSetup, Setup } from '../types'
import {
  advise,
  advisorFor,
  assess,
  effortOf,
  familyLabel,
  idFor,
  kTokens,
  longRunLimit,
  midway,
  MODELS,
  modelKeyOf,
  reachable,
  reachOf,
  setupLabel,
  struggleOf,
  TIER_LABEL,
} from './assess'
import type { Current } from './assess'
import { appended, entriesOf, isTier, jsonLines, labelReply, logPrompt, summary } from './log'
import { midwayVerdict, verdict } from './words'

const sent = atom({ plugin: 'model-advisor', key: 'sent' } as const, null)
const draft = atom({ plugin: 'model-advisor', key: 'draft' } as const, null)
const override = atom({ plugin: 'model-advisor', key: 'override' } as const, null)
const session = atom({ plugin: 'model-advisor', key: 'session' } as const, null)
const contextTokens = atom({ plugin: 'model-advisor', key: 'contextTokens' } as const, 0)
const sessionMode = atom({ plugin: 'model-advisor', key: 'mode' } as const, null)
const isHidden = atom({ plugin: 'model-advisor', key: 'isHidden' } as const, false)
const run = atom({ plugin: 'model-advisor', key: 'run' } as const, { turnId: null, steps: 0, toolErrors: 0 })
const lastTurn = atom({ plugin: 'model-advisor', key: 'lastTurn' } as const, null)
const pending = atom({ plugin: 'model-advisor', key: 'pending' } as const, null)
// Until the settings are read, Fable is out of reach: offering it to an account without usage credits breaks the next request.
const reach = atom({ plugin: 'model-advisor', key: 'reach' } as const, { fable: false, advisor: null })

/** The store key the log is kept under. */
const LOG = 'log'
/** The store key for whether Fable answers on this account: credits are the account's, so it outlives the session. */
const FABLE = 'fable'
const FABLE_OPTIONS: readonly FableOption[] = ['check', 'yes', 'no']

/** Prompts a person wrote; a notification, a routine or a plugin's prompt is not judged. */
const PEOPLE = new Set(['composer', 'bridge', 'sdk'])
const MODES: readonly Mode[] = ['suggest', 'auto', 'off']

type $ = EngineInterface

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

async function modeOf($: $, configured: Mode): Promise<Mode> {
  return (await read($, sessionMode)) ?? configured
}

/** What the session itself sends; null until a request or `/model` names a family the advisor prices. */
async function ownOf($: $): Promise<Current | null> {
  const own = await read($, session)
  const model = own === null ? null : modelKeyOf(own.model)

  return model === null || own === null ? null : { model, effort: own.effort }
}

/** What would be sent now: the advisor's override, else the session's own setup. */
async function currentOf($: $): Promise<Current | null> {
  const chosen = await read($, override)

  return chosen === null ? ownOf($) : { model: chosen.model, effort: chosen.effort }
}

function isFableKnown(value: unknown): value is FableKnown {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>

  return typeof v.works === 'boolean' && (v.by === 'you' || v.by === 'seen') && typeof v.at === 'number'
}

async function knownOf($: $): Promise<FableKnown | null> {
  const value = await $.store.get(FABLE).catch(() => undefined)

  return isFableKnown(value) ? value : null
}

const isSet = (value: string | undefined) => value !== undefined && value !== '' && value !== '0' && value.toLowerCase() !== 'false'

/** Reads the settings, the environment and what is known of Fable into what is in reach; redraws only on a change. */
async function refreshReach($: $, option: FableOption): Promise<Reach> {
  const settings = await $.settings.read().catch(() => ({}) as Record<string, unknown>)
  const own = await read($, session)
  const isAdvisorOff =
    isSet(await $.env.get('CLAUDE_CODE_DISABLE_ADVISOR_TOOL').catch(() => undefined)) ||
    isSet(await $.env.get('DISABLE_TELEMETRY').catch(() => undefined))
  const now = reachOf({
    option,
    known: await knownOf($),
    own: own === null ? null : modelKeyOf(own.model),
    advisorModel: settings.advisorModel,
    availableModels: settings.availableModels,
    isAdvisorOff,
  })
  const was = await read($, reach)
  if (was.fable !== now.fable || was.advisor !== now.advisor) await update($, reach, () => now)

  return now
}

/**
 * Keeps what a request on Fable showed. A failure is news whoever said Fable
 * works; an answer does not overrule your own no.
 */
async function learnFable($: $, works: boolean) {
  const known = await knownOf($)
  if (known?.works === works || (works && known?.by === 'you')) return
  // Like the log, a side line: whatever fails here, the request and the turn go on.
  const at = await $.clock.now().catch(() => 0)
  await $.store.set(FABLE, { works, by: 'seen', at }).catch(() => undefined)
}

/** What /advise fable says: whether Fable is offered, and who decided. */
function fableStatus(r: Reach, option: FableOption, known: FableKnown | null): string {
  const label = MODELS.fable.label
  if (option !== 'check') {
    const blocked = option === 'yes' && !r.fable ? ", but your organization's model list leaves it out" : ''

    return `${label}: ${option === 'yes' ? 'offered' : 'never offered'}, by the fable setting${blocked}. Change it in /plugin configure model-advisor@mmediavilla.`
  }
  if (known?.works === true && !r.fable) return `${label}: not offered. Your organization's model list leaves it out.`
  if (known === null) return r.fable ? `${label}: offered. This session runs on it.` : `${label}: not offered until it is seen to answer, since it needs usage credits. /advise fable yes if you have them.`
  if (known.by === 'you') return `${label}: ${known.works ? 'offered' : 'not offered'}, as you said. /advise fable check to go back to checking.`

  return known.works ? `${label}: offered. A request on it answered.` : `${label}: not offered. A request on it got no answer. /advise fable yes to try it again.`
}

async function syncStatus($: $) {
  const chosen = await read($, override)
  $.ui.status(chosen === null ? undefined : `advisor: ${setupLabel(chosen.model, chosen.effort)}${chosen.by === 'auto' ? ' (auto)' : ''}`)
}

async function choose($: $, setup: Setup | null, by: 'you' | 'auto') {
  await update($, override, () => (setup === null ? null : { ...setup, by }))
  await syncStatus($)
}

/**
 * Auto goes cheaper only when the reading is sure, the prompt says what the
 * work is, and the rough saving beats the re-cache; anything else runs on
 * the session's own setup. It never goes above it, and never undoes a
 * choice you made yourself. A follow-on keeps whatever the last prompt ran
 * on, unless the last turn struggled. After a turn that struggled, only a
 * chore goes cheaper.
 */
async function autoChoose($: $, a: Assessment) {
  const chosen = await read($, override)
  if (chosen?.by === 'you' || a.isFollowOn) return
  const struggle = struggleOf(await read($, lastTurn))
  const own = await ownOf($)
  if (own === null) return

  const advice = advise(a, own, await read($, contextTokens), await read($, reach))
  const rec = advice.kind === 'fits' ? a.setup : advice.rec
  const isThereAlready = chosen !== null && chosen.model === rec.model && chosen.effort === rec.effort
  const isHeld = struggle !== null && a.tier !== 'trivial'
  const isTaken = !isHeld && advice.kind === 'cheaper' && a.isSure && (isThereAlready || advice.isWorthIt)
  if (isTaken ? isThereAlready : chosen === null) return
  await choose($, isTaken ? rec : null, 'auto')
}

/** Holds a person's prompt as read until its turn ends and says how it went. */
async function hold($: $, a: Assessment, text: string, mode: Mode) {
  const entry: PendingEntry = {
    at: await $.clock.now(),
    session: await $.session.id(),
    ...logPrompt(text),
    tier: a.tier,
    reasons: a.reasons,
    isSure: a.isSure,
    isFollowOn: a.isFollowOn,
    mode,
    own: await ownOf($),
  }
  await update($, pending, () => entry)
}

/** Logs a held prompt with how its turn went, keeping the newest entries. */
async function logTurn($: $, held: PendingEntry, ended: LastTurn['ended']) {
  const r = await read($, run)
  const context = await read($, contextTokens)
  const chosen = await read($, override)
  const entry: LogEntry = {
    ...held,
    ranOn: chosen === null ? await ownOf($) : { model: chosen.model, effort: chosen.effort },
    chosenBy: chosen?.by ?? null,
    steps: r.steps,
    toolErrors: r.toolErrors,
    contextTokens: context,
    ended,
    didRunLong: r.steps >= longRunLimit(held.tier, context),
    wasHidden: await read($, isHidden),
    advisor: (await read($, reach)).advisor,
    advisorCalls: r.advisorCalls ?? 0,
  }
  await $.store.set(LOG, appended(entriesOf(await $.store.get(LOG)), entry))
}

export const register: Register = (on, options) => {
  const configured: Mode = MODES.includes(options.mode as Mode) ? (options.mode as Mode) : 'suggest'
  // The log is opt in: nobody finds their prompts kept without having asked.
  const isLogging = options.log === 'on'
  const fableOption: FableOption = FABLE_OPTIONS.includes(options.fable as FableOption) ? (options.fable as FableOption) : 'check'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'advise',
      description: 'Model advisor: judge a prompt without sending it; set suggest, auto, off, use, reset; fable yes, no or check; or log, label, export',
      argumentHint: '[prompt | suggest | auto | off | use | reset | fable [yes | no | check] | log | label <tier> | export [path]]',
    })

    if ((await read($, session)) === null) {
      const model = await $.session.model()
      const rows = await $.config.list().catch(() => [])
      const effort = effortOf(rows.find(row => /effort/i.test(row.key))?.value)
      await update($, session, () => ({ model, effort }))
    }
    await refreshReach($, fableOption)
    await syncStatus($)

    return next(e)
  })

  // A /clear starts a fresh conversation: nothing before it says anything about the next prompt.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, sent, () => null)
      await update($, draft, () => null)
      await update($, lastTurn, () => null)
      await update($, pending, () => null)
    }

    return next(e)
  })

  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    if ((await modeOf($, configured)) === 'off') return box

    const text = box.text.trim()
    const was = await read($, draft)
    if (text.length === 0 || text.startsWith('/')) {
      if (was !== null) await update($, draft, () => null)

      return box
    }

    const a = assess(text, await read($, sent), await read($, lastTurn))
    const isSame = was !== null && was.tier === a.tier && was.isFollowOn === a.isFollowOn && was.reasons.join() === a.reasons.join()
    if (!isSame) await update($, draft, () => a)

    return box
  })

  on('prompt.submit', async ($, e, next) => {
    const mode = await modeOf($, configured)
    if (mode === 'off' || !PEOPLE.has(e.origin.kind) || e.text.trim().startsWith('/')) return next(e)

    const a = assess(e.text, await read($, sent), await read($, lastTurn))
    await update($, sent, () => a)
    await update($, draft, () => null)
    await update($, isHidden, () => false)
    await update($, run, () => ({ turnId: null, steps: 0, toolErrors: 0 }))
    await update($, pending, () => null)
    // /advisor and /model fable change the settings mid-session, so each prompt reads them afresh.
    await refreshReach($, fableOption)
    if (mode === 'auto') await autoChoose($, a)
    // The log is a side line: whatever fails there, the advice and the prompt go on.
    if (isLogging) await hold($, a, e.text, mode).catch(() => undefined)

    return next(e)
  })

  // The main loop's requests only: a subagent runs on the model its definition names.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)

    await update($, run, r => (r.turnId === e.turnId ? { ...r, steps: r.steps + 1 } : { turnId: e.turnId, steps: 1, toolErrors: 0 }))

    const own: SessionSetup = { model: e.model, effort: effortOf(e.effort) }
    const was = await read($, session)
    if (was === null || was.model !== own.model || was.effort !== own.effort) await update($, session, () => own)

    const chosen = (await modeOf($, configured)) === 'off' ? null : await read($, override)
    const model = chosen === null ? e.model : idFor(chosen.model, e.model)
    const result = yield* next(chosen === null ? e : { ...e, model, effort: chosen.effort })

    // A request on Fable that got no response may be an account without usage credits; the turn's end says whether it was an error.
    const isFable = modelKeyOf(model) === 'fable'
    const isUnanswered = isFable && result.usage === null
    const advisorCalls = (result.serverToolUses ?? []).filter(use => use.name === 'advisor').length
    if (advisorCalls > 0 || isUnanswered) {
      await update($, run, r => ({ ...r, advisorCalls: (r.advisorCalls ?? 0) + advisorCalls, fableFailed: r.fableFailed === true || isUnanswered }))
    }
    if (isFable && result.usage !== null && modelKeyOf(result.usage.model) === 'fable') await learnFable($, true)

    const usage = result.usage
    if (usage !== null) {
      const tokens = usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
      if (Math.abs(tokens - (await read($, contextTokens))) >= 1_000) await update($, contextTokens, () => tokens)
    }

    return result
  })

  // Failing commands and tests, edits that missed: how hard the turn is going, read off the main loop's tools.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && result.isError === true && (await modeOf($, configured)) !== 'off') {
      await update($, run, r => ({ ...r, toolErrors: r.toolErrors + 1 }))
    }

    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const a = await read($, sent)
    const mode = await modeOf($, configured)
    if (e.agentId === undefined && a !== null && mode !== 'off') {
      const r = await read($, run)
      const context = await read($, contextTokens)
      await update($, lastTurn, () => ({
        tier: a.tier,
        steps: r.steps,
        toolErrors: r.toolErrors,
        contextTokens: context,
        ended: e.reason,
        advisorCalls: r.advisorCalls ?? 0,
      }))
    }
    // An interrupt also leaves a request unanswered; only an error ending the turn says Fable would not answer.
    if (e.agentId === undefined && e.reason === 'error' && (await read($, run)).fableFailed === true) {
      await learnFable($, false)
      await refreshReach($, fableOption)
      const chosen = await read($, override)
      const own = await ownOf($)
      if (chosen?.model === 'fable') await choose($, null, 'auto')
      if (mode !== 'off') {
        const back = chosen?.model === 'fable' && own !== null ? ` Back to ${setupLabel(own.model, own.effort)}.` : ''
        await $.ui.toast(`${MODELS.fable.label} did not answer, most likely for lack of usage credits.${back} /advise fable yes if you have them.`)
      }
    }
    const held = e.agentId === undefined ? await read($, pending) : null
    if (held !== null) {
      await update($, pending, () => null)
      await logTurn($, held, e.reason).catch(() => undefined)
    }

    return next(e)
  })

  on('command.run', { command: 'advise' }, async ($, e) => {
    const arg = e.args.trim()
    const word = arg.toLowerCase()

    if (word === 'suggest' || word === 'auto' || word === 'off') {
      await update($, sessionMode, () => word)
      if (word === 'off') await choose($, null, 'you')

      return { text: `Model advisor: ${word} for this session.` }
    }
    if (word === 'reset') {
      await choose($, null, 'you')
      const own = await ownOf($)

      return { text: `Back to the session's own setup${own === null ? '' : `, ${setupLabel(own.model, own.effort)}`}.` }
    }
    const fable = word.match(/^fable(?:\s+(yes|no|check))?$/)
    if (fable !== null) {
      const said = fable[1]
      if (said === 'yes' || said === 'no') await $.store.set(FABLE, { works: said === 'yes', by: 'you', at: await $.clock.now() })
      if (said === 'check') await $.store.delete(FABLE)
      const r = await refreshReach($, fableOption)
      if (!r.fable && (await read($, override))?.model === 'fable') await choose($, null, 'you')

      return { text: fableStatus(r, fableOption, await knownOf($)) }
    }
    if (word === 'log') return { text: summary(entriesOf(await $.store.get(LOG)), isLogging) }
    if (word === 'log clear') {
      const n = entriesOf(await $.store.get(LOG)).length
      await $.store.delete(LOG)

      return { text: `Cleared ${count(n, 'logged prompt')}.` }
    }
    const label = word.match(/^label\s+(\S+)$/)?.[1]
    if (label !== undefined) {
      if (!isTier(label)) return { text: 'Label with a tier: trivial, light, standard, involved or deep.' }
      const held = await read($, pending)
      if (held !== null) {
        await update($, pending, () => ({ ...held, label }))

        return { text: labelReply(held, label) }
      }
      const log = entriesOf(await $.store.get(LOG))
      const last = log.at(-1)
      if (last === undefined) return { text: 'Nothing logged to label yet.' }
      await $.store.set(LOG, [...log.slice(0, -1), { ...last, label }])

      return { text: labelReply(last, label) }
    }
    // "export the CSV as JSON" is a prompt to judge; a bare export, or one naming a path, is the command.
    const exported = arg.match(/^export(?:\s+(.+))?$/i)
    const named = exported?.[1]?.trim()
    if (exported !== null && (named === undefined || /[\\/]|\.jsonl?$/i.test(named))) {
      const home = named === undefined ? ((await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))) : undefined
      const path = named ?? (home === undefined ? null : `${home}/.claude/model-advisor-log.jsonl`)
      if (path === null) return { text: 'Say where to save it: /advise export <path>.jsonl' }
      const log = entriesOf(await $.store.get(LOG))
      await $.fs.write(path, jsonLines(log))

      return { text: `Saved ${count(log.length, 'logged prompt')} to ${path}.\nCalibrate with: npx tsx scripts/calibrate.ts ${path}` }
    }
    if (word === 'use') {
      const a = (await read($, draft)) ?? (await read($, sent))
      if (a === null) return { text: 'Nothing assessed yet: send a prompt, or /advise <prompt>.' }
      const setup = reachable(a.setup, await refreshReach($, fableOption))
      await choose($, setup, 'you')

      return { text: `Sending as ${setupLabel(setup.model, setup.effort)} until /advise reset.` }
    }

    const last = await read($, lastTurn)
    const a = arg.length > 0 ? assess(arg, await read($, sent), last) : await read($, sent)
    if (a === null) return { text: 'Nothing assessed yet: send a prompt, or /advise <prompt>.' }
    const r = await refreshReach($, fableOption)
    const now = await currentOf($)
    const v = verdict(a, now, await read($, contextTokens), r)
    const context = await read($, contextTokens)
    const struggle = struggleOf(last)
    const advisorCalls = last?.advisorCalls ?? 0
    const isAttached = r.advisor !== null && (now === null || advisorFor(now.model, r) !== null)
    const advisor =
      r.advisor === null
        ? ''
        : `Advisor: ${familyLabel(r.advisor)}${isAttached || now === null ? '' : `, off while the main model is ${MODELS[now.model].label}, which it ranks below`}.`

    return {
      text: [
        `${TIER_LABEL[a.tier]}: "${a.excerpt}"`,
        v.head,
        v.detail,
        context > 0 ? `Context now: ${kTokens(context)} tokens.` : '',
        advisor,
        last === null
          ? ''
          : `Last turn: ${count(last.steps, 'request')}, ${count(last.toolErrors, 'tool error')}${advisorCalls > 0 ? `, ${count(advisorCalls, 'advisor call')}` : ''}${struggle === null ? '' : ', harder than it read'}.`,
        `Mode: ${await modeOf($, configured)}.${v.offer === null ? '' : ' /advise use to switch, /advise reset to go back.'}`,
      ]
        .filter(Boolean)
        .join('\n'),
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await modeOf($, configured)) === 'off') return next(e)
    const a = (await read($, draft)) ?? (await read($, sent))
    if (a === null || (await read($, isHidden))) return next(e)

    const chosen = await read($, override)
    const own = await ownOf($)
    const context = await read($, contextTokens)
    const now = await currentOf($)
    const r = await read($, reach)
    const m = e.props.isWorking && now !== null ? midway(a, now, (await read($, run)).steps, context, r) : null
    const v = m !== null && now !== null ? midwayVerdict(m, a, now, context) : verdict(a, now, context, r)
    const offer = v.offer !== null && (chosen === null || chosen.model !== v.offer.model || chosen.effort !== v.offer.effort) ? v.offer : null
    const tone = v.tone === 'warn' ? 'warning' : v.tone === 'save' ? 'success' : undefined
    // The band is shared: the advisor sits on top and whatever the other mods and the engine draw stays under it.
    const below = await next(e)
    const { Box, Button, Text } = $.ui.resolve(e)

    // A row in the terminal or VS Code is a whole line, so only the app and the phones space the text, the buttons and what is below.
    // A number, not a step name: Claude Code before steps refuses the whole band over one.
    const space = e.surface === 'desktop' || e.surface === 'mobile' ? 1 : 0

    return (
      <Box flexDirection="column" gap={space}>
        <Box flexDirection="column" gap={space}>
          <Box flexDirection="column">
            <Text bold={v.tone !== 'fits'} dimColor={v.tone === 'fits' || v.tone === 'note'} color={tone}>
              {v.head}
            </Text>
            {v.tone !== 'fits' && <Text dimColor>{v.detail}</Text>}
            {chosen !== null && (
              <Text dimColor>
                Sending as {setupLabel(chosen.model, chosen.effort)}
                {chosen.by === 'auto' ? ' (auto)' : ''}
                {own === null ? '' : ` in place of ${setupLabel(own.model, own.effort)}`}
              </Text>
            )}
          </Box>
          {(offer !== null || chosen !== null || v.tone !== 'fits') && (
            <Box flexDirection="row" gap={1}>
              {offer !== null && (
                <Button
                  key="use"
                  variant="primary"
                  label={`Use ${setupLabel(offer.model, offer.effort)}`}
                  onPress={() => choose($, offer, 'you')}
                />
              )}
              {chosen !== null && (
                <Button
                  key="back"
                  label={own === null ? 'Back to the session model' : `Back to ${setupLabel(own.model, own.effort)}`}
                  onPress={() => choose($, null, 'you')}
                />
              )}
              {v.tone !== 'fits' && <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />}
            </Box>
          )}
        </Box>
        {below}
      </Box>
    )
  })
}
