---
name: add-message
description: Add or change a UI text in autoGroup's chrome.i18n locales (public/_locales/it and en). Use whenever a component, the manifest or the service worker needs a new user-visible string, or an existing one changes.
---

# Add a UI message

Every user-visible string goes through `t(key, substitutions?)` (`src/shared/i18n.ts`) or `__MSG_key__` in the manifest/HTML. Never hard-code text in components.

## Rules (enforced by `tests/locales.test.ts`)

1. **Both locales, same keys.** Add the key to `public/_locales/it/messages.json` **and** `public/_locales/en/messages.json`. Italian is `default_locale`.
2. **Key format** `^[A-Za-z0-9_]+$` — Chrome refuses to load the extension otherwise. No `-` or `.`.
3. **Prefix.** Keys written literally in code must start with one of `ext`, `action`, `popup`, `panel`, `options`, `onboarding`, `error`, `saveToList`, `userGroup` followed by an uppercase letter (e.g. `panelSiteMoved`). The test scans `src/`, `entrypoints/` and `wxt.config.ts` with that regex to check every used key exists.
4. **Keys built at runtime** follow fixed patterns: `warning_<cause>` (via `warningKey()`, `-` → `_`), `color_<c>`, `provenance_<p>`, `nanoStatus_<s>`, `category_<key>_name` / `_description`. When you add a new cause/color/status, add the matching keys and extend the arrays in the test.
5. **Placeholders** must be the same set in both languages:
   ```json
   "popupTabCount": {
     "message": "$COUNT$ tab",
     "placeholders": { "count": { "content": "$1" } }
   }
   ```
   Call it as `t('popupTabCount', String(n))`.

## Style

- Italian: informal *tu*, short, sentence case; « » for quoted names.
- English: same meaning and tone, not a literal translation; sentence case.
- Match the length of neighbouring strings: side panel space is narrow.
- Keep the key next to related keys in the file (same feature block), in the same position in both files.

## Verify

```bash
npx vitest run tests/locales.test.ts
```
