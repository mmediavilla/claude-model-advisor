# model-advisor

A Claude Code plugin that reads each prompt you send (free regex heuristics, no model call) and suggests the model and effort that would do it, so you stop paying Opus at high effort for a commit message.

- Shows a band above the prompt and a `/advise` command.
- `mode` option: `suggest` (default), `auto`, or `off`.
- Mid-turn check: flags long-running turns that may need a stronger or cheaper setup (suggest-only).

## Install

```
/plugin marketplace add <owner>/claude-model-advisor
/plugin install model-advisor@my-mods
```

Tune the heuristics in `model-advisor/hooks/assess.ts` (`SIGNALS`, `tierOf`) and add cases to `assess.test.ts`.
