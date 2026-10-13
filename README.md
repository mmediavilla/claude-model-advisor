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

## Regression corpus

`model-advisor/hooks/assess.corpus.ts` holds 165 labelled prompts in three sets: `CASES` (tuned on), `HOLDOUT` (held back for the first round, tuned on in the second) and `FRESH` (never tuned on). `assess.regression.test.ts` fails when any prompt reads differently from its label and is not on the `MISREADS` list, so a change to `SIGNALS` shows exactly which prompts it moved.

```
claude plugin test model-advisor
```

| Set | Prompts | Exact tier, before → after | Two or more tiers off, before → after |
| --- | --- | --- | --- |
| CASES | 106 | 75% → 93% | 9 → 0 |
| HOLDOUT | 30 | 60% → 90% | 3 → 0 |
| FRESH | 29 | 66% → 86% | 4 → 1 |

`FRESH` is the honest number. The labels are one person's judgement, so the next recalibration should use real prompts.
