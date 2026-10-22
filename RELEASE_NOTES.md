Version 1.0.5 adds **Review selection** and **Ask about this note**.

- Highlight text to change the main button to Review selection. The request includes only eligible highlighted text, including partial paragraphs. The editor right-click menu and command palette also offer selection review.
- Use the speech-bubble action to ask a specific question. Choose selected text or the whole note as context; the dialog shows the amount sent before submission.
- Answers use the note context and general knowledge, with paragraph/bullet formatting and Add controls. They do not browse or claim external verification.
- Questions share the existing request queue and can be stopped. Closing the dialog stops its pending question. Automatic review settings stay unchanged.
- Question context is capped at 60,000 characters; larger contexts require a smaller selection. Frontmatter, fenced code, and hidden comments are omitted.
- Latest answers remain available in memory for the plugin session when context matches. Add an answer to keep it in the note across restarts.
- All 47 automated checks pass. Live synthetic tests took 8.82 seconds for selection feedback and 7.80 seconds for a specific question; timing varies with context and service load.

The three runtime files remain main.js, manifest.json, and styles.css. Requires desktop Obsidian 1.13.7+ and an installed, signed-in Codex CLI. AI requests use account allowance. Note text changes only when you choose an Add control. Native UI validation is deferred to avoid interrupting the user's active Obsidian session.
