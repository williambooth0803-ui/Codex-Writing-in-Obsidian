Version 1.0.3 adds **Run AI assistant** at the top of each note. Click it to review the whole current note on demand, including existing text, headings, short bullets, blockquotes, and tables. Feedback appears in the same hover cards as each batch completes.

- Shows progress and a **Stop AI assistant** button during a run.
- Works while automatic reviews are paused and leaves automatic settings unchanged.
- Explicitly reviews the current note even when automatic folder or filename restrictions exclude it.
- Splits long passages, shares feedback across identical passages, and skips passages changed during a request.
- Runs one request at a time, waiting for any current automatic request before starting. Explicit runs bypass automatic idle and interval delays.
- Preserves completed feedback if the run is stopped or fails.
- All 27 automated tests pass, including real CodeMirror integration and the note-header action.
- A live whole-note test reviewed three synthetic passages in 9.90 seconds with automatic reviews paused. Timing varies by note, model, and service load.

The three runtime files remain `main.js`, `manifest.json`, and `styles.css`. The manual-install ZIP and SHA-256 checksums are attached. Requires desktop Obsidian 1.13.7 or later and an installed, signed-in Codex CLI. Reviews send passage text and nearby note context to Codex and use account allowance. The plugin does not rewrite Markdown or perform sourced fact-checking.
