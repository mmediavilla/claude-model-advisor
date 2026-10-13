// What a prompt looks like it needs, read from its words alone. No model is
// asked: a judge that spends tokens on every prompt to save tokens is the
// wrong way round, and a regex can run on every keystroke.

import type { Assessment, Effort, LastTurn, ModelKey, Setup, Tier } from '../types'

/**
 * List prices per million tokens (the Claude API skill's table, 2026-10-06).
 * Haiku 5.5's are for prompts up to 100K tokens; past that it is $0.50 / $2.50.
 * Its cache-read price is not listed, so it is taken at the usual tenth of input.
 */
export const MODELS = {
  haiku: { id: 'claude-haiku-5-5', label: 'Haiku 5.5', input: 0.1, output: 0.5, cacheRead: 0.01 },
  sonnet: { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', input: 2, output: 10, cacheRead: 0.2 },
  opus: { id: 'claude-opus-5-5', label: 'Opus 5.5', input: 4, output: 20, cacheRead: 0.2 },
  fable: { id: 'claude-fable-5-1', label: 'Fable 5.1', input: 10, output: 50, cacheRead: 0.25 },
} as const satisfies Record<ModelKey, { id: string; label: string; input: number; output: number; cacheRead: number }>

const MODEL_RANK: Record<ModelKey, number> = { haiku: 0, sonnet: 1, opus: 2, fable: 3 }
export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export const RECOMMENDED: Record<Tier, Setup> = {
  trivial: { model: 'haiku', effort: 'low' },
  light: { model: 'sonnet', effort: 'low' },
  standard: { model: 'sonnet', effort: 'medium' },
  involved: { model: 'opus', effort: 'high' },
  deep: { model: 'fable', effort: 'high' },
}

export const TIER_LABEL: Record<Tier, string> = {
  trivial: 'Trivial',
  light: 'Light',
  standard: 'Standard',
  involved: 'Involved',
  deep: 'Deep',
}

/**
 * A rough turn of each tier in Claude Code: tokens written (thinking included,
 * at medium effort) and requests made. Guesses, used only to say whether a
 * switch pays for its re-cache; the band labels anything built on them rough.
 */
const TURN: Record<Tier, { output: number; requests: number }> = {
  trivial: { output: 1_500, requests: 2 },
  light: { output: 5_000, requests: 4 },
  standard: { output: 20_000, requests: 12 },
  involved: { output: 50_000, requests: 30 },
  deep: { output: 100_000, requests: 50 },
}
const EFFORT_OUTPUT: Record<Effort, number> = { low: 0.5, medium: 1, high: 1.6, xhigh: 2.2, max: 3 }
/** New input per request (tool results, the reply before it), written to the cache. */
const FRESH_PER_REQUEST = 2_000
const CACHE_WRITE = 1.25

type Signal = { label: string; weight: number; test: (s: Scan) => boolean }
type Scan = { prose: string; raw: string; first: string; isShort: boolean }

const has = (re: RegExp) => (s: Scan) => re.test(s.prose)

/** Asks what is behind a problem: "why does", "find out why", "what's causing". */
const WHY = /\b(why (does|is|do|are|did|was|were|has|have|isn'?t|doesn'?t|won'?t|can'?t|would)|root cause|investigate|figure out|find out (why|what|how|where|whether)|work out why|diagnose|debug|track (\w+ )?down|get to the bottom|what('?s| is) (causing|wrong with|breaking)|what causes)\b/

/** A move between versions or between named tools: "Laravel 10 to 11", "from MySQL to Postgres". */
const STACK_JUMP = /\b(upgrade|migrate|port) .{0,40}\b(from|to) ([a-z.]+ ?)?v?\d+/
/** Named the way tools are, so a format or zone (CSV, UTC) is not one. */
const STACK_SWAP = /\b([Uu]pgrade|[Mm]igrate|[Pp]ort|[Mm]ove|[Ss]witch)\b.{0,40}\bfrom [A-Z][\w.]*[a-z][\w.]*.{0,20}\bto [A-Z][\w.]*[a-z][\w.]*/

const SIGNALS: readonly Signal[] = [
  // Cheap work
  { label: 'small talk', weight: -4, test: s => /^((hi|hello|hey|thanks|thank you|thx|ty|ok|okay|cool|nice|great|perfect|awesome)( so much| a lot)?\b[\s,!.]*)+$/.test(s.first) },
  { label: 'git chore', weight: -3, test: has(/\b(git (status|log|diff|add|commit|push|pull|fetch|checkout|switch|stash|branch)|commit (this|it|these|that|the changes|everything)|(and|then) (commit|push)$|push (it|this|the branch)|open (a|the) pr|merge (it|the pr)|pull (the )?latest|stash (my|the|these|this|it|everything)|(create|make|switch to|check ?out|delete) (a |the |this )?(new )?branch|sync with (main|master|develop|upstream)|rebase on(to)? (main|master|develop))\b/) },
  // Only where the command is the ask, not the job of what is built: "run the tests", not "set up CI to run the tests".
  { label: 'runs a command', weight: -2, test: has(/(^|[,.;:!?]\s*|\b(and|then|now|please|pls|just|also|you)\s+)((re-?)?run (the )?(tests?|build|lint(er)?|pint|jest|phpunit|suite|migrations?|seeders?)|start the (dev )?server|restart the (worker|server|queue))\b/) },
  { label: 'cosmetic edit', weight: -2, test: has(/\b(typos?|spelling|rename|reword|indent(ation)?|reformat|whitespace|sort (the )?imports|unused imports?|bump (the )?version|add a comment|lint (errors?|warnings?))\b/) },
  { label: 'quick question', weight: -1, test: s => s.prose.length < 200 && /^(what|what's|whats|where|which|who|when|how many|how much|how do i|is there|are there|list|show me)\b/.test(s.first) && !WHY.test(s.prose) },
  { label: 'explain or summarise', weight: -1, test: has(/\b(explain|summari[sz]e|tl;?dr|translate)\b/) },

  // Work
  { label: 'builds something', weight: 1, test: has(/\b(add|implement|create|build|write|make(?! sure)|wire up|hook up|set up|scaffold|generate)\b/) },
  { label: 'new feature', weight: 1, test: has(/\b(feature|endpoint|api|page|screen|component|module|service|migration|schema|mod|plugin|integration|workflow|pipeline)s?\b/) },
  { label: 'fixes a bug', weight: 1, test: has(/\b(fix|bug|broken|doesn'?t work|does not work|not working|fails?|failing|crash(es|ing)?|freez(e|es|ing)|hangs|flicker\w*|disappear\w*|stuck|incorrect(ly)?|unexpected(ly)?|when (i|you|we|users?|the user|someone) \w+)\b/) },
  { label: 'review', weight: 2, test: has(/\b(review|audit)\b/) },
  { label: 'needs care', weight: 1, test: has(/\b(carefully|thorough(ly)?|safely|make sure|don'?t break|do not break|production|security|vulnerab\w*|o?auth(entication|orization)?|sso|concurren\w*|performance|optimi[sz]\w*|algorithm|prove)\b/) },
  { label: 'high stakes', weight: 2, test: has(/\b(data loss|los(e|ing) (any )?data|ledger|off by (a few )?(cents|pennies)|double[- ]charg\w*|charged twice|month[- ]end|irreversible)\b/) },
  { label: 'asks why', weight: 3, test: has(WHY) },
  { label: 'restructures code', weight: 2, test: has(/\b(refactor|restructure|re-?architect|migrate|rewrite|overhaul|redesign|upgrade|(split|break up|break apart|extract) .{0,40}\binto)\b/) },
  { label: 'touches many files', weight: 2, test: has(/\b(across (the|all|every|multiple|several|many|\d+)|every (file|screen|component|test|controller|page)|(whole|entire) (codebase|app|project|repo)|codebase-wide|end[- ]to[- ]end)\b/) },
  { label: 'swaps the stack', weight: 3, test: s => STACK_JUMP.test(s.prose) || STACK_SWAP.test(s.raw) },
  { label: 'system design', weight: 4, test: has(/\b(architecture|system design|re-?architect|design (a|an|the) (\w+ )?(system|architecture|data model|protocol|platform|engine))\b/) },
  { label: 'planning', weight: 3, test: has(/\b(design (a|an|the)|trade-?offs?|plan (the|a|an|out|for)|make a plan|epic|roadmap|strategy|evaluate (the )?options|pros and cons|recommend (one|an? (approach|option|library))|compare .{0,60}\b(approach|option|librar\w*|framework|architecture|strateg\w*)|should we (use|go with|switch|adopt|move))\b/) },
  { label: 'carries out a plan', weight: 3, test: s => carriesOutAPlan(s) },
  { label: 'hard-to-pin bug', weight: 3, test: has(/\b(race condition|deadlock|flaky|intermittent(ly)?|heisenbug|memory leak|leaks memory|starv(e|es|ation)|livelock|corrupt(ed|ion)|(a|the) race( (in|between|on|when|where)|$|[,.;])|races (between|in|on)|stale (data|reads?|values?|cache[ds]?|state|balances?|results?|responses?)|(returns?|reads?|serves?|come back|comes back) stale|non-?deterministic|only (happens|fails|breaks|shows up) (in|on|when|after)|only (in|on|under) (production|prod|staging|ci|load)|under load)\b/) },
  { label: 'distributed systems', weight: 3, test: has(/\b(shard\w*|partition(ing|ed)?|replicat\w*|multi-region|consensus|eventual(ly)? consisten\w*|distributed (lock|transaction|system)s?)\b/) },
  { label: 'asks for deep thinking', weight: 6, test: has(/\b(ultrathink|think (really |very )?hard(er)?|think deeply|hardest|most capable|use fable)\b/) },

  // Size
  { label: 'pasted code', weight: 1, test: s => /```/.test(s.raw) },
  { label: 'stack trace', weight: 1, test: s => /(Traceback \(most recent call last\)|^\s+at [\w.$<>]+ ?\(.*:\d+|^#\d+ .+\(\d+\)|\bException\b.*\n)/m.test(s.raw) },
  { label: 'long brief', weight: 1, test: s => s.raw.length > 1_500 && s.raw.length <= 4_000 },
  { label: 'very long brief', weight: 2, test: s => s.raw.length > 4_000 },
  { label: 'names several files', weight: 1, test: s => fileCount(s.raw) >= 3 && fileCount(s.raw) < 6 },
  { label: 'names many files', weight: 2, test: s => fileCount(s.raw) >= 6 },
  { label: 'several asks', weight: 1, test: s => (s.raw.match(/^\s*([-*]|\d+[.)])\s+\S/gm) ?? []).length >= 4 },
]

/** A step of a plan, named by its number or its place in the order: "phase 24.5", "the next phase". */
const PLAN_STEP = /\b((phase|step|stage|part|milestone)[ -]?\d+(\.\d+)*|(next|following|final|last|remaining) (phase|stage|milestone))\b/
/** What sets a step going. Read anywhere in the prompt, so "start next phase" and "next phase start" are one prompt. */
const PLAN_GO = /\b(start|begin|kick (it )?off|do|run|execute|build|tackle|work on|implement|carry out|move on|go|proceed|continue|onto)\b/
/** What may stand beside a step and leave it the whole prompt: "next phase please". */
const PLAN_FILLER = /\b(ok(ay)?|so|right|now|then|please|pls|let'?s|lets|the|on|to|and)\b/g
/** A prompt about a step rather than one starting it: "what does the next phase cover?" */
const ASKING = /^(what|what's|whats|where|which|who|when|how|why|is|are|was|does|did|should)\b/

/** The old, strict reading, for a long prompt that may only mention a step: the verb right before it, and a number. */
const PLAN_STEP_NUMBERED = /\b(start|begin|do|run|execute|build) (the )?(phase|step|stage|part|milestone) ?\d/
/** Past this, a prompt describes work rather than starting a step, so word order alone no longer says which. */
const PLAN_PROMPT_CHARS = 100

function carriesOutAPlan(s: Scan): boolean {
  if (PLAN_STEP_NUMBERED.test(s.prose)) return true
  if (s.prose.length > PLAN_PROMPT_CHARS || !PLAN_STEP.test(s.prose) || ASKING.test(s.first)) return false
  if (PLAN_GO.test(s.prose)) return true

  const rest = s.prose.replace(new RegExp(PLAN_STEP.source, 'g'), ' ').replace(PLAN_FILLER, ' ')

  return rest.replace(/[^a-z0-9]+/g, '') === ''
}

const FOLLOW_ON =/^(continue|go on|go ahead|keep going|carry on|proceed|yes|yep|yeah|y|sure|do it|do that|try again|again|retry|same (for|with|thing)|and (the|now)|next|looks good|lgtm|sounds good|fix (it|that|this|them)|that'?s (wrong|not)|no)\b/

/** Words a follow-on may carry after its opener ("continue with the tests"); more is a new instruction ("next, wire up the retry logic"). */
const FOLLOW_ON_WORDS = 3
/** A correction of the last answer is about the same work however long it runs: "no, use the existing mailer instead". */
const CORRECTION = /^(no|nope|not quite|wrong|that'?s (wrong|not (it|right|what i (meant|asked|wanted))))\b/

/** How many words are left once the opening follow-on phrase is taken off. */
function followOnRest(s: Scan): number {
  const rest = s.prose.replace(FOLLOW_ON, ' ')

  return rest.split(/[^a-z0-9']+/).filter(Boolean).length
}

function fileCount(raw: string): number {
  const found = raw.match(/[\w./\\-]+\.(tsx?|jsx?|php|py|go|rs|rb|java|kt|cs|css|html|md|json|ya?ml|sql|vue|svelte)\b/g) ?? []

  return new Set(found).size
}

function scan(text: string): Scan {
  const raw = text.trim()
  // Fenced and inline code, quoted text and paths are what the work is about, not what it is.
  const prose = raw
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/(^|[\s(])(["'])[^"'\n]{1,200}\2(?=[\s,.;:!?)]|$)/g, '$1 ')
    .replace(/\S*[\\/]\S*/g, ' ')
    .toLowerCase()
  const first = prose.trimStart().split('\n')[0]?.trim() ?? ''

  return { raw, prose, first, isShort: raw.length < 80 }
}

function tierOf(score: number): Tier {
  if (score <= -3) return 'trivial'
  if (score <= 0) return 'light'
  if (score <= 2) return 'standard'
  if (score <= 5) return 'involved'
  return 'deep'
}

function excerpt(text: string): string {
  const line = text.trim().split('\n')[0] ?? ''

  return line.length > 60 ? `${line.slice(0, 59)}…` : line
}

/** Points at the last prompt's work rather than naming its own: "add a test for it", "document the fix". */
const BACK_REF = /\b(it|them|those|the (fix|change|changes|bug|issue|problem|error|feature|refactor)|(that|this) (fix|change|bug|issue|one)|same (thing|fix|change))\b|\b(this|that)[\s.!?]*$/
/** Past this, a prompt says enough about its own work to be read alone. */
const BACK_REF_CHARS = 160
/** Tool errors in one turn from which it counts as a struggle. */
const STRUGGLE_ERRORS = 3

/** Why the last turn looks harder than its prompt read; null when it went as read. */
export function struggleOf(last: LastTurn | null): string | null {
  if (last === null) return null
  if (last.ended === 'error') return 'the last turn ended in an error'
  if (last.steps >= longRunLimit(last.tier, last.contextTokens)) return `the last turn ran long (${last.steps} requests)`
  if (last.toolErrors >= STRUGGLE_ERRORS) return `the last turn hit ${last.toolErrors} tool errors`

  return null
}

function stepTier(tier: Tier, by: number): Tier {
  const at = Math.min(TIER_ORDER.length - 1, Math.max(0, TIER_ORDER.indexOf(tier) + by))

  return TIER_ORDER[at] ?? tier
}

/**
 * Reads one prompt in the light of the last. A follow-on ("continue", "do
 * it") inherits what the last prompt was read as, since its words say nothing
 * about the work. A short prompt that points back at that work ("add a test
 * for it") is read no lower than a tier under it. Both go a tier higher when
 * the last turn struggled: it ran long, kept failing, or died on an error.
 */
export function assess(text: string, previous: Assessment | null, last: LastTurn | null = null): Assessment {
  const s = scan(text)
  const hit = SIGNALS.filter(signal => signal.test(s))
  const positive = hit.filter(h => h.weight > 0).reduce((n, h) => n + h.weight, 0)
  const negative = hit.filter(h => h.weight < 0).reduce((n, h) => n + h.weight, 0)
  const struggle = previous === null ? null : struggleOf(last)

  const isCorrection = positive === 0 && CORRECTION.test(s.first)
  if (positive <= 1 && s.raw.length < 120 && FOLLOW_ON.test(s.first) && negative === 0 && (isCorrection || followOnRest(s) <= FOLLOW_ON_WORDS)) {
    const tier = previous === null ? 'standard' : stepTier(previous.tier, struggle === null ? 0 : 1)

    return {
      excerpt: excerpt(text),
      tier,
      setup: previous !== null && struggle === null ? previous.setup : RECOMMENDED[tier],
      reasons: struggle === null ? ['follows on from the last prompt'] : ['follows on from the last prompt', struggle],
      isSure: false,
      // Lifted by a struggle, the last reading no longer stands, so this one is advice of its own.
      isFollowOn: struggle === null,
    }
  }

  // A short prompt with nothing in it to read is taken as light, never trivial.
  const short = s.isShort && hit.length === 0 ? -1 : 0
  const own = tierOf(positive + negative + short)
  const reasons = hit.map(h => h.label)
  if (short !== 0) reasons.push('short')

  // A chore or a question stands on its own words, whatever came before it.
  const pointsBack = previous !== null && negative === 0 && s.prose.length <= BACK_REF_CHARS && BACK_REF.test(s.prose)
  const floor = pointsBack ? stepTier(previous.tier, struggle === null ? -1 : 0) : own
  const tier = TIER_ORDER.indexOf(floor) > TIER_ORDER.indexOf(own) ? floor : own
  const isCarried = tier !== own
  if (isCarried) reasons.unshift(...(struggle === null ? ['refers back to the last prompt'] : ['refers back to the last prompt', struggle]))

  const isConflicted = positive >= 2 && negative <= -2
  // A tier lifted by the last prompt is a guess about the work, never sure enough for auto to act on.
  const isSure = !isCarried && !isConflicted && (hit.length >= 2 || hit.some(h => Math.abs(h.weight) >= 3))

  return {
    excerpt: excerpt(text),
    tier,
    setup: RECOMMENDED[tier],
    reasons: reasons.length > 0 ? reasons : ['nothing stands out'],
    isSure,
    isFollowOn: false,
  }
}

/** The family a model id belongs to; null for one the advisor does not price. */
export function modelKeyOf(id: string): ModelKey | null {
  const name = id.toLowerCase()
  if (/fable|mythos/.test(name)) return 'fable'
  if (/opus/.test(name)) return 'opus'
  if (/sonnet/.test(name)) return 'sonnet'
  if (/haiku/.test(name)) return 'haiku'

  return null
}

export function effortOf(value: unknown): Effort | null {
  return typeof value === 'string' && (EFFORTS as readonly string[]).includes(value) ? (value as Effort) : null
}

/** The id to send for a family, keeping a context suffix like `[1m]` the session's id carries. */
export function idFor(model: ModelKey, sessionId: string): string {
  const suffix = sessionId.match(/\[[^\]]+\]$/)?.[0] ?? ''

  return MODELS[model].id + suffix
}

export function setupLabel(model: ModelKey, effort: Effort | null): string {
  return `${MODELS[model].label} · ${effort ?? '?'}`
}

function prices(model: ModelKey, contextTokens: number) {
  const m = MODELS[model]
  const isLongHaiku = model === 'haiku' && contextTokens > 100_000

  return isLongHaiku ? { input: 0.5, output: 2.5, cacheRead: 0.05 } : m
}

/** Rough dollars for a turn of this tier on this setup, at list price. */
export function turnCost(setup: Setup, tier: Tier, contextTokens: number): number {
  const p = prices(setup.model, contextTokens)
  const t = TURN[tier]
  const reads = t.requests * contextTokens * p.cacheRead
  const fresh = t.requests * FRESH_PER_REQUEST * p.input * CACHE_WRITE
  const written = t.output * EFFORT_OUTPUT[setup.effort] * p.output

  return (reads + fresh + written) / 1e6
}

/**
 * What one switch costs over staying put: the first request on a new model or
 * effort writes the conversation into the cache instead of reading it (caches
 * are per model, and a change of effort spends the messages' cache too).
 */
export function switchCost(to: Setup, contextTokens: number): number {
  const p = prices(to.model, contextTokens)

  return (contextTokens * (p.input * CACHE_WRITE - p.cacheRead)) / 1e6
}

export type Current = { model: ModelKey; effort: Effort | null }

export type Advice =
  | { kind: 'fits' }
  | { kind: 'cheaper' | 'stronger' | 'different'; rec: Setup; costNow: number | null; costRec: number; switch: number; isWorthIt: boolean }

/**
 * Compares a prompt's setup with what would be sent. Cheaper means no step up
 * in either model or effort; stronger, no step down in either; different, one
 * of each (Sonnet at high against Opus at low), which is a judgement, not a saving.
 */
export function advise(a: Assessment, current: Current, contextTokens: number): Advice {
  const rec = a.setup
  const dm = MODEL_RANK[rec.model] - MODEL_RANK[current.model]
  const de = current.effort === null ? 0 : EFFORTS.indexOf(rec.effort) - EFFORTS.indexOf(current.effort)
  if (dm === 0 && de === 0) return { kind: 'fits' }

  const kind = dm <= 0 && de <= 0 ? 'cheaper' : dm >= 0 && de >= 0 ? 'stronger' : 'different'
  const costNow = current.effort === null ? null : turnCost({ model: current.model, effort: current.effort }, a.tier, contextTokens)
  const costRec = turnCost(rec, a.tier, contextTokens)
  const cost = switchCost(rec, contextTokens)
  const isWorthIt = costNow !== null && costNow - costRec > cost

  return { kind, rec, costNow, costRec, switch: cost, isWorthIt }
}

const TIER_ORDER: readonly Tier[] = ['trivial', 'light', 'standard', 'involved', 'deep']
/** Fewest requests a turn must make before it counts as long, whatever its tier expected. */
const LONG_FLOOR = 12
/** A conversation this big makes every request dear, so a run is called long sooner. */
export const HEAVY_CONTEXT = 150_000

/** Requests after which a turn of this tier has run past what the prompt promised. */
export function longRunLimit(tier: Tier, contextTokens: number): number {
  const limit = Math.max(LONG_FLOOR, Math.round(TURN[tier].requests * 1.5))

  return contextTokens >= HEAVY_CONTEXT ? Math.max(LONG_FLOOR / 2, Math.round(limit / 2)) : limit
}

/** Rough dollars for one request of a turn of this tier on this setup. */
export function requestCost(setup: Setup, tier: Tier, contextTokens: number): number {
  const p = prices(setup.model, contextTokens)
  const t = TURN[tier]
  const written = (t.output / t.requests) * EFFORT_OUTPUT[setup.effort] * p.output

  return (contextTokens * p.cacheRead + FRESH_PER_REQUEST * p.input * CACHE_WRITE + written) / 1e6
}

export type Midway = {
  /** stronger: the run looks harder than the prompt read; cheaper: the work is long and a cheaper setup would do it; stay: only the context is heavy. */
  kind: 'stronger' | 'cheaper' | 'stay'
  rec: Setup | null
  steps: number
  isHeavy: boolean
  /** Rough dollars saved over the rest of the run, after the re-cache; cheaper only. */
  saving: number
  switch: number
}

/**
 * A run that has gone on longer than its prompt promised. Remaining work is
 * guessed as half as many requests again as have been made. A model below the
 * next tier up is offered that tier; otherwise a cheaper setup is offered only
 * if it pays for its re-cache; otherwise a heavy context alone is mentioned.
 */
export function midway(a: Assessment, current: Current | null, steps: number, contextTokens: number): Midway | null {
  if (current === null || steps < longRunLimit(a.tier, contextTokens)) return null
  const isHeavy = contextTokens >= HEAVY_CONTEXT

  const up = TIER_ORDER[TIER_ORDER.indexOf(a.tier) + 1]
  if (up !== undefined && MODEL_RANK[current.model] < MODEL_RANK[RECOMMENDED[up].model]) {
    const rec = RECOMMENDED[up]

    return { kind: 'stronger', rec, steps, isHeavy, saving: 0, switch: switchCost(rec, contextTokens) }
  }

  const advice = advise(a, current, contextTokens)
  if (advice.kind === 'cheaper' && current.effort !== null) {
    const perNow = requestCost({ model: current.model, effort: current.effort }, a.tier, contextTokens)
    const perRec = requestCost(advice.rec, a.tier, contextTokens)
    const saving = (perNow - perRec) * Math.ceil(steps / 2) - advice.switch
    if (saving > 0) return { kind: 'cheaper', rec: advice.rec, steps, isHeavy, saving, switch: advice.switch }
  }

  return isHeavy ? { kind: 'stay', rec: null, steps, isHeavy, saving: 0, switch: 0 } : null
}

export function money(dollars: number): string {
  return dollars < 0.01 ? '<$0.01' : `$${dollars.toFixed(2)}`
}

export function kTokens(tokens: number): string {
  return tokens < 1_000 ? `${tokens}` : `${Math.round(tokens / 1_000)}k`
}
