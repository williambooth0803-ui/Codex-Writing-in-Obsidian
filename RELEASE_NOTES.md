Version 1.0.4 makes hover feedback easy to add to your notes. The AI now chooses **2–5 concise bullet points** when several distinct ideas fit, or a **short paragraph** when a connected explanation works better.

- Click **Add** beside one bullet, **Add all to note** for a group, or **Add to note** for a paragraph.
- Additions appear below the reviewed passage in real Markdown. Existing source text is preserved; normal Obsidian Undo works.
- List-item additions use nested indentation. Duplicate additions are disabled; undoing or removing the inserted text makes it addable again.
- Stale/dismissed feedback and read-only notes cannot be changed through Add controls.
- Adding saved feedback makes no AI request and does not automatically send the inserted text back for review.
- Older saved paragraphs remain addable. Use Run AI assistant to generate fresh feedback in the new formats.
- All 35 automated checks pass, including real CodeMirror button actions, Markdown placement, legacy feedback, and output validation.

The three runtime files remain `main.js`, `manifest.json`, and `styles.css`, with the manual ZIP and SHA-256 checksums attached. Requires desktop Obsidian 1.13.7+ and a separately installed, signed-in Codex CLI. Reviews use Codex allowance. Feedback remains model-generated; uncertain factual additions should be verified.
