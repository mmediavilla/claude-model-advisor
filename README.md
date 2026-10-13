# model-advisor

A Claude Code plugin that reads each prompt you send (free regex heuristics, no model call) and suggests the model and effort that would do it, so you stop paying Opus at high effort for a commit message.

- Shows a band above the prompt and a `/advise` command.
- `mode` option: `suggest` (default), `auto`, or `off`.
- Mid-turn check: flags long-running turns that may need a stronger or cheaper setup (suggest-only).
- Reads each prompt in light of the session:
  - A short prompt that points back at the last one ("add a test for it") is read no more than one tier below it.
  - A turn that ran long, hit 3 or more tool errors, or ended in an error makes the next related prompt one tier harder.
  - After such a turn, auto mode only moves chores to a cheaper setup, until a turn goes as expected.
  - `/clear` forgets all of it. `/advise` shows how the last turn went.
- `log` option: `on` (default) or `off`. When on, the plugin keeps a log of your newest 400 prompts for calibration (see below).
  - Each entry holds how the prompt was read, what the turn ran on, and how the turn went.
  - The log lives in the plugin's own store on your machine and is never sent anywhere.
  - Keys, tokens and passwords are masked before saving. This is best effort.

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

## Calibrating on your own prompts

1. Use Claude Code as usual. The log keeps your newest 400 prompts.
2. When a reading is wrong, label it right after the turn: `/advise label <tier>`. The tiers are `trivial`, `light`, `standard`, `involved` and `deep`.
3. `/advise log` sums up how prompts were read, how often each tier's turns struggled, and how the readings match your labels.
4. `/advise export` saves the log as JSON lines to `~/.claude/model-advisor-log.jsonl` (`%USERPROFILE%\.claude\` on Windows). To save it somewhere else, use `/advise export <path>.jsonl`.
5. Replay the log through the current rules:

   ```
   npx tsx scripts/calibrate.ts ~/.claude/model-advisor-log.jsonl
   ```

   The report shows:
   - readings that changed since they were logged
   - how the readings match your labels
   - how often each tier's turns struggled
   - prompts that read low but struggled, which are worth a label
6. Add `--corpus` to print your labelled prompts as lines for `CASES` in `assess.corpus.ts`. Then tune `SIGNALS` and run `claude plugin test model-advisor`.

`/advise log clear` empties the log.
