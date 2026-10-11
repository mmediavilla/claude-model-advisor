export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type ModelKey = 'haiku' | 'sonnet' | 'opus' | 'fable'
export type Tier = 'trivial' | 'light' | 'standard' | 'involved' | 'deep'
export type Mode = 'suggest' | 'auto' | 'off'

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
  /** "continue", "do it": the prompt alone says nothing about the work. */
  isFollowOn: boolean
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
      /** Main-loop requests made so far in the current turn. */
      run: { turnId: string | null; steps: number }
    }
  }
}
