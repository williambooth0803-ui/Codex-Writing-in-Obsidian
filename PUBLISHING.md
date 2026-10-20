# Release preparation

This repository contains the tested personal beta source. No Obsidian Community Plugins submission or GitHub release has been made.

Before public release:

- Remove the separate runtime schema-file requirement. The standard Obsidian installer downloads `main.js`, `manifest.json`, and `styles.css`, while the current Codex invocation also needs `review-schema.json`.
- Add first-run Codex executable detection and sign-in validation. The current executable default is specific to a Homebrew installation on macOS.
- Choose the publishing author and a source license. The manifest still uses the placeholder `Personal prototype`, and a `LICENSE` file has not yet been added.
- Set the minimum Obsidian version to one supported by evidence. Currently only Obsidian 1.13.7 has been live-tested; the manifest declares 1.5.0.
- Test a fresh installation through the intended installation path and a full class-length writing session.
- Create a matching GitHub release and submit it for review after those items are complete.

See [Obsidian’s submission instructions](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin) and the local [verification report](verification.md).
