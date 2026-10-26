// What the band and /advise say, from the same reading, so the two never disagree.

import type { Assessment, Reach, Setup } from '../types'
import { advise, familyLabel, FULL_REACH, kTokens, MODELS, money, reachable, setupLabel, TIER_LABEL } from './assess'
import type { Current, Midway } from './assess'

export type Tone = 'fits' | 'save' | 'warn' | 'note'

export type Verdict = {
  tone: Tone
  head: string
  detail: string
  /** What "Use" would switch to; null when there is nothing to switch to. */
  offer: Setup | null
}

function reasonList(a: Assessment): string {
  return a.reasons.slice(0, 3).join(', ')
}

/** Said when the prompt calls for Fable and it is out of reach, so the setup offered is not mistaken for the best one. */
function fableNote(a: Assessment, reach: Reach): string | null {
  return a.setup.model === 'fable' && !reach.fable ? `${MODELS.fable.label} may do better, but needs usage credits: /advise fable yes if you have them` : null
}

/** What the band says while a turn is running long; null when it has not. */
export function midwayVerdict(m: Midway, a: Assessment, current: Current, contextTokens: number): Verdict {
  const now = setupLabel(current.model, current.effort)
  const tier = TIER_LABEL[a.tier].toLowerCase()
  const run = `${m.steps} requests in on ${/^[aeiou]/.test(tier) ? 'an' : 'a'} ${tier} prompt, ${kTokens(contextTokens)} context`

  if (m.kind === 'stronger' && m.rec) {
    return {
      tone: 'warn',
      head: `Running long: ${run} · ${setupLabel(m.rec.model, m.rec.effort)} may cope better than ${now}`,
      detail: `Switching re-caches the conversation once (≈${money(m.switch)}). The next request uses it; this one is already sent.`,
      offer: m.rec,
    }
  }
  if (m.kind === 'cheaper' && m.rec) {
    return {
      tone: 'save',
      head: `Running long: ${run} · ${setupLabel(m.rec.model, m.rec.effort)} would do the rest · you're on ${now}`,
      detail: `Rough saving over the rest of the run ≈${money(m.saving)} after the re-cache (≈${money(m.switch)}). Only if it keeps going.`,
      offer: m.rec,
    }
  }

  return {
    tone: 'note',
    head: `Running long: ${run} · every request re-reads a big context`,
    detail: 'A switch now would re-cache all of it. Cheaper to finish this run, then /compact or start fresh.',
    offer: null,
  }
}

/** `current` is what would be sent now: the advisor's override, else the session's own. */
export function verdict(a: Assessment, current: Current | null, contextTokens: number, reach: Reach = FULL_REACH): Verdict {
  const setup = reachable(a.setup, reach)
  const rec = setupLabel(setup.model, setup.effort)
  const tier = TIER_LABEL[a.tier]
  const fable = fableNote(a, reach)

  if (a.isFollowOn) {
    return {
      tone: 'note',
      head: current ? `Follows on from the last prompt · staying on ${setupLabel(current.model, current.effort)}` : 'Follows on from the last prompt',
      detail: 'Its words say nothing new about the work, so the last reading stands.',
      offer: null,
    }
  }

  if (current === null) {
    return { tone: 'note', head: `${tier}: ${rec} would do`, detail: [reasonList(a), fable].filter(Boolean).join(' · '), offer: setup }
  }

  const advice = advise(a, current, contextTokens, reach)
  const now = setupLabel(current.model, current.effort)
  if (advice.kind === 'fits') {
    return { tone: 'fits', head: `✓ ${now} fits this ${tier.toLowerCase()} prompt`, detail: [reasonList(a), fable].filter(Boolean).join(' · '), offer: null }
  }
  if (advice.kind === 'covered') {
    const advisor = familyLabel(advice.advisor)

    return {
      tone: 'fits',
      head: `✓ ${now} fits · the ${advisor} advisor covers the hard calls of this ${tier.toLowerCase()} prompt`,
      detail: `${rec} may do it better, but the ${advisor} advisor steps in at decision points, with no switch and no re-cache`,
      offer: null,
    }
  }

  // A switch has to be worth its re-cache, or the band would offer one on every prompt of a long session.
  if (!advice.isWorthIt && contextTokens > 0) {
    const recache = `switching re-caches ${kTokens(contextTokens)} tokens (≈${money(advice.switch)})`
    if (advice.isStepUp) {
      return {
        tone: 'fits',
        head: `✓ Staying on ${now} · a switch costs too much next to this ${tier.toLowerCase()} prompt`,
        detail: [`${rec} may do it better, but ${recache}, over a quarter of a turn like this on it (≈${money(advice.costRec)})`, fable].filter(Boolean).join(' · '),
        offer: null,
      }
    }
    const saving =
      advice.costNow === null
        ? 'and without the current effort the saving cannot be priced'
        : `more than a turn like this would save (≈${money(Math.max(0, advice.costNow - advice.costRec))})`

    return {
      tone: 'fits',
      head: `✓ Staying on ${now} · a switch costs more than this ${tier.toLowerCase()} prompt saves`,
      detail: `${rec} would do it, but ${recache}, ${saving}`,
      offer: null,
    }
  }

  const costs =
    advice.costNow === null
      ? `a turn like this ≈${money(advice.costRec)} on ${rec}`
      : `a turn like this ≈${money(advice.costNow)} → ≈${money(advice.costRec)}`
  const recache =
    contextTokens > 0 ? `switching re-caches ${kTokens(contextTokens)} tokens once (≈${money(advice.switch)})` : null
  // Claude Code drops an advisor that ranks below the main model without a word, so the band says it first.
  const drops = advice.dropsAdvisor === null ? null : `${MODELS[setup.model].label} turns the ${familyLabel(advice.dropsAdvisor)} advisor off`
  const detail = [reasonList(a), `${costs} (rough)`, recache, drops, fable].filter(Boolean).join(' · ')

  if (advice.kind === 'cheaper') {
    const head = `${tier}: ${rec} would do · you're on ${now}`

    return { tone: 'save', head, detail, offer: setup }
  }
  if (advice.kind === 'stronger') {
    return { tone: 'warn', head: `${tier}: ${rec} would be safer than ${now}`, detail, offer: setup }
  }

  return { tone: 'note', head: `${tier}: ${rec} suits this better than ${now}`, detail, offer: setup }
}
