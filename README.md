# model-advisor

A Claude Code plugin that reads each prompt you send (free regex heuristics, no model call) and suggests the model and effort that would do it, so you stop paying Opus at high effort for a commit message.

- Shows a band above the prompt and a `/advise` command.
- Offers a switch only when it is worth the re-cache: a cheaper setup must save more than the re-cache costs, and a stronger one must cost no more than a quarter of the turn to re-cache.
- `mode` option: `suggest` (default), `auto`, or `off`.
- Knows Fable needs usage credits (`fable` option, see Settings):
  - By default, Fable is offered only once a request on it has answered, or the session already runs on it. Until then a deep prompt is offered Opus at xhigh.
  - If a request the advisor sent on Fable fails, it goes back to your setup and stops offering Fable.
  - `/advise fable` says where it stands. `/advise fable yes`, `no` or `check` changes it for every session.
- Works with Claude Code's advisor (`/advisor`):
  - When the advisor is as strong as the model a prompt needs, the band keeps your setup and says the advisor covers the hard calls.
  - When a switch would move the main model above the advisor, the band warns that it turns the advisor off.
  - `/advise` names the advisor and counts its calls in the last turn.
- Mid-turn check: flags long-running turns that may need a stronger or cheaper setup (suggest-only).
- Reads each prompt in light of the session:
  - A short prompt that points back at the last one ("add a test for it") is read no more than one tier below it.
  - A turn that ran long, hit 3 or more tool errors, or ended in an error makes the next related prompt one tier harder.
  - After such a turn, auto mode only moves chores to a cheaper setup, until a turn goes as expected.
  - `/clear` forgets all of it. `/advise` shows how the last turn went.
- `log` option: `off` (default) or `on`. When on, the plugin keeps a log of your newest 400 prompts for calibration (see below).
  - Each entry holds how the prompt was read, what the turn ran on, and how the turn went.
  - The log lives in the plugin's own store on your machine and is never sent anywhere.
  - Keys, tokens and passwords are masked before saving. This is best effort.

## Install

In a Claude Code terminal session:

```
/plugin install model-advisor --marketplace mmediavilla/claude-model-advisor
```

Answer `y` to add the marketplace, then pick a scope. User scope makes it active in every session.

## Update

Releases are listed on the [releases page](https://github.com/mmediavilla/claude-model-advisor/releases), and [CHANGELOG.md](CHANGELOG.md) says what changed in each. To move to the newest release:

```
claude plugin marketplace update mmediavilla
claude plugin update model-advisor@mmediavilla
```

Then restart Claude Code.

## Settings

Set them in `/plugin configure model-advisor@mmediavilla`, or from a shell:

```
echo '{"mode":"auto","log":"on","fable":"check"}' | claude plugin configure model-advisor@mmediavilla --values-stdin
```

| Setting | Values | What it does |
| --- | --- | --- |
| `mode` | `suggest` (default), `auto`, `off` | `auto` also sends a prompt on a cheaper setup when the advisor is sure and the switch pays for itself. It never moves you to a stronger model. |
| `log` | `off` (default), `on` | Keeps your newest 400 prompts for calibration. |
| `fable` | `check` (default), `yes`, `no` | Fable bills to usage credits. `check` offers it only once it has been seen to answer. `yes` always offers it. `no` never does. |

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

1. Turn the log on (see Settings), then use Claude Code as usual. The log keeps your newest 400 prompts.
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

## Releasing

Claude Code keeps an installed plugin by its version, and `claude plugin update` only fetches a change when the version goes up. A change pushed under the same version never reaches people who already installed it. So every change to the plugin ships as a new version:

1. Bump `version` in `model-advisor/.claude-plugin/plugin.json`, following [Semantic Versioning](https://semver.org).
2. Add a `## [x.y.z] - YYYY-MM-DD` section to `CHANGELOG.md`.
3. Merge to `main`. The Release workflow tags `vx.y.z` and publishes that changelog section as the GitHub release.

CI fails a pull request that changes the plugin without both. It also runs `claude plugin validate`, which must show no warnings, and `claude plugin test`. Changes to tests, the corpus or docs alone need no new version.

## License

[MIT](LICENSE)
