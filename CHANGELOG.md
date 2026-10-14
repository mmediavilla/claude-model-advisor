# Changelog

All notable changes to model-advisor. Versions follow [Semantic Versioning](https://semver.org). Below 1.0, a minor version may change how prompts are read or what the log keeps.

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
