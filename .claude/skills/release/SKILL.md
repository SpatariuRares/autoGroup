---
name: release
description: Prepare and publish a new autoGroup version - checks, store docs, version bump, tag push that triggers the GitHub release.
disable-model-invocation: true
argument-hint: "[patch|minor|major|x.y.z]"
---

# Release autoGroup

Bump argument: `$ARGUMENTS` (default `patch`). Stop and ask before every step that leaves the machine (push).

## 1. Preconditions

- `git status` clean and on `main`, up to date with `origin/main`.
- `npm run check` passes (`tsc --noEmit && vitest run && wxt build`). Do not continue on a failure.
- List the changes since the last tag: `git log $(git describe --tags --abbrev=0)..HEAD --oneline`.

## 2. Store and docs, only where the changes require it

Go through the commit list and decide, change by change:

| If the release... | Update |
|---|---|
| adds or changes a permission, a host permission, or what is sent to a provider | `docs/store/privacy-practices.md` and `docs/store/privacy.md`. Use the `permissions-privacy-reviewer` agent to check them against the diff |
| adds a user-visible feature or changes the panel/settings UI | `docs/store/listing.md` (it and en) and `README.md`; regenerate screenshots with `npm run store-assets` (macOS/Linux, needs `openssl`) |
| changes architecture or modules | `docs/architecture.md` |

Docs are in English (listing.md also has the Italian text). Commit doc updates separately with a `docs:` message before the bump.

## 3. Bump and tag

```bash
npm version ${ARGUMENTS:-patch} -m "chore: release v%s"
```

This updates `package.json` and `package-lock.json`, commits, and creates the annotated tag `vX.Y.Z`. CI fails if the tag does not match `package.json`, so never tag by hand.

## 4. Push (ask first)

```bash
git push --follow-tags
```

The `Release` workflow (`.github/workflows/release.yml`) runs compile, tests and `wxt zip`, then creates the GitHub release with `.output/*-chrome.zip`. A tag with `-` (e.g. `v1.2.0-beta.1`) becomes a prerelease. Check it with `gh run watch` / `gh release view vX.Y.Z`.

## 5. Chrome Web Store (manual, tell the user)

Upload the zip from the GitHub release in the developer dashboard. If step 2 changed listing or privacy practices, paste the new texts too.
