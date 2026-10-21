# Verification — release 1.0.1

Validated October 20, 2026, on this Mac with Obsidian 1.13.7, Codex CLI 0.163.0, and Node.js 24.19.0 for development tests.

## Live Obsidian checks (1.0.0 hover implementation)

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

## Release 1.0.1 real Codex regression

The final reviewer implementation repeated the same three-passage automatic benchmark with the embedded temporary schema. All three passages completed in one request after **16.7 seconds total**, including the normal 8-second eligibility delay. Statistics and learning/memory received one useful comment each; the clear music-history passage received none. Actual inputs, outputs, timings, and reported usage are in `benchmark-results-1.0.1.json`.

The release build was also loaded in the existing test vault. Its new settings correctly reported that Codex was installed and signed in, preserved the understanding/reasoning focus and single-note restriction, and migrated the previously authorized test installation. The native accessibility connection timed out after closing settings, so a new 1.0.1 hover screenshot was not captured; the screenshot above documents the unchanged 1.0.0 hover implementation.

## Automated checks

**18 checks passed** for the 1.0.1 release: 13 review-engine checks, 2 integration checks using real CodeMirror with a test DOM, and 3 setup/installation/workload checks:

- Markdown segmentation, list items, CRLF, Unicode offsets, duplicate avoidance, and exclusion of frontmatter, fenced code, and hidden comments.
- Automatic completed-passage review while typing continues, and idle review without a blank line.
- Same-note batching, request throttling, and reported usage accounting.
- Rejection of stale results after editing; correct handling of rename during a request.
- Saved feedback and dismissed state after restart of the engine.
- Excluded-folder, rename, and deletion behavior.
- Pause cancellation and bounded-retry / cooldown reset behavior.
- Exact quote anchors and re-anchoring when other text moves.
- Underline-only rendering, keyboard popover access, Escape, correct dismissal target, and removal of outdated annotations after edits.

- Connection discovery covers missing executables, signed-out accounts, unsupported CLI options, and a supported sign-in.
- A fresh install containing only the three release files runs the bundled reviewer against a synthetic CLI, validates the embedded schema, and confirms the temporary schema is removed.
- An accelerated 60-minute logical workload adds 120 passages, completes 60 synthetic requests, and verifies queue/history bounds, deduplication, folder moves, deletion, and restoration. This is a simulated workload, not 60 minutes of wall-clock classroom use.

## Packaging and limits

The runtime bundle contains the review core, so plugin reloads cannot retain an old separately cached engine. Installation requires only `main.js`, `manifest.json`, and `styles.css`. The manual ZIP contains exactly these files in the plugin folder. The JSON schema is embedded in `main.js`; it is written temporarily for the CLI and removed afterward. Source and development tests remain in the GitHub repository, outside the runtime ZIP. The packager checks manifest versions, license, archive contents, and SHA-256 checksums.

These are measured feasibility and functionality checks, not an hour-long classroom endurance test. This version does not perform sourced fact-checking, rewrite notes, support mobile, or provide feedback in Reading view. Other operating systems and older Obsidian releases have not been live-tested.

## Community directory publication

The entry is public at https://community.obsidian.md/plugins/automatic-paragraph-review with version 1.0.1, MIT licensing, the hover screenshot, and an Add to Obsidian link. Obsidian's completed review reproduced release `main.js` byte-for-byte, found no suspicious network patterns or vulnerable dependencies, and found no obfuscation.

The review also includes advisory filesystem/process capability warnings because the plugin launches the local Codex executable and creates a temporary schema. These operations are disclosed in the README. Other advisories cover CSS compatibility/`:has`, missing optional GitHub artifact attestations, the extra manual ZIP/checksum assets, and the release snapshot's README heading. The heading is corrected in the current source. These advisories did not prevent publication; they are not claims of a clean scorecard or a human security audit.
