# Changelog

All notable changes to model-advisor. Versions follow [Semantic Versioning](https://semver.org). Below 1.0, a minor version may change how prompts are read or what the log keeps.

## [0.4.0] - 2026-10-23

### Added

- Fable awareness. Fable bills to usage credits, so a new `fable` setting decides when it is offered:
  - `check` (the default): offered only once a request on it has answered, or the session already runs on it. Until then a deep prompt is offered Opus at xhigh, and the band says Fable needs usage credits.
  - `yes`: always offered. `no`: never offered.
  - Your organization's `availableModels` list is respected.
- A safety net for Fable. When a request the advisor sent on Fable gets no answer and the turn ends in an error, the advisor drops Fable, goes back to the session's own setup, says so, and stops offering Fable. An interrupt does not count.
- `/advise fable` says whether Fable is offered and why. `/advise fable yes` and `/advise fable no` set it for every session. `/advise fable check` goes back to checking.
- Advisor awareness. The plugin reads `advisorModel` from your settings (`/advisor`):
  - When the advisor is at least as strong as the model a step up would buy, the band stays on your setup and says the advisor covers the hard calls. No switch, no re-cache.
  - When a switch would move the main model above the advisor, the band says the switch turns the advisor off. Claude Code drops it without a word.
  - A long run is not offered a model the advisor already brings in.
  - `/advise` names the advisor, says when it is off because it ranks below the main model, and counts its calls in the last turn.
  - The log keeps the advisor and its calls for each prompt.

### Changed

- Fable is no longer offered by default. Set `fable` to `yes`, or run `/advise fable yes`, if you have usage credits.

## [0.3.0] - 2026-10-17

### Changed

- The band offers a cheaper setup only when the switch pays for itself. A switch re-caches the whole conversation on the new model, so on a long session a one-prompt switch often costs more than it saves. The band then says it is staying put, without a button. `/advise` says what the re-cache would cost.
- A stronger model or a higher effort is offered only when the re-cache is no more than a quarter of what the turn costs on it. On a long session, a one-prompt step up from Opus at medium to high is no longer offered.

## [0.2.1] - 2026-10-14

### Fixed

- The band above the prompt no longer hides other mods that draw there. The advisor's advice sits on top, and whatever the other mods and Claude Code draw stays under it.

## [0.2.0] - 2026-10-13

First public release.

### Added

- Session-aware reading:
  - A short prompt that points back at the last one ("add a test for it") is read no more than one tier below it.
  - A turn that ran long, hit 3 or more tool errors, or ended in an error makes the next related prompt one tier harder.
  - After such a turn, auto mode only moves chores to a cheaper setup.
  - `/clear` forgets the session so far.
- Prompt log, off by default. Turn it on with the `log` option.
  - It keeps your newest 400 prompts on your machine, with how each was read and how its turn went.
  - Secrets are masked before saving.
  - Commands: `/advise log`, `/advise label <tier>`, `/advise export [path]` and `/advise log clear`.
- `scripts/calibrate.ts` replays an exported log through the current rules and reports where they disagree with your labels.
- Regression corpus of 165 labelled prompts. Any change to how a prompt is read fails the tests until it is argued for.
- MIT license.

### Changed

- Recalibrated how prompts are read. On prompts never used for tuning, exact tier went from 66% to 86%, and reads two or more tiers off fell from 4 to 1.
- The marketplace is now `mmediavilla`, so the plugin installs as `model-advisor@mmediavilla`. If you installed the private build as `model-advisor@my-mods`, uninstall it and install again with the command in the README.

## [0.1.0] - 2026-10-12

First version, not published.

- Reads each prompt and suggests a model and effort in a band above the prompt and through `/advise`.
- `suggest`, `auto` and `off` modes, and a mid-turn check for runs that go long.
