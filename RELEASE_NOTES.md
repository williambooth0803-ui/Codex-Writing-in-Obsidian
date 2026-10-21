Version 1.0.2 changes the default feedback to **Context and deeper understanding**.

Hover comments now explain relevant background, terms and mechanisms, connect ideas to their historical or conceptual context, and offer concrete examples. Already-correct notes can receive useful additions. Comments supply the explanation directly in two to five sentences, rather than asking the writer study questions.

- Added a Context category and direct explanatory feedback.
- Removed study questions from the output schema and rejected question-style responses.
- Hid earlier saved question-style comments without deleting history or dismissals.
- Automatically migrated the previous Understanding focus to the new default. Other settings and the one-time consent choice are preserved.
- Nineteen automated checks pass, including context rendering, legacy-history filtering, and validation that rejects questions while retaining useful explanations.

The three runtime files remain `main.js`, `manifest.json`, and `styles.css`. The manual-install ZIP and SHA-256 checksums are also attached. Requires desktop Obsidian 1.13.7 or later and an installed, signed-in Codex CLI. Reviews send passage text and nearby note context to Codex and use account allowance. The plugin does not rewrite your Markdown or perform sourced fact-checking.
