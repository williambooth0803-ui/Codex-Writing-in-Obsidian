# Verification — version 1.0.0

Validated October 20, 2026, on this Mac with Obsidian 1.13.7, Codex CLI 0.163.0, and Node.js 24.19.0 for development tests.

## Live Obsidian checks

- Enabled the updated plugin only in **Obsidian Review Test**, restricted to **Automatic review demo.md**. The class-note vault was not modified.
- Wrote a synthetic note about rereading and memory, completed the paragraph, and continued writing a new passage without issuing a review prompt or command.
- The first review completed in **14.6 seconds total**: **8 seconds scheduling delay** and **6.6 seconds Codex processing**.
- The relevant phrase received a dotted underline. No paragraph card was inserted, and the note's text remained unchanged by AI.
- Resting the pointer over the underlined phrase displayed the feedback popover. The popover's Close control worked.
- Unloaded and reloaded the plugin through Community plugins. The saved annotation returned without another AI request; recorded successful request count remained unchanged at two.
- Confirmed the focus, timing, batching, exclusions, Codex path, and recorded token totals render in plugin settings.
- A later idle-passage review completed in **42.3 seconds total**, including the idle delay and request throttle. It returned no comments. This is expected queue behavior, not a 42-second model computation.
- Screenshot: [images/hover-feedback.png](images/hover-feedback.png).

## Real automatic batch test

Three synthetic class-note passages became eligible together. The shared production detector, scheduler, Codex client, schema validation, and feedback processing reviewed all three in **one request**.

- Total paragraph-to-result time: **15.44 seconds**, including the 8-second scheduling delay.
- Codex request-to-completed-result time: **7.37 seconds**.
- Statistics: one comment questioning an unsupported causal inference.
- Music history: zero comments on an already clear passage.
- Learning and memory: one useful comment.
- Reported usage for the whole batch: **12,031 input tokens**, **203 output tokens**. Token counts are not a subscription-allowance percentage or a dollar charge.
- Full inputs and actual results: `benchmark-results.json`.

The batch benchmark disables the interval between successive requests for reproducibility. This first batch is unaffected by that setting because no previous request is running. The installed plugin retains its 30-second minimum between request starts.

## Automated checks

**15 checks passed**, comprising 13 review-engine checks and 2 integration checks using real CodeMirror with a test DOM:

- Markdown segmentation, list items, CRLF, Unicode offsets, duplicate avoidance, and exclusion of frontmatter, fenced code, and hidden comments.
- Automatic completed-passage review while typing continues, and idle review without a blank line.
- Same-note batching, request throttling, and reported usage accounting.
- Rejection of stale results after editing; correct handling of rename during a request.
- Saved feedback and dismissed state after restart of the engine.
- Excluded-folder, rename, and deletion behavior.
- Pause cancellation and bounded-retry / cooldown reset behavior.
- Exact quote anchors and re-anchoring when other text moves.
- Underline-only rendering, keyboard popover access, Escape, correct dismissal target, and removal of outdated annotations after edits.

## Packaging and limits

The runtime bundle contains the review core, so plugin reloads cannot retain an old separately cached engine. Installation requires only `main.js`, `manifest.json`, `styles.css`, and `review-schema.json`; source and development tests are included in the release archive.

These are measured feasibility and functionality checks, not an hour-long classroom endurance test. This version does not perform sourced fact-checking, rewrite notes, support mobile, or provide feedback in Reading view. Other operating systems and older Obsidian releases have not been live-tested.
