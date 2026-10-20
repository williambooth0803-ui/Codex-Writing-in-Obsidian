Automatic Paragraph Review brings automatic study feedback to desktop Obsidian through your existing local Codex sign-in.

Write normally. Feedback appears as dotted underlines with hover, click, and keyboard popovers. Reviews focus on understanding, reasoning, and possible factual gaps. Notes are never rewritten.

- Install only `main.js`, `manifest.json`, and `styles.css`, or extract the manual-install ZIP into your vault's `.obsidian/plugins/` folder.
- Enable the plugin, open its settings, then choose **Connect and enable** once. Codex CLI must already be installed and signed in. No separate API key is required by the plugin.
- Requires desktop Obsidian 1.13.7 or later. Live-tested on macOS with Codex CLI 0.163.0; other desktop platforms are not yet live-tested.
- Completed passages normally become eligible after 8 seconds, with a 30-second minimum between request starts. Existing measurements returned a first batch in about 15 seconds; delays vary with account limits and queued work.
- Reviews send passage text and nearby same-note context to Codex and consume account allowance. Feedback and source text are saved locally in plugin data. Factual concerns are suggestions to verify, not sourced fact checks.

This release includes executable detection, first-run opt-in, an embedded schema, saved dismissals, stale-result rejection, folder rename/delete handling, and bounded retries/history. Eighteen automated checks pass, including a fresh three-file install and an accelerated class-length workload. The earlier live hover workflow and real Codex timings are recorded in `verification.md`.

The GitHub release can be installed manually. Availability through Obsidian's Community directory requires separate review and approval.
