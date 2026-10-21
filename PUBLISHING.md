# Publishing

Release 1.0.1 was published on GitHub and in the [Obsidian Community directory](https://community.obsidian.md/plugins/automatic-paragraph-review) under the MIT license, with `williambooth0803-ui` as author. The GitHub Actions workflow verifies the committed bundle, runs all 19 automated checks, validates packaging, and publishes a matching version tag and release when a version is new.

## GitHub release

The release has the standard Obsidian installer assets `main.js`, `manifest.json`, and `styles.css`, plus a manual-install ZIP and SHA-256 checksums. Source is available in the repository and automatic source archives. No API keys, local plugin data, vault notes, or Codex authentication files are packaged.

For a future release, update `manifest.json`, `package.json`, `versions.json`, `CHANGELOG.md`, and `RELEASE_NOTES.md`; build `main.js`; refresh `runtime-checksums.json`; run the tests and packager; then push to `main`. A published version's assets are immutable in this workflow: use a new version for changes.

## Obsidian Community directory

The initial listing was published after GitHub ownership verification and the owner completed the policy/support attestations. Obsidian completed the release review and reproduced `main.js` byte-for-byte. The public page includes the hover-feedback screenshot and an Add to Obsidian link.

For future ownership or listing administration, sign in at [community.obsidian.md](https://community.obsidian.md), connect the GitHub account, and submit this repository:

`https://github.com/williambooth0803-ui/Codex-Writing-in-Obsidian`

Choose the personal account owner. The name, description, desktop restriction, version, and author come from `manifest.json`. Review the developer policies and maintenance commitments personally before submitting. The current listing is public. Review any new release checks when updating it.

Follow [Obsidian's submission instructions](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin). The verified behaviors and remaining platform/classroom testing limits are recorded in [verification.md](verification.md).

Release 1.0.2 updates the existing plugin to explanatory context and examples, removes study questions, and preserves identity, settings, history, and one-time consent. The normal GitHub release workflow publishes the matching version and Obsidian detects the update.
