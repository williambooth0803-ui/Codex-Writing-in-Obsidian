# Publishing

Release 1.0.1 is prepared for the public repository under the MIT license, with `williambooth0803-ui` as author. The GitHub Actions workflow verifies the committed bundle, runs all 18 automated checks, validates packaging, and publishes a matching version tag and release when a version is new.

## GitHub release

The release has the standard Obsidian installer assets `main.js`, `manifest.json`, and `styles.css`, plus a manual-install ZIP and SHA-256 checksums. Source is available in the repository and automatic source archives. No API keys, local plugin data, vault notes, or Codex authentication files are packaged.

For a future release, update `manifest.json`, `package.json`, `versions.json`, `CHANGELOG.md`, and `RELEASE_NOTES.md`; build `main.js`; refresh `runtime-checksums.json`; run the tests and packager; then push to `main`. A published version's assets are immutable in this workflow: use a new version for changes.

## Obsidian Community directory

A GitHub release does not automatically create a Community directory listing. The owner must sign in at [community.obsidian.md](https://community.obsidian.md), connect the GitHub account, and submit this repository:

`https://github.com/williambooth0803-ui/Codex-Writing-in-Obsidian`

Choose the personal account owner. The name, description, desktop restriction, version, and author come from `manifest.json`. Review the developer policies and maintenance commitments personally before submitting. Obsidian review and approval determine when the plugin becomes installable from its built-in directory.

Follow [Obsidian's submission instructions](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin). The verified behaviors and remaining platform/classroom testing limits are recorded in [verification.md](verification.md).
