# autoGroup documentation

Technical documentation of the extension.

- [Architecture](architecture.md): modules, data flow, state and messages.
- [Tests](test.md): how the Organizer and the tab strip simulator are tested.
- [Performance](performance.md): how we made the extension faster (by-site preview, cache, Generator and Gemini Nano), with the measurements.
- [Chrome Web Store](store/README.md): listing, privacy policy, answers for the review, images and steps to publish.

For the requirements see [PRD.md](../PRD.md); for usage see the [README](../README.md).

## Commands

| Command | What it does |
|---|---|
| `npm install` | Installs the dependencies and generates WXT's types (`wxt prepare`). |
| `npm run dev` | Starts WXT in development mode with automatic reloading. |
| `npm run build` | Builds the extension into `.output/chrome-mv3`. |
| `npm test` | Runs the Vitest tests. |
| `npm run compile` | Typecheck with `tsc --noEmit`. |
| `npm run check` | Typecheck, tests and build in sequence. |
| `npm run smoke` | Build, then automated test in Chrome for Testing (Puppeteer). |
| `npm run store-assets` | Screenshots, tiles and icon for the Chrome Web Store in `docs/store/`. |
| `npm run zip` | Zip of the normal build to upload to the store. |
| `node scripts/permissions-check.mjs` | After `npm run build`: checks that the optional permissions are requested inside the user gesture. |

To load the extension by hand: `npm run build`, then `chrome://extensions` → "Developer mode" → "Load unpacked" → folder `.output/chrome-mv3`.

### Releasing

Pushing a `vX.Y.Z` tag runs [`.github/workflows/release.yml`](../.github/workflows/release.yml): it checks that the tag matches the `package.json` version, runs typecheck and tests, builds the zip and publishes a GitHub release with the zip attached and auto-generated notes. Tags with a suffix (`v1.0.0-beta.1`) become pre-releases.

```sh
npm version patch        # or minor / major: bumps package.json and creates the tag
git push --follow-tags
```
