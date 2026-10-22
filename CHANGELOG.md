# 1.0.4

- Added note-ready feedback as 2–5 bullet points or a short explanatory paragraph, chosen to fit the material.
- Added Add to note, individual-bullet Add, and Add all to note controls in hover cards.
- Inserted additions below the reviewed source with Markdown list indentation and normal editor Undo support.
- Prevented duplicate additions, refused stale/dismissed feedback and read-only edits, and baselined inserted AI text to avoid automatic self-review.
- Kept legacy saved paragraph feedback addable without changing history or preferences.
- Added eight checks for output validation, insertion placement, duplicate/partial additions, read-only notes, and real CodeMirror actions.

# 1.0.3

- Added a Run AI assistant button to each note header and a matching command for whole-note reviews on demand.
- Added progress, cancellation, explicit rereview, and partial feedback as batches complete.
- Included headings, short bullets, blockquotes, and tables in explicit reviews; split long text and shared feedback across identical passages.
- Kept automatic pause/resume and folder restrictions unchanged; explicit runs can review the current excluded note.
- Serialized manual and automatic requests and discarded feedback for text changed during a run.
- Added eight automated checks for extraction, UI actions, queue coordination, cancellation, failure, and edits.

# 1.0.2

- Changed default feedback to context, explanations, conceptual/historical connections, and concrete examples that deepen understanding.
- Added context comments for already-correct passages; corrections are no longer the only useful intervention.
- Removed study questions from generation and rejected question-style output before rendering.
- Hid earlier saved question-style comments without deleting feedback history or dismissals.
- Migrated the old Understanding focus to Context and deeper understanding, preserving other preferences.
- Updated hover labels, standing-preference examples, and release documentation.

# 1.0.1

- Added a self-contained three-file release with embedded schema and temporary-file cleanup.
- Added Codex executable discovery, required-option checks, and sign-in validation.
- Added first-run opt-in; automatic requests stay disabled until setup completes.
- Added folder rename/delete handling and zero-context configuration support.
- Set the minimum Obsidian version to the live-tested 1.13.7.
- Added MIT licensing, reproducible release packaging, checksums, locked development dependencies, and CI release checks.
- Added fresh-install and accelerated class-length workload tests.

# 1.0.0

- Replaced paragraph cards with dotted text underlines and hover popovers.
- Added click and cursor access, Escape/Close, and individual comment dismissal.
- Added saved feedback, saved dismissals, and bounded local history.
- Added automatic handling of list items and an idle final passage.
- Added same-note batching, request throttling, usage totals, and retry cooldowns.
- Added review focus, optional preferences, folder exclusions, and configurable scheduling.
- Added exact quote validation, safer same-note context extraction, note rename/deletion handling, and cancellation.
- Bundled runtime code so plugin reloads use the current review engine.
