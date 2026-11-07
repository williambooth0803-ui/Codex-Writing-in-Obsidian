Version 1.0.6 fixes unnecessary waiting during Obsidian startup.

- Plugin loading no longer waits for Codex executable, help, or sign-in checks.
- Enabled automatic reviews check their connection in the background after the workspace is ready.
- Paused installations perform no startup CLI check. Explicit AI actions still check the connection when needed.
- Concurrent checks share one task; delayed results cannot resume an unloaded plugin.
- Notes without feedback avoid unnecessary parsing.
- All 52 tests pass, including startup with a deliberately non-resolving connection check, deferred automatic startup, explicit on-demand use, failures, and unload behavior.

For iCloud vaults, use Finder's Keep Downloaded on the plugin folder so runtime files and saved data stay local. The code fix removes the CLI startup wait; it cannot prevent a cloud provider from evicting plugin files before Obsidian can read them. This update preserves saved settings and feedback.

Desktop Obsidian 1.13.7+ and a separately installed, signed-in Codex CLI are required for AI features. Reviews use account allowance. The three runtime files remain main.js, manifest.json and styles.css.
