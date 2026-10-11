// What the band and /advise say, from the same reading, so the two never disagree.

import type { Assessment, Setup } from '../types'
import { advise, kTokens, money, setupLabel, TIER_LABEL } from './assess'
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

/** What the band says while a turn is running long; null when it has not. */
export function midwayVerdict(m: Midway, a: Assessment, current: Current, contextTokens: number): Verdict {
  const now = setupLabel(current.model, current.effort)
  const run = `${m.steps} requests in on a ${TIER_LABEL[a.tier].toLowerCase()} prompt, ${kTokens(contextTokens)} context`

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
export function verdict(a: Assessment, current: Current | null, contextTokens: number): Verdict {
  const rec = setupLabel(a.setup.model, a.setup.effort)
  const tier = TIER_LABEL[a.tier]

  if (a.isFollowOn) {
    return {
      tone: 'note',
      head: current ? `Follows on from the last prompt · staying on ${setupLabel(current.model, current.effort)}` : 'Follows on from the last prompt',
      detail: 'Its words say nothing new about the work, so the last reading stands.',
      offer: null,
    }
  }

  if (current === null) {
    return { tone: 'note', head: `${tier}: ${rec} would do`, detail: reasonList(a), offer: a.setup }
  }

  const advice = advise(a, current, contextTokens)
  const now = setupLabel(current.model, current.effort)
  if (advice.kind === 'fits') {
    return { tone: 'fits', head: `✓ ${now} fits this ${tier.toLowerCase()} prompt`, detail: reasonList(a), offer: null }
  }

  const costs =
    advice.costNow === null
      ? `a turn like this ≈${money(advice.costRec)} on ${rec}`
      : `a turn like this ≈${money(advice.costNow)} → ≈${money(advice.costRec)}`
  const recache =
    contextTokens > 0 ? `switching re-caches ${kTokens(contextTokens)} tokens once (≈${money(advice.switch)})` : null
  const detail = [reasonList(a), `${costs} (rough)`, recache].filter(Boolean).join(' · ')

  if (advice.kind === 'cheaper') {
    const head = `${tier}: ${rec} would do · you're on ${now}`

    return { tone: 'save', head, detail: advice.isWorthIt || contextTokens === 0 ? detail : `${detail} · only worth it if you stay on it`, offer: a.setup }
  }
  if (advice.kind === 'stronger') {
    return { tone: 'warn', head: `${tier}: ${rec} would be safer than ${now}`, detail, offer: a.setup }
  }

  return { tone: 'note', head: `${tier}: ${rec} suits this better than ${now}`, detail, offer: a.setup }
}
