# autoGroup

Chrome MV3 extension (WXT 0.21, React 19, TypeScript 5.9) that groups the tabs of the current window by site or by topic with a user-chosen AI. Published on the Chrome Web Store.

## Commands

| Command | What |
|---|---|
| `npm run compile` | `tsc --noEmit` (~1.5 s) |
| `npm test` | Vitest, all tests (~1.5 s) |
| `npm run check` | compile + test + `wxt build` — run before saying a change is done |
| `npm run dev` | WXT dev mode with hot reload |
| `npm run smoke` | Build with pre-granted host permissions, then Puppeteer test in Chrome for Testing (`scripts/smoke.mjs`) |
| `npm run build && node scripts/permissions-check.mjs` | Checks that optional permission requests open the Chrome prompt |
| `npm run store-assets` | Regenerates store screenshots in `docs/store/{it,en}/` |
| `npm run theme` | Regenerates `src/ui/md3-tokens.css` (`scripts/generate-theme.mjs`) |

## Architecture in one paragraph

All logic lives in the service worker (`entrypoints/background.ts`) behind the **Organizer** (`src/organizer/index.ts`: `propose / edit / apply / undo / state`). The side panel, options page and onboarding are React UIs that talk to it only through `src/shared/messages.ts` / `organizer-client.ts`. AI adapters in `src/ai/` have no dependency on the Organizer. Full map and design decisions: `docs/architecture.md`. Performance notes: `docs/performance.md`.

## Conventions

- **Language**: code comments, test names (`describe`/`it`) are in **Italian**. Docs (`README.md`, `docs/`) are in **English**. Commit messages: Conventional Commits in English (`feat:`, `fix:`, `docs:`, `refactor:`, `chore: release vX.Y.Z`).
- **UI text**: never hard-coded; always `t(key)` from `src/shared/i18n.ts`, with the key in **both** `public/_locales/it` and `en` (see the `add-message` skill; `tests/locales.test.ts` enforces it).
- **Tests**: one seam — the Organizer's public interface. Set up the tab strip with the fakes in `tests/` (`fake-tab-strip`, `fake-network`, `fake-nano`, `fake-scripting`, `fake-i18n`), call the Organizer, assert on the proposal or on the resulting groups. Don't test internal module calls. Read `docs/test.md` before adding a test file.
- **UI**: Material 3 via `src/ui/md3-tokens.css` + `base.css` (`--md-sys-*` tokens); icons via `src/ui/Icon.tsx` (Material Symbols SVG). No CSS framework.
- **Permissions**: host permissions are optional and requested at runtime; `permissions.request` must be called synchronously inside the click handler, before any `await`. Any change to permissions or to what is sent to a provider must also update `docs/store/privacy-practices.md` and `privacy.md` (use the `permissions-privacy-reviewer` agent).
- **API keys** live in `storage.local` only, never `storage.sync`.
- Don't edit generated files: `package-lock.json`, `.output/`, `.wxt/`, `src/ui/md3-tokens.css` (use `npm run theme`).

## Release

Use the `/release` skill. In short: `npm run check` → update store docs if needed → `npm version <bump> -m "chore: release v%s"` → `git push --follow-tags`; CI (`.github/workflows/release.yml`) builds the zip and creates the GitHub release. Store upload is manual.
