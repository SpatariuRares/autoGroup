# Site rules for categories

Date: 2026-10-07
Status: approved design, awaiting implementation plan

## Goal

Let the user say "tabs of this site always go to this category". Rules are deterministic and are applied **before** any other grouping, in every mode:

| Mode | Tabs matched by a rule | Other tabs |
|---|---|---|
| With AI | the rule's category | Classifier / Generator, as today |
| By site | the rule's category | grouped by domain, as today |

This covers three needs with one mechanism:

1. **Correct the AI** where it keeps getting the same sites wrong (`github.com` → Dev, always).
2. **Rules + AI**: rules handle the certain cases, the AI handles the rest. The AI never sees the tabs a rule took, so requests are smaller, faster and send less data.
3. **Merge different sites in By site mode**: a "Google" category with `mail.google.com` and `calendar.google.com` groups them together without any AI.

There is no separate "rules only" mode.

## Non-goals

- Matching on tab titles, keywords or regular expressions.
- Rules that point to a free group name instead of a category.
- Natural-language instructions to the AI.

## 1. Data and storage

- A rule is a **site** attached to a category. Categories keep their shape (`Category` is unchanged).
- New field in `Settings`: `categorySites: Record<string, string[]>`, category ID → sites. It is stored under its **own key** in `chrome.storage.sync`, so it has its own per-item quota and cannot make the `categories` item exceed 8 KB (ten 300-character descriptions already come close).
- Default categories have stable IDs (`default-dev`, …), so rules survive a change of browser language.
- **Cleanup**: on save, sites of categories that no longer exist are dropped. "Restore defaults" for categories also removes `categorySites`, because it is a return to the initial configuration.
- **Limit**: no fixed count. On save, the serialized key must fit `chrome.storage.sync.QUOTA_BYTES_PER_ITEM`; otherwise the save is rejected with a `SettingsError` ("Too many sites"). In practice this allows roughly 150–200 sites.
- **Validation** (in `saveSettings`, like the other fields): every site must be in normalized form, and the same site cannot appear in two categories (error names the category that already has it).

## 2. Site format and matching (`src/organizer/site-rules.ts`, pure module)

- **Format**: `domain[/path]`. Input is normalized like excluded domains: lowercase, no scheme, no `www.`, no port, no query, no fragment, no trailing `/`. Example: `https://www.GitHub.com/Mia-Org/` → `github.com/mia-org`. A normalizer `normalizeSite(input): string | null` lives next to `normalizeDomain` in `src/settings/index.ts` and reuses it for the host part.
- **Domain** matches the domain and its subdomains, with the same logic as `isExcludedHost` (`atlassian.net` matches `team.atlassian.net`).
- **Path** matches by **whole segments**, case-insensitively: `github.com/mia-org` matches `github.com/mia-org` and `github.com/mia-org/repo`, not `github.com/mia-organization`.
- **Several rules match**: the most specific one wins, that is the one with the most components (host labels + path segments). On a tie, the one with the longer path wins. So `github.com/mia-org` → Work and `github.com` → Dev coexist.
- **Excluded domains always win**: those tabs are discarded by `selectCandidateTabs` and never reach the rules.

## 3. Pipeline

### Split

`splitBySiteRules(candidates, categories, categorySites)` returns:

- `ruled`: the tabs matched by a rule, grouped by category name;
- `rest`: all the other candidates.

Short IDs (`t1`, `t2`, …) are still assigned over **all** candidates, so rule groups and AI groups are both `ValidGroup`s with the same short IDs and can be merged by name.

### AI mode

- Only `rest` is sent to the AI. The Description reader also reads only `rest`.
- **Generator only (full)**: `applyGroupRules(mergeByName([...ruleGroups, ...generatorGroups]))`.
- **Classifier + Generator**: rule groups take part in step 1. The minimum per category counts rule tabs too (1 rule tab + 1 Classifier tab in Dev is a valid group). Rule tabs left below the minimum are **not** passed to step 2: they stay ungrouped, so the AI cannot place them against the rule.
- **Classifier only**: same as above, without step 2.
- **`rest` empty** (every candidate matched a rule): no AI request and no preview. `willAskAi` checks `rest` instead of all candidates.
- If the AI fails and the pipeline falls back to domain grouping, rule groups are kept (the fallback is "rules + domain", like By site mode).

### By site mode and domain fallback

`domainGroups` currently re-implements part of `applyGroupRules` (minimum tabs, an open group with the same name accepts a single tab, colors) with its own color assigner. It becomes:

```
groupByDomain(rest) → ValidGroup[] named after the domain, without the minTabs filter
applyGroupRules(mergeByName([...ruleGroups, ...domainGroups]), ctx, { newProvenance: 'domain' })
```

- `applyGroupRules` gains an option for the provenance of groups that match no known option: `'ai'` (default) or `'domain'`.
- The options context (`buildOptions`) is built in By site mode too; it needs no AI.
- Minimum tabs, open groups and colors are then decided in one place for every mode, and rule categories and domain groups share one color assigner.

### Preview and "Use this"

`buildPreview` uses the same function as By site mode, so the preview shown while the AI works already contains the rule groups, and "Use this" keeps them.

### Signature

`signatureOf` already includes all `settings`, so editing a rule makes a saved proposal stale. No change needed.

### Provenance

Rule groups are categories: provenance stays `list`, or `existing` when a group with that name is already open. No new provenance.

`ProposedTab` gains an optional `rule?: string`: the site that placed the tab there. The `move-tab` edit clears it.

## 4. Settings page: category editor

Under the name and description of each category, a **"Sites"** row:

- one chip per site (`github.com ✕`), styled like the excluded domains;
- a **"+ Site"** button that opens an inline field. Enter saves, Esc cancels. Errors ("doesn't look like a site", "already in *Dev*", "too many sites") show under the field, like for excluded domains;
- a category without sites shows only "+ Site", so the list stays as compact as today.

The Categories card hint gains one line: "Tabs of these sites always go to this category, without asking the AI."

## 5. Side panel

### Shortcut after a correction

When the user moves a tab (`move-tab`) into a group that corresponds to a category (provenance `list`, or `existing` with the name of a category), a bar appears under that group for a few seconds: *"Always put github.com here?"* **[Yes]**.

- New Organizer method `rememberSite(tabId)`, queued in `exclusive` like the others. It takes the tab's domain (`domainOf`) and the category of the group the tab is in, adds the site, sets `tab.rule`, and updates the proposal's signature to the new settings, as `saveToList` does, so the proposal stays current and the user's edits are kept.
- If the site was already in another category, it is **moved** (the user just said "always here"). The state's `notice` says "github.com moved from Dev to Work".
- If the site is already in that category, nothing changes.
- The bar is not shown for groups invented by the AI (provenance `ai`) or by domain: those must first become a category ("Save to list").
- New message in `src/shared/messages.ts` and handler in `entrypoints/background.ts`.

The shortcut always saves the bare domain. Paths are refined in the settings.

### Indicator

Tabs placed by a rule show a small "rule" chip (`tab-chip muted`), with the tooltip "Rule: github.com".

### Texts

New keys in `public/_locales/en` and `public/_locales/it` for the settings row, errors, panel bar, notice and chip.

## 6. Tests

- `tests/site-rules.test.ts` (pure): `normalizeSite`, subdomains, path segments, most specific rule, case-insensitivity, tie-break.
- `tests/organizer.test.ts`, through the Organizer interface:
  - AI mode with rules: the fake Generator / Classifier never receives rule tabs;
  - By site mode with rules: rule category groups plus domain groups, distinct colors;
  - rule tab + Classifier tab reach the minimum together;
  - a rule tab below the minimum stays ungrouped and is not sent to step 2;
  - a rule category whose group is already open: the tab joins the existing group;
  - every candidate matched by a rule: no AI request, no preview;
  - the preview contains rule groups;
  - AI failure falls back to rules + domain;
  - `rememberSite`: adds the site, keeps the proposal current, moves the site from another category with a notice.
- Settings: validation, duplicates across categories, quota, cleanup of orphan sites, "Restore defaults" clears sites.
- Existing domain-grouping tests must keep passing after the move to `applyGroupRules`.

## Documentation

Update `README.md` (Categories paragraph) and `docs/architecture.md` (folder structure, pipeline, Organizer interface) once implemented.
