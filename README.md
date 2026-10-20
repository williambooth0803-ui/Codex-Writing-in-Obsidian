# Codex-Writing-in-Obsidian

Automatic Paragraph Review for desktop Obsidian.

Automatic study feedback inside desktop Obsidian, using your existing local Codex sign-in. Write normally. Relevant passages receive a subtle dotted underline. Hover, click the underline, or move your text cursor into it to read the feedback. No recurring prompt or chat panel is required.

The default focus is **understanding, reasoning, and possible factual gaps**. Feedback may identify an unsupported inference, ask a useful study question, or flag something to verify. It preserves shorthand and your voice. Factual concerns are not represented as sourced fact checks.

> **Status: beta.** The core workflow has been tested, but this build has not been submitted to Obsidian’s Community Plugins directory. See [release preparation](PUBLISHING.md) for the remaining work.

![Hover feedback in Obsidian](images/hover-feedback.png)

## What is included

- Hover popovers with individual dismissal and keyboard access.
- Automatic review of new or changed prose and list items while you continue writing.
- Review of the current passage after its own idle period, without requiring a blank line.
- Up to three ready passages batched into one request; one request at a time.
- Saved feedback and dismissal state across plugin reloads.
- Rejection of feedback for passages that changed during the request.
- Note rename/deletion handling and folder exclusions.
- Configurable timing, batching, focus, optional standing preferences, and note restriction.
- Pause/resume from the status bar, settings, or command palette.
- Reported token totals and timing, plus timeouts and bounded retries for connection failures.
- No AI-generated text is inserted into your Markdown.

## Defaults

| Setting | Default |
| --- | --- |
| Completed passage eligibility | 8 seconds |
| Passage you are still writing | 30 seconds without changes to that passage |
| Minimum between request starts | 30 seconds |
| Passages per request | Up to 3 from the same note |
| Feedback per passage | Up to 2 useful comments, including zero when appropriate |
| Eligible passage length | 40–5,000 characters |
| Context | Up to 8,000 preceding characters of eligible same-note prose |
| Excluded folders | Templates, Attachments |

The timing is tied to individual passages. You do **not** have to stop writing the rest of the note. The local watcher does not use AI allowance. AI requests use your Codex account allowance. The default request interval caps starts at two per minute; idle, unchanged notes do not generate new reviews.

If several passages are queued, their total wait includes the request interval and previous work. The rate limit can be adjusted in settings. Reported token counts are not a conversion to a subscription percentage or a dollar charge.

## Try it

Install the plugin using the instructions below. Write a paragraph or list item, finish it with a blank line, and continue taking notes. A useful comment appears as a dotted underline; a final unfinished passage is reviewed after its idle period. Opening an existing note does not automatically review all its text.

Hover over an underline, click it, or move the text cursor into it to read feedback. Escape closes a keyboard-opened popover. The command **Automatic Paragraph Review: Show AI feedback at cursor** is also available. Dismiss removes an individual comment and saves that choice until the passage changes. **Dismiss feedback in current note** removes that note's visible comments.

## Manual installation for beta testing

1. Ensure the local Codex CLI works and is signed in: `codex login status`.
2. Create `<vault>/.obsidian/plugins/automatic-paragraph-review/`.
3. Copy **main.js**, **manifest.json**, **styles.css**, and **review-schema.json** into that folder. No package installation or API key is needed to run the plugin.
4. Enable **Automatic Paragraph Review** in Obsidian Community plugins.
5. In its settings, confirm the Codex executable path. The default on this Mac is `/opt/homebrew/bin/codex`.
6. To restrict reviews, set a vault-relative note path or add excluded folders. The default allows eligible notes you edit. For an initial test, restrict it to a disposable sample note.

Feedback is available in editing / Live Preview mode, not Reading view. This release is desktop-only. It has been live-tested on this Mac with Obsidian 1.13.7 and Codex CLI 0.163.0. Other desktop platforms and the oldest declared compatible Obsidian versions have not been live-tested.

## Data and operation

Each review sends selected passage text and nearby preceding prose from the same note to Codex. Frontmatter, fenced code, hidden comments, and quoted/table blocks are excluded from the extracted review context. Eligible changes are reviewed once; opening existing text is a baseline rather than an automatic whole-note upload.

Local feedback, source passage text, dismissals, settings, and aggregate usage metrics are stored in the vault's `.obsidian/plugins/automatic-paragraph-review/data.json`. They may travel with any service you use to sync plugin data. The plugin does not store an API key or copy your Codex credentials. Codex's existing authentication, account limits, and data handling apply.

Requests use an ephemeral `codex exec` process, the CLI's default model and low reasoning, without user configuration. Shell execution, unified execution, connected apps, and web search are disabled for the review process; the sandbox is read-only. This version reviews the supplied text rather than researching sources or browsing your other notes. Timeout: 150 seconds. Connection failures retry up to twice with increasing cooldown. Pause cancels the current process and clears pending work.

Stored history is bounded to 300 passage results and 4,000 reviewed passage identifiers. Very short fragments and ambiguous identical passages are skipped. Large prose blocks above the configured maximum are skipped. Persistent results are tied to the exact source passage; editing it removes outdated feedback and makes the changed passage eligible for a new review.

## Development

Runtime files are already built. Source and tests are included for inspection:

- `main-source.js`: Obsidian interface, hover annotations, preferences, persistence.
- `review-core.js`: Markdown extraction, review queue, Codex client, validation.
- `build.js`: Bundles the core into `main.js`, avoiding stale module caches on plugin reload.
- `review-core.test.js`: Behavioral checks for the review engine.
- `tests/editor-integration.test.js`: Tests using real CodeMirror in a test DOM.
- `benchmark.js`: Makes one real Codex request containing three synthetic passages.

For development, use Node.js 24 or later:

```sh
npm install
npm run build
npm test
npm run benchmark
```

The benchmark consumes Codex allowance and overwrites `benchmark-results.json`. Build and unit tests do not call AI. See [verification.md](verification.md) for observed validation and timing limits.
