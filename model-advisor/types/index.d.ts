export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type ModelKey = 'haiku' | 'sonnet' | 'opus' | 'fable'
export type Tier = 'trivial' | 'light' | 'standard' | 'involved' | 'deep'
export type Mode = 'suggest' | 'auto' | 'off'
/** check: Fable counts once it has been seen to answer; yes and no settle it. */
export type FableOption = 'check' | 'yes' | 'no'

/** Whether Fable answers on this account, as you said or as a request showed; kept across sessions. */
export type FableKnown = { works: boolean; by: 'you' | 'seen'; at: number }

/** What the advisor can reach: Fable, and the advisor model Claude Code attaches to the main model's requests. */
export type Reach = { fable: boolean; advisor: ModelKey | null }

/** A model and an effort, as the advisor names them. */
export type Setup = { model: ModelKey; effort: Effort }

/** What the session itself would send, read off the last main-loop request. */
export type SessionSetup = { model: string; effort: Effort | null }

/** One prompt read: how hard it looks, why, and what would do it. */
export type Assessment = {
  /** The prompt's first line, cut short, so the band says which prompt. */
  excerpt: string
  tier: Tier
  setup: Setup
  reasons: string[]
  /** Several signals that agree; auto acts on nothing less. */
  isSure: boolean
  /** "continue", "do it": the prompt alone says nothing about the work, so the last reading stands. */
  isFollowOn: boolean
}

/** How the last main-loop turn went, read when it ended. */
export type LastTurn = {
  /** The tier the turn's prompt was read as. */
  tier: Tier
  /** Main-loop requests it made. */
  steps: number
  /** Tool calls that came back as errors: failing commands and tests, edits that missed. */
  toolErrors: number
  contextTokens: number
  ended: 'answer' | 'aborted' | 'refusal' | 'error'
  /** Times the main model consulted the advisor; absent before 0.4.0. */
  advisorCalls?: number
}

/** A prompt as read when it was sent, waiting for its turn to end before it is logged. */
export type PendingEntry = {
  /** When it was sent, ms since the epoch. */
  at: number
  /** The session it was sent in, so a replay reads each prompt after the one before it. */
  session: string
  /** Secrets masked, cut at 4,000 characters. */
  prompt: string
  /** Its length before the cut. */
  chars: number
  tier: Tier
  reasons: string[]
  isSure: boolean
  isFollowOn: boolean
  mode: Mode
  /** The session's own model and effort when it was sent; null while unknown. */
  own: { model: ModelKey; effort: Effort | null } | null
  /** The tier the person says it was, from /advise label. */
  label?: Tier
}

/** One prompt the advisor read and how its turn went: what calibration replays. */
export type LogEntry = PendingEntry & {
  /** What the turn ran on, the advisor's override or the session's own. */
  ranOn: { model: ModelKey; effort: Effort | null } | null
  /** Who chose the override it ran on; null when it ran on the session's own. */
  chosenBy: 'you' | 'auto' | null
  steps: number
  toolErrors: number
  contextTokens: number
  ended: LastTurn['ended']
  /** It ran past what its tier promised, by the mid-turn limit at the time. */
  didRunLong: boolean
  /** The band was hidden when the turn ended. */
  wasHidden: boolean
  /** The advisor model set when the turn ended; absent before 0.4.0. */
  advisor?: ModelKey | null
  /** Times the main model consulted the advisor; absent before 0.4.0. */
  advisorCalls?: number
}

declare module 'claude-code' {
  interface PluginState {
    'model-advisor': {
      /** The last prompt sent, assessed. */
      sent: Assessment | null
      /** The draft being typed, assessed (terminal only: the desktop sends no edits). */
      draft: Assessment | null
      /** What the advisor sends in place of the session's own setup, if anything. */
      override: (Setup & { by: 'you' | 'auto' }) | null
      session: SessionSetup | null
      /** Tokens the last main-loop request carried: what a switch re-caches. */
      contextTokens: number
      /** This session's mode, when /advise changed it from the configured one. */
      mode: Mode | null
      isHidden: boolean
      /** Main-loop requests, tool errors and advisor calls so far in the current turn, and whether a request sent on Fable got no answer. */
      run: { turnId: string | null; steps: number; toolErrors: number; advisorCalls?: number; fableFailed?: boolean }
      /** How the last turn went, so the next prompt is read in its light. */
      lastTurn: LastTurn | null
      /** The prompt whose turn is running, logged when it ends. */
      pending: PendingEntry | null
      /** Whether Fable is in reach and which advisor is attached, read from the settings and from what Fable requests did. */
      reach: Reach
    }
  }
}
