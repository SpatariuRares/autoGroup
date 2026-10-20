---
name: add-message
description: Add or change a UI text in autoGroup's chrome.i18n locales (every folder of public/_locales). Use whenever a component, the manifest or the service worker needs a new user-visible string, or an existing one changes or stops being used.
---

# Add a UI message

Every user-visible string goes through `t(key, substitutions?)` (`src/shared/i18n.ts`) or `__MSG_key__` in the manifest/HTML.

## Add a key

Run the script; it writes the key into every locale folder right after a related key, leaving the rest of each file byte-for-byte as it was, and refuses if a locale's text is missing:

```bash
node scripts/add-message.mjs panelSortTabs --after panelSortGroups \
  --it "Ordina le tab dalla A alla Z" --en "Sort tabs A to Z" --es "…" --fr "…" --de "…" \
  [--placeholders '{"count":{"content":"$1"}}']
```

## Change or remove a key

The same script changes a text in every locale (placeholders kept unless `--placeholders` is given), or removes a key the code no longer uses (the test flags it). Both leave the rest of each file byte-for-byte as it was:

```bash
node scripts/add-message.mjs popupSaveToList --set --it "Aggiungi alle categorie" --en "Add to categories" --es "…" --fr "…" --de "…"
node scripts/add-message.mjs panelReadOnly --remove
```

## Rules (enforced by `tests/locales.test.ts`)

1. **Every locale, same keys.** All folders of `public/_locales/` (today it, en, es, fr, de) carry the same keys; Italian is `default_locale`.
2. **Every key used.** A key appears quoted (or as `__MSG_key__`) in `src/`, `entrypoints/` or `wxt.config.ts`, or follows a runtime pattern (rule 5).
3. **Key format** `^[A-Za-z0-9_]+$`: Chrome refuses to load the extension otherwise.
4. **Prefix.** Keys written literally in code start with `ext`, `action`, `popup`, `panel`, `options`, `onboarding`, `error`, `saveToList` or `userGroup` followed by an uppercase letter (e.g. `panelSiteMoved`); the test finds used keys with that regex.
5. **Keys built at runtime** follow fixed patterns: `warning_<cause>` (via `warningKey()`, `-` → `_`), `color_<c>`, `provenance_<p>`, `nanoStatus_<s>`, `category_<key>_name` / `_description`. A new cause/color/status gets its keys and an entry in the test's arrays.
6. **Placeholders**: the same set in every locale, e.g. `"message": "$COUNT$ tab", "placeholders": { "count": { "content": "$1" } }`, called as `t('popupTabCount', String(n))`.

## Style

- Italian: informal *tu*, short, sentence case; « » for quoted names.
- English, Spanish, French, German: same meaning and tone, not a literal translation; sentence case. Spanish *tú*, German *du*, French *vous*.
- Match the length of neighbouring strings: side panel space is narrow.

## Verify

```bash
npx vitest run tests/locales.test.ts
```
