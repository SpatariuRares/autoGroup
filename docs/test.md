# Tests

## Principle

A single seam: **the Organizer's interface** (`propose`, `apply`, `state`, and later `undo`). The tests set up the tab strip, call the Organizer and check what comes out (the proposal) or what is left in the browser (groups and tab order). They do not check how the internal modules call each other.

`tests/organizer.test.ts` is the model test for all subsequent issues.

## Environment

- **Vitest** with the `WxtVitest` plugin, which replaces `wxt/browser` with WXT's fake browser (`@webext-core/fake-browser`). Storage (`session`, `sync`, `local`) and `runtime` come from WXT's fake.
- **`tests/fake-tab-strip.ts`**: WXT's fake knows nothing about groups, pinned tabs or positions. The simulator keeps the ordered list of tabs for each window and replaces `tabs.query/get/remove/group/ungroup/move` and the whole of `tabGroups` with Chrome-like behavior:
  - `tabs.group` without `groupId` creates a group at the position of the first tab and moves the others next to it; with `groupId` it adds the tabs at the end of the group;
  - `tabs.ungroup` moves the tab right after the end of the group;
  - `tabs.move` puts a tab into a group when it lands between two of the group's tabs, and takes a tab out of a group when it is no longer next to any tab of the group;
  - groups left empty disappear; grouping a pinned tab is an error.
- **`tests/fake-i18n.ts`**: WXT's fake does not implement `i18n`. This fake reads the real `public/_locales/<lingua>/messages.json` files and implements `getMessage` (with placeholders) and `getUILanguage`. Every test starts in Italian; `installFakeI18n('en')` switches to English.
- **`tests/fake-network.ts`**: `installFakePermissions(concessi)` replaces `permissions` (not implemented by WXT's fake); `installFakeFetch(...risposte)` replaces `fetch` with a queue of responses (or errors, or functions) and records the URL, headers and body of every request; `openAiReply(contenuto)` and `httpError(status)` build responses in the OpenAI format.
- **`tests/fake-nano.ts`**: stub of the global `LanguageModel` object with the four availability states, a configurable context window (one "token" every 4 characters), `measureContextUsage`, `clone`, and a function that answers every prompt while recording system prompt, options, tabs and schema.
- **`tests/setup.ts`** (in `setupFiles`): before every test it shortens `TIMINGS` (200 ms timeout, 1 ms wait before the retry), so timeouts and retries are tested without actually waiting.
- `installFakeFetch` honors the request's signal like the real `fetch` (a hanging request fails as soon as the signal is aborted) and records the signal; `HANG` is a response that never arrives.
- **`tests/fake-scripting.ts`**: replaces `scripting.executeScript` (not implemented by WXT's fake); each tab has its own fake page with a description and an optional delay (`Infinity` = never answers); a tab without a page simulates an inaccessible page. It records the tabs that were read.
- Test helpers: `addTab`, `addGroup`, `closeTab`, `groupsIn()` (groups with their tabs' titles, in order) and `layout()` (the strip as a list of titles).

## Scenarios covered (AG-01)

- Grouping by domain: name without `www.`, provenance `domain`, query and fragment ignored.
- The 2-tab rule.
- Selection: current window, pinned tabs, already grouped tabs, internal pages, tabs without a title or with a title equal to the URL.
- Colors rotating among those free in the window.
- No change to the strip before "Apply".
- Persistence of the proposal (a new Organizer finds it again).
- Two simultaneous requests produce a single computation.
- "Apply": groups with name and color, existing groups untouched, tabs closed in the meantime skipped, proposal cleared.

## Scenarios covered (AG-02)

- "Undo" not available before "Apply", available after.
- Mixed strip (pinned tab, user group, ungrouped (free) tabs from several domains): apply and then undo restores exactly the initial strip and dissolves the groups created.
- Tab closed between "Apply" and "Undo": ignored without errors, the others go back to their place.
- Tab opened after "Apply": stays at the end, is not touched.
- Group renamed by the user after "Apply": is not renamed back.
- "Undo" survives a new proposal and applies only to the last applied operation.

## Scenarios covered (AG-03)

- "Apply" after renaming, changing a color, moving a tab, removing a tab and discarding a group creates exactly the modified groups; the removed or discarded tabs stay ungrouped.
- A group emptied by moves disappears from the proposal.
- The edits stay in the state and a new Organizer (panel reopened) finds them again.
- Edits to non-existent groups or tabs are ignored.
- Every group has a provenance and tabs.

## Scenarios covered (AG-04)

- Defaults (minimum 2, no excluded domain) and saving to `storage.sync`.
- Minimum 3: a domain with 2 tabs does not form a group. Minimum 1: even a single tab forms a group.
- A changed minimum applies to the next proposal; non-integer values or values below 1 are rejected.
- Excluded domains: the domain and its subdomains are excluded (`google.com` → `mail.google.com`, `www.google.com`), not domains that end with the same text (`notgoogle.com`); after "Apply" the excluded tabs stay ungrouped.
- Normalization of domains typed by the user.

## Scenarios covered (AG-R1)

- A proposal requested during "Apply" does not erase the snapshot for "Undo".
- When the panel is reopened the proposal is recomputed if the ungrouped tabs have changed, and kept (with its edits) if they have not.
- The state always indicates the window.

## Scenarios covered (AG-05)

- On first run, the 10 default categories in Italian, with description and color; in English with the browser in English.
- Adding, editing (name with whitespace cleaned up, color), deleting and reordering; the list ends up in `storage.sync`.
- Duplicate names (case and whitespace ignored) and empty names rejected, without saving anything.
- "Restore defaults" brings back the initial list; an empty list is allowed.
- Editing the categories makes a saved proposal no longer current.

## Scenarios covered (AG-06), in `tests/generator.test.ts`

- Assignment to a category (fixed color), to an open group (even one tab, the group's name and color) and to a new group (first free color), with the provenances.
- Privacy on the real request: only short IDs, titles and cleaned URLs; no query, fragment, credentials, Chrome IDs or tabs from excluded domains.
- Options: categories plus open groups, case-insensitive name matching, description "Group created by the user".
- Request contract: URL `/chat/completions`, `Bearer`, model, `json_schema`, browser language.
- Retry without structured output after a 400; response in a ```json block.
- Validation: non-existent IDs, duplicate tabs, empty names or names longer than 2 words.
- Rules: minimum for new groups and categories, not for existing groups.
- "Apply" extends an existing group without changing its name and color; "Undo" brings it back to its original composition.
- Fallback to domain with a warning for 500, 401, 429, network error, unreadable JSON and JSON outside the schema.
- Missing host permission: no request, proposal by domain, `no-permission` warning.
- The API key lives in `storage.local` and never in `sync` or in the session state.

## Scenarios covered (AG-07), in `tests/nano.test.ts`

- No Generator configured and Nano available: Nano used with the JSON schema, no network request, same cleaned data, browser language.
- The configured Generator takes precedence over Nano; one configured without permission gives way to Nano with the warning.
- Nano to be downloaded, downloading or not supported: proposal by domain, Nano never used, warning in the first two cases; without the Prompt API no warning.
- Splitting into chunks with a small context: all tabs sent exactly once, the name invented in the first chunk among the options of the second, groups with the same name merged.
- Nano failing: proposal by domain with a warning.
- Same validation as the other Generators.

## Scenarios covered (AG-08), in `tests/classifier.test.ts`

`installFakeFetch` receives a function that answers according to the URL: `/v1/systemone` in the System One format (`systemOneReply`), `/chat/completions` in the OpenAI format.

- Contract: `POST /v1/systemone`, `state` with only the cleaned tab, `questions.group` of type `choice` with the options (categories and open groups) as `criteria` plus `none_of_the_above`; `Bearer` only with the key; `model` only if filled in (Jev).
- At most 255 options in the `criteria`.
- Row 2: assignment above the threshold, uncertain tabs and category below the minimum left ungrouped, single tab in an existing group.
- Configurable threshold.
- Row 1: only the remaining tabs reach the Generator, in "new only" mode; a new group of a single tab is dissolved; a tab already assigned in step 1 cannot be moved by step 2.
- No call to the Generator when no tabs remain.
- Step 2 failing: remaining tabs left ungrouped, warning.
- Classifier failing: row 3 with a warning; without a Generator, row 4.
- Missing permission: no request, warning.
- Strategies: `batch` (one request, one question per tab, same result), concurrency limit of `per-tab`, unknown choice or "none".

Mutation test: removing the comparison with the threshold makes 3 tests fail; calling step 2 even with no remaining tabs makes 1 fail.

## Scenarios covered (AG-R2)

- Long names accepted when they are those of an open group or a category.
- Without options the Classifier is not queried.
- Step 2 does not start with fewer remaining tabs than the minimum.
- Smoke test: no query, fragment, excluded tab or Chrome ID in the System One requests.

## Scenarios covered (AG-09), in `tests/save-to-list.test.ts`

- The category takes the group's current name and color (after renaming and a color change) and the generated, cleaned description; the description receives the name and examples with cleaned URLs; the group becomes "list".
- The proposal stays valid when the panel is reopened.
- Generator failing: empty description and warning.
- Name already present (different case): no duplicate, warning.
- Only "new AI" groups.
- The saved category is among the options of the next organization.
- A later edit removes the warning.

## Scenarios covered (AG-10), in `tests/errors.test.ts`

- Retry after 429, 529, 500, 503 with the second response used; a single retry (two errors → next level with the right warning); no retry after 401, 403, 422, network error and timeout; also for the Classifier.
- Timeout of the Generator (→ domain) and of the Classifier (→ Generator), with the "timeout" warning.
- Non-JSON responses, without `choices`, outside the schema, System One without `answers`: "invalid response" warning.
- "Stop": requests aborted, no proposal, warning; it also stops the wait before the retry; afterwards you can recompute and "Undo" remains; with no computation in progress nothing changes.
- Classifier and Generator both failing: proposal by domain with two warnings.

## Scenarios covered (AG-11), in `tests/descriptions.test.ts`

- Option on and permission granted: cleaned descriptions sent to the Generator and, in the `state`, to the Classifier; pages without a description keep title and URL.
- Permission denied or option off: no page read.
- Suspended tab: not read.
- Page that does not answer: after ~500 ms only title and URL for that tab, without slowing down the others.
- Web Store (old and new) and PDFs skipped; an inaccessible page does not block the others.
- Excluded domains never read.
- Without AI (grouping by domain) no page read.

`tests/locales.test.ts` checks that Italian and English have the same keys and that they are all in the format accepted by Chrome (`[A-Za-z0-9_]`).

## Scenarios covered (AG-12), in `tests/locales.test.ts`

- Every key written in the code (`t('…')`, error and warning keys, `__MSG_…__` in the manifest and in the HTML) exists in the translations. The test reads the sources of `src/`, `entrypoints/` and `wxt.config.ts` and recognizes the keys by the prefixes used in the translation files.
- The keys composed at runtime exist: warnings for every cause, 9 colors, 4 provenances, 4 Gemini Nano states, name and description of the 10 default categories.
- Italian and English use the same placeholders (`$PROVIDER$`, `$NAME$`, …).

Mutation test done by hand: changing `t('popupSaveToListHint')` to a non-existent key makes the test fail, naming the key.

Mutation test done by hand: removing the discarding of duplicate tabs or the permission check makes the corresponding test fail.

## Scenarios covered (AG-R3)

- `tests/classifier.test.ts`: in `per-tab` mode, at the first error no further requests start and those in progress are aborted (10 tabs, 3 in parallel: 3 requests).
- `tests/errors.test.ts`: "Stop" also halts a computation still in the queue, which makes no requests; two requests for the same window share the computation; one for another window receives its own proposal; "Recompute" during a computation starts a new one.
- `tests/nano.test.ts`: a `clone()` error becomes `invalid-request`; the maximum time applies to each chunk (two 120 ms chunks with a 200 ms limit succeed). The fake `prompt` now honors the abort signal, like the Prompt API.
- `tests/save-to-list.test.ts`: a tab opened while the description is being generated makes the proposal expire.

Every new test was checked with a mutation: putting back the old behavior makes it fail.

## Scenarios covered (by-site preview and timings), in `tests/preview.test.ts`

- While the AI is computing, the announced state is `computing` with the by-site proposal in `preview`; the AI proposal replaces it and `preview` disappears.
- "Use this": request aborted, by-site proposal in `ready`, without a warning, editable and applicable; when the panel is reopened it is reused without new requests; with no computation in progress nothing changes; a queued computation without a preview ends as with "Stop".
- "Stop" stays as it was: no proposal, not even the preview.
- No preview in by-site mode or without usable AI levels.
- Timings: phases measured with the Generator, with the Generator failing (also `domain`) and in by-site mode; the stopwatch with a fake clock.
- Mutation test: without the preview 4 tests fail.

## Scenarios covered (cache, faster Generator and Gemini Nano), in `tests/speed.test.ts`

- Classifier cache: opening a tab classifies only that tab, with the same result; "Recompute" and changing the threshold make no requests; changing a category's description or the model reclassifies everything; an unreadable response is not remembered; after an error nothing is left in the cache.
- Description cache: a new computation reads only the new pages; a slow or inaccessible page is retried; a suspended tab finds the description of the same URL again without being read.
- `createSessionCache`: beyond the limit the oldest entries are evicted, a rewritten entry becomes the most recent again.
- Generator: `max_tokens` sent; truncated response → "invalid response" and domain; after a 400 the retry has neither schema nor cap; in "new only" the options are sent by name only.
- Gemini Nano: base session created once and reused; with the Classifier the session already exists while the Classifier is working; a failed creation (including the early one) and a broken session are not reused.
- The Generator's privacy test searched for "token" in the whole request and now found it in `max_tokens`: it searches for `token=abc` and `abc`.
- Mutation tests on 16 points of the new code: each one makes at least one test fail.

## Scenarios covered (first-run guide), in `tests/onboarding.test.ts`

- Steps of the guide with AI (welcome, mode, Generator, Classifier, summary) and by site (without the providers).
- On first install a tab opens with `onboarding.html`; after an update of the extension, of Chrome or of a shared module, it does not.
- The translations test also checks the keys with the `onboarding` prefix.
- Smoke test: the guide opened on install can be followed to the end (5 steps with AI, with the Generator and Classifier sections), the summary shows the three levels and the "Gemini Nano is not supported" notice; switching to "By site" the steps become 3. Screenshots of the Generator step and of the summary.

## Scenarios covered (provider permissions and `<all_urls>`), in `tests/permissions.test.ts`

With a fake `permissions` that reproduces Chrome's worst case (a host already covered by `<all_urls>` is granted without being registered):
- when descriptions are turned off, the provider hosts left without permission are requested again, all in one request;
- if Chrome had registered them, nothing is requested;
- if the user refuses, the hosts left without permission are returned;
- without providers on a server, only `<all_urls>` is removed.
- Mutation test: without the new request 2 tests fail.

Smoke test: "Open the panel" in the guide really opens the side panel (target `sidepanel.html`); in the settings the "Buy me a coffee" button points to Buy Me a Coffee and is visible at 800 px (at the bottom) and at 1280 px (in the menu).

## Testing in Chrome

`npm run smoke` builds and runs `scripts/smoke.mjs`: it opens Chrome for Testing with the extension loaded, opens pages served by a local server on `localhost` and `127.0.0.1` (two different domains), opens the side panel as a page (`sidepanel.html`), reloads the panel to verify that the proposal stays, renames a group, changes its color and moves a tab (saving a screenshot to `scripts/smoke-popup.png`), reloads again to verify that the edits stay, presses "Apply", then "Undo last organization" and checks that tab order and groups go back to how they were; finally it opens the options page, tests the Categories section (duplicate name rejected, rename, add, reorder, restore, checking `storage.sync`), sets the minimum to 3 and excludes `127.0.0.1` (screenshot in `scripts/smoke-options.png`), checks `storage.sync` and recomputes the proposal. It prints the groups created and any console errors from the service worker and the panel.

Then the script turns on "Read page descriptions" in the Privacy section, recomputes and checks that the fake Generator receives the meta descriptions read from the pages with `chrome.scripting`, then turns the switch off.

Finally the script configures the Classifier (Custom preset pointing to a fake System One endpoint on the same server), saves it, tests the connection and recomputes: the proposal comes from the Classifier, with no calls to the Generator and no warnings.

`scripts/measure-classifier.mjs` is not part of the smoke test: it measures the Classifier's two strategies on a real System One server (see the architecture).

The script also reads the Gemini Nano status shown in the settings. In headless Chrome for Testing the Prompt API exists in the extension's service worker, but the model is reported as "not supported": the path with Nano available is covered only by the stub and must be tested by hand in a Chrome that supports Gemini Nano.

After the settings, the script configures the Generator from the interface (Custom preset pointing to a fake OpenAI-compatible server inside the script itself), saves it, presses "Test connection", checks that the key is in `storage.local` and not in `sync`, recomputes the proposal ("new AI" group), presses "Save to list" and checks the category saved in `storage.sync`, checks that the requests contain no query, fragments or excluded tabs, then makes the server fail (500) and verifies the retry (2 requests) and the fallback to domain with the warning, then leaves the server without a response and presses "Stop" (no proposal, computation-stopped warning) (screenshot in `scripts/smoke-popup-warning.png`).

At the end the script tests the four rows of the fallback table with all the tabs, turning the providers on and off in `storage.sync`. The fake System One answers with low confidence for the `/c` and `/d` pages. Expected and obtained results: both → "Work" (list, 3 tabs) + "Nuovo Tema" (new AI, 2 tabs), 5 System One requests and 1 to the Generator; Classifier only → "Work" (3 tabs), the other 2 ungrouped, no request to the Generator; Generator only → one group of 5 tabs; neither → two groups by domain. `repropose` counts only the requests of the computation forced by "Recompute", not those of the computation the panel makes on its own when it opens. The `/e` page has an empty meta description and an `og:description`, which must reach the AI.

`scripts/permissions-check.mjs` (separately, on the normal build) checks that permission requests start inside the user gesture: clicking the Generator's "Save" and the descriptions switch leave Chrome's dialog open, while a request from the service worker is rejected. A request from `page.evaluate` is no use as a counter-check, because Puppeteer runs it as a user gesture. Mutation test: moving `permissions.request` after a 6 s wait, saving fails with "must be called during a user gesture".

At startup the script also checks with `chrome.commands.getAll()` that the shortcut for the panel is registered (on macOS: `⌥⇧G`).

`npm run smoke` builds with `AUTOGROUP_SMOKE=1`, which adds `<all_urls>` to the host permissions: in headless mode Chrome's permission dialog cannot be accepted. At the end it rebuilds the normal build.

Stable Chrome ignores `--load-extension` since version 137, so the script uses Chrome for Testing downloaded by Puppeteer.
