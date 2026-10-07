# Site Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user attach sites (`domain[/path]`) to categories so that tabs of those sites always go to that category, before the AI or the by-site grouping handles the remaining tabs.

**Architecture:** A pure matcher (`src/organizer/site-rules.ts`) assigns candidate tabs to categories. The pipeline treats rule assignments as `ValidGroup`s that are merged by name with the AI / domain groups and pass once through `applyGroupRules`; the AI only receives the tabs no rule took. By-site grouping is rewritten on top of `applyGroupRules` so minimum tabs, open groups and colors are decided in one place. Sites live in a separate `chrome.storage.sync` key (`categorySites`), edited in the category editor and from a "remember this site" snackbar in the side panel.

**Tech Stack:** TypeScript, WXT (Manifest V3), React 19, Vitest with WXT's `fakeBrowser`.

**Spec:** `docs/superpowers/specs/2026-10-07-site-rules-design.md`

## Global Constraints

- Code comments and test names are in **Italian**, like the rest of `src/` and `tests/`. Project docs (`README.md`, `docs/`) are in **English**.
- Every new i18n key exists in both `public/_locales/it/messages.json` and `public/_locales/en/messages.json`, with the same placeholders (`tests/locales.test.ts` enforces it). Keys may contain only `[A-Za-z0-9_]`.
- Commit messages: Conventional Commits (`feat:`, `refactor:`, `docs:`, `test:`), **no `Co-Authored-By` or any other attribution trailer**.
- Site format: `domain[/path]`, normalized: lowercase, no scheme, no `www.`, no port, no query, no fragment, no trailing `/`.
- A domain matches its subdomains; a path matches by whole segments, case-insensitively.
- Most specific rule wins: most components (host labels + path segments); on a tie, the longer path.
- `categorySites` is stored under its own `storage.sync` key; save is rejected if `"categorySites" + JSON` exceeds 8192 bytes.
- Excluded domains always win over rules (they never become candidates).
- Rule tabs below `minTabs` stay ungrouped and are never sent to the AI.
- Run the whole suite with `npx vitest run`; type check with `npm run compile`; full check with `npm run check`.

## Review Focus

1. **The AI answers with the short ID of a tab it never received** (a rule tab) → the ID is ignored and the tab stays in its rule group or free. Test in Task 5.
2. **A category is renamed after its sites were set** → rules follow the category ID, groups take the new name. Test in Task 4.
3. **"Remember" on a tab already decided by a more specific rule of another category** → that rule is moved, not a bare domain added (otherwise the move would have no effect). Test in Task 6.
4. **Description reading with rules** → pages of rule tabs are never read. Test in Task 5.
5. **By-site mode with the Categories card hidden** → today the card is AI-only, so sites could not be edited in By-site mode; the card must show in both modes. Covered in Task 7 (manual check, no React tests in this repo).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/settings/index.ts` | modify | `normalizeSite`, `CategorySites`, `validateCategorySites`, `categorySites` load/save/prune, reset clears sites |
| `src/organizer/site-rules.ts` | create | pure matcher: `createSiteMatcher`, `siteToRemember`, `SiteMatch` |
| `src/organizer/domain-grouping.ts` | modify | keep only `domainOf` (drop `groupByDomain`) |
| `src/organizer/group-rules.ts` | modify | `newProvenance` parameter, `siteOf` in `RulesContext`, `rule` on tabs |
| `src/organizer/pipeline.ts` | modify | `groupingContext`, `siteMatches`, rules in every branch, `domainGroups` on `applyGroupRules`, `willAskAi` |
| `src/organizer/proposal-edits.ts` | modify | moving a tab clears `rule` |
| `src/organizer/remember-site.ts` | create | `rememberTabSite(proposal, tabId)` |
| `src/organizer/index.ts` | modify | `Organizer.rememberSite` |
| `src/shared/types.ts` | modify | `ProposedTab.rule`, `notice.arg` may be an array |
| `src/shared/messages.ts`, `entrypoints/background.ts` | modify | `organizer/remember-site` request |
| `entrypoints/options/SitesRow.tsx` | create | "Sites" row of a category |
| `entrypoints/options/App.tsx`, `entrypoints/options/style.css` | modify | Categories card in both modes, sites row |
| `entrypoints/sidepanel/App.tsx` | modify | rule chip, "remember" snackbar |
| `public/_locales/{it,en}/messages.json` | modify | new texts |
| `tests/site-rules.test.ts` | create | settings + matcher (pure) |
| `tests/site-rules-pipeline.test.ts` | create | Organizer-level behavior |
| `README.md`, `docs/architecture.md` | modify | documentation |

---

### Task 1: Sites in the settings

**Files:**
- Modify: `src/settings/index.ts`
- Modify: `public/_locales/it/messages.json`, `public/_locales/en/messages.json`
- Test: `tests/site-rules.test.ts` (create)

**Interfaces:**
- Produces:
  - `type CategorySites = Record<string, string[]>` (category ID → sites)
  - `const SYNC_ITEM_QUOTA = 8192`
  - `function normalizeSite(input: string): string | null`
  - `function validateCategorySites(value: unknown): 'optionsSitesInvalid' | 'optionsSitesTooMany' | null`
  - `Settings.categorySites: CategorySites` (default `{}`)
  - `saveSettings` drops sites of missing categories and empty lists whenever `categories` or `categorySites` is saved; throws `SettingsError('optionsSitesInvalid' | 'optionsSitesTooMany')`
  - `resetCategories()` also removes `categorySites`

- [ ] **Step 1: Write the failing tests**

Create `tests/site-rules.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { loadSettings, normalizeSite, resetCategories, saveSettings, SettingsError } from '../src/settings';
import type { Category } from '../src/shared/types';
import { installFakeI18n } from './fake-i18n';

const CATS: Category[] = [
  { id: 'dev', name: 'Dev', description: '', color: 'grey' },
  { id: 'work', name: 'Work', description: '', color: 'blue' },
];

beforeEach(() => {
  fakeBrowser.reset();
  installFakeI18n('it');
});

describe('normalizeSite', () => {
  it('riduce quello che scrive l\'utente a dominio[/percorso]', () => {
    expect(normalizeSite('https://www.GitHub.com/Mia-Org/')).toBe('github.com/mia-org');
    expect(normalizeSite('github.com')).toBe('github.com');
    expect(normalizeSite('  docs.google.com/document/d/x?usp=sharing#h  ')).toBe('docs.google.com/document/d/x');
    expect(normalizeSite('localhost:3000/app')).toBe('localhost/app');
  });

  it('rifiuta ciò che non è un sito', () => {
    for (const bad of ['', '   ', 'non un sito', 'http://', '-bad.com']) expect(normalizeSite(bad)).toBeNull();
  });
});

describe('siti delle categorie nelle impostazioni', () => {
  it('di default non ci sono siti; si salvano in una chiave a parte di storage.sync', async () => {
    expect((await loadSettings()).categorySites).toEqual({});

    await saveSettings({ categories: CATS, categorySites: { dev: ['github.com'], work: ['github.com/mia-org'] } });

    expect((await loadSettings()).categorySites).toEqual({ dev: ['github.com'], work: ['github.com/mia-org'] });
    const stored = await fakeBrowser.storage.sync.get('categorySites');
    expect(stored.categorySites).toEqual({ dev: ['github.com'], work: ['github.com/mia-org'] });
  });

  it('rifiuta siti non normalizzati e lo stesso sito in due categorie', async () => {
    await saveSettings({ categories: CATS });

    await expect(saveSettings({ categorySites: { dev: ['https://GitHub.com'] } })).rejects.toThrow(SettingsError);
    await expect(saveSettings({ categorySites: { dev: ['github.com'], work: ['github.com'] } })).rejects.toMatchObject({
      messageKey: 'optionsSitesInvalid',
    });
  });

  it('rifiuta più siti di quanti ne stanno nella quota di storage.sync', async () => {
    await saveSettings({ categories: CATS });
    const many = Array.from({ length: 400 }, (_, i) => `sito-numero-${i}.example.com`);

    await expect(saveSettings({ categorySites: { dev: many } })).rejects.toMatchObject({ messageKey: 'optionsSitesTooMany' });
  });

  it('toglie i siti delle categorie eliminate e le liste vuote', async () => {
    await saveSettings({ categories: CATS, categorySites: { dev: ['github.com'], work: ['jira.com'] } });

    await saveSettings({ categories: [CATS[1]!] });
    expect((await loadSettings()).categorySites).toEqual({ work: ['jira.com'] });

    await saveSettings({ categorySites: { work: [] } });
    expect((await loadSettings()).categorySites).toEqual({});
  });

  it('"Ripristina default" cancella anche i siti', async () => {
    await saveSettings({ categories: CATS, categorySites: { dev: ['github.com'] } });

    await resetCategories();

    expect((await loadSettings()).categorySites).toEqual({});
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/site-rules.test.ts`
Expected: FAIL — `normalizeSite` is not exported, `categorySites` is undefined.

- [ ] **Step 3: Implement**

In `src/settings/index.ts`:

1. After `DEFAULT_THRESHOLD`, add:

```ts
/** Regole sui siti: ID della categoria → siti "dominio[/percorso]" le cui tab vanno sempre lì. */
export type CategorySites = Record<string, string[]>;

/** Quota di un elemento di chrome.storage.sync: byte del nome della chiave più il valore in JSON. */
export const SYNC_ITEM_QUOTA = 8192;
```

2. In `interface Settings`, after `categories`, add:

```ts
  /**
   * Regole sui siti, salvate in una chiave a parte per non togliere spazio alle categorie: le tab di
   * questi siti vanno sempre nella categoria, prima dell'AI e del raggruppamento per dominio.
   */
  categorySites: CategorySites;
```

3. Add `'categorySites'` to `KEYS` (after `'categories'`) and `categorySites: {}` to `DEFAULT_SETTINGS`.

4. In `loadSettings`, after `categories`:

```ts
    categorySites: validateCategorySites(stored.categorySites) === null ? stored.categorySites! : {},
```

5. In `saveSettings`, right after the `patch.categories` block:

```ts
  if (patch.categorySites !== undefined) {
    const error = validateCategorySites(patch.categorySites);
    if (error) throw new SettingsError(error);
  }
  if (patch.categories !== undefined || patch.categorySites !== undefined) {
    // Senza le categorie che non esistono più e senza liste vuote.
    const current = await loadSettings();
    const ids = new Set((patch.categories ?? current.categories).map((c) => c.id));
    const sites = Object.entries(patch.categorySites ?? current.categorySites).filter(([id, list]) => ids.has(id) && list.length > 0);
    patch = { ...patch, categorySites: Object.fromEntries(sites) };
  }
```

6. Replace `resetCategories`:

```ts
/** "Ripristina default": torna alla lista predefinita nella lingua del browser, senza siti. */
export async function resetCategories(): Promise<Category[]> {
  await browser.storage.sync.remove(['categories', 'categorySites']);
  return defaultCategories();
}
```

7. After `normalizeDomain`, add:

```ts
/**
 * Riduce un sito scritto dall'utente a "dominio[/percorso]": il dominio come `normalizeDomain`, il
 * percorso in minuscolo, senza query, frammento né "/" finale. Restituisce null se il dominio non è valido.
 */
export function normalizeSite(input: string): string | null {
  let value = input.trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `http://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = normalizeDomain(url.hostname);
  if (!host) return null;
  return [host, ...url.pathname.toLowerCase().split('/').filter(Boolean)].join('/');
}

/**
 * Restituisce la chiave i18n del primo errore dei siti, oppure null se vanno bene: ogni sito già
 * normalizzato, nessun sito in due categorie, tutto dentro la quota di un elemento di storage.sync.
 */
export function validateCategorySites(value: unknown): 'optionsSitesInvalid' | 'optionsSitesTooMany' | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'optionsSitesInvalid';
  const seen = new Set<string>();
  for (const list of Object.values(value)) {
    if (!Array.isArray(list)) return 'optionsSitesInvalid';
    for (const site of list) {
      if (typeof site !== 'string' || normalizeSite(site) !== site || seen.has(site)) return 'optionsSitesInvalid';
      seen.add(site);
    }
  }
  const bytes = new TextEncoder().encode(`categorySites${JSON.stringify(value)}`).length;
  return bytes > SYNC_ITEM_QUOTA ? 'optionsSitesTooMany' : null;
}
```

8. Add the error texts. In `public/_locales/it/messages.json` (next to `optionsDomainDuplicate`):

```json
  "optionsSitesInvalid": {
    "message": "Siti non validi: controlla che ogni sito sia scritto bene e sia in una sola categoria."
  },
  "optionsSitesTooMany": {
    "message": "Troppi siti: Chrome non riesce a salvarli. Togline qualcuno."
  },
```

In `public/_locales/en/messages.json`:

```json
  "optionsSitesInvalid": {
    "message": "Invalid sites: check that each site is written correctly and is in only one category."
  },
  "optionsSitesTooMany": {
    "message": "Too many sites: Chrome can't save them. Remove a few."
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: all tests PASS (the new ones and the existing 193).

- [ ] **Step 5: Commit**

```bash
git add src/settings/index.ts public/_locales tests/site-rules.test.ts
git commit -m "feat: store category sites in settings"
```

---

### Task 2: Site matcher

**Files:**
- Create: `src/organizer/site-rules.ts`
- Test: `tests/site-rules.test.ts` (append)

**Interfaces:**
- Consumes: `CategorySites`, `normalizeDomain` from `src/settings`; `Category` from `src/shared/types`.
- Produces:
  - `interface SiteMatch { site: string; category: Category }`
  - `function createSiteMatcher(categories: Category[], categorySites: CategorySites): (url: string) => SiteMatch | null`
  - `function siteToRemember(url: string, categories: Category[], categorySites: CategorySites): string | null`

- [ ] **Step 1: Write the failing tests**

Append to `tests/site-rules.test.ts` (and add `createSiteMatcher, siteToRemember` import from `'../src/organizer/site-rules'` and `type CategorySites` to the settings import):

```ts
describe('regole sui siti', () => {
  const match = (url: string, sites: CategorySites) => createSiteMatcher(CATS, sites)(url);

  it('un dominio prende anche i sottodomini, con o senza www', () => {
    const sites = { work: ['atlassian.net'] };

    expect(match('https://team.atlassian.net/browse/X-1', sites)?.category.name).toBe('Work');
    expect(match('https://www.atlassian.net/', sites)?.site).toBe('atlassian.net');
    expect(match('https://notatlassian.net/', sites)).toBeNull();
  });

  it('un percorso si confronta per segmenti interi, senza distinguere maiuscole e minuscole', () => {
    const sites = { work: ['github.com/mia-org'] };

    expect(match('https://github.com/Mia-Org/repo?tab=1', sites)?.site).toBe('github.com/mia-org');
    expect(match('https://github.com/mia-org', sites)?.site).toBe('github.com/mia-org');
    expect(match('https://github.com/mia-organization', sites)).toBeNull();
    expect(match('https://github.com/', sites)).toBeNull();
  });

  it('vince la regola più specifica, qualunque sia l\'ordine delle categorie', () => {
    const sites = { dev: ['github.com'], work: ['github.com/mia-org'] };

    expect(match('https://github.com/mia-org/x', sites)?.category.name).toBe('Work');
    expect(match('https://github.com/altro/x', sites)?.category.name).toBe('Dev');
  });

  it('a parità di componenti vince il percorso più lungo', () => {
    const sites = { dev: ['a.google.com'], work: ['google.com/x'] };

    expect(match('https://a.google.com/x', sites)?.category.name).toBe('Work');
  });

  it('ignora le pagine senza dominio e i siti di categorie che non esistono', () => {
    expect(match('file:///Users/me/a.pdf', { dev: ['github.com'] })).toBeNull();
    expect(match('https://github.com/', { ghost: ['github.com'] })).toBeNull();
  });

  it('il sito da ricordare è quello della regola che decide la tab, altrimenti il dominio', () => {
    const sites = { work: ['github.com/mia-org'] };

    expect(siteToRemember('https://github.com/mia-org/x', CATS, sites)).toBe('github.com/mia-org');
    expect(siteToRemember('https://www.github.com/altro', CATS, sites)).toBe('github.com');
    expect(siteToRemember('file:///a.pdf', CATS, sites)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/site-rules.test.ts`
Expected: FAIL — cannot resolve `../src/organizer/site-rules`.

- [ ] **Step 3: Implement**

Create `src/organizer/site-rules.ts`:

```ts
import { normalizeDomain, type CategorySites } from '../settings';
import type { Category } from '../shared/types';

/** Una tab presa da una regola: il sito della regola e la categoria in cui va. */
export interface SiteMatch {
  site: string;
  category: Category;
}

interface Rule extends SiteMatch {
  host: string;
  path: string[];
}

/** Host e segmenti del percorso di un URL, in minuscolo; null se l'URL non ha un host (es. file://). */
function urlParts(url: string): { host: string; segments: string[] } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!host) return null;
    return { host, segments: u.pathname.toLowerCase().split('/').filter(Boolean) };
  } catch {
    return null;
  }
}

/** Un dominio vale anche per i sottodomini; il percorso si confronta per segmenti interi. */
function matches(rule: Rule, host: string, segments: string[]): boolean {
  return (host === rule.host || host.endsWith(`.${rule.host}`)) && rule.path.every((segment, i) => segments[i] === segment);
}

const components = (rule: Rule) => rule.host.split('.').length + rule.path.length;

/**
 * Prepara le regole una volta sola e restituisce la funzione che trova la regola di un URL. Se più
 * regole corrispondono vince la più specifica: più componenti (parti del dominio + segmenti del
 * percorso), a parità il percorso più lungo. I siti di categorie che non esistono sono ignorati.
 */
export function createSiteMatcher(categories: Category[], categorySites: CategorySites): (url: string) => SiteMatch | null {
  const rules = categories
    .flatMap((category) =>
      (categorySites[category.id] ?? []).map((site): Rule => {
        const [host, ...path] = site.split('/');
        return { site, category, host: host!, path };
      }),
    )
    .sort((a, b) => components(b) - components(a) || b.path.length - a.path.length);
  return (url) => {
    const parts = urlParts(url);
    const rule = parts && rules.find((r) => matches(r, parts.host, parts.segments));
    return rule ? { site: rule.site, category: rule.category } : null;
  };
}

/**
 * Il sito da ricordare per una tab ("Metti sempre qui"): quello della regola che oggi la decide, così
 * spostarlo cambia davvero dove andrà; senza regole il suo dominio. Null se l'URL non ha un dominio.
 */
export function siteToRemember(url: string, categories: Category[], categorySites: CategorySites): string | null {
  return createSiteMatcher(categories, categorySites)(url)?.site ?? normalizeDomain(url);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/site-rules.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/organizer/site-rules.ts tests/site-rules.test.ts
git commit -m "feat: match tabs to categories by site rules"
```

---

### Task 3: By-site grouping on top of `applyGroupRules` (refactor, no behavior change)

**Files:**
- Modify: `src/organizer/group-rules.ts`
- Modify: `src/organizer/pipeline.ts`
- Modify: `src/organizer/domain-grouping.ts`

**Interfaces:**
- Produces:
  - `applyGroupRules(valid: ValidGroup[], ctx: RulesContext, newProvenance: 'ai' | 'domain' = 'ai'): RulesResult`
  - `groupingContext(inputs, descriptions?)` in `pipeline.ts` (internal; replaces `aiContext`)
  - `mergeByName` unchanged
  - `domain-grouping.ts` exports only `domainOf`

- [ ] **Step 1: Run the domain tests to record the baseline**

Run: `npx vitest run tests/organizer.test.ts tests/preview.test.ts`
Expected: PASS. These tests pin the by-site behavior (minimum tabs, open group with the same name accepts one tab, color rotation `['blue', 'red', 'yellow']` with grey taken) and must stay green after the refactor.

- [ ] **Step 2: Add the provenance parameter to `applyGroupRules`**

In `src/organizer/group-rules.ts`, update the doc comment and signature:

```ts
/**
 * Regole sui gruppi e colori, uguali per ogni livello (AI e dominio).
 * - Un gruppo esistente accoglie anche una sola tab; nome e colore restano i suoi.
 * - Una categoria della lista o un gruppo nuovo richiedono almeno `minTabs` tab.
 * - Le categorie usano il loro colore fisso; i gruppi nuovi ruotano tra i colori liberi nella finestra.
 * I gruppi che non corrispondono a nessuna opzione nota hanno la provenienza `newProvenance`.
 */
export function applyGroupRules(valid: ValidGroup[], ctx: RulesContext, newProvenance: 'ai' | 'domain' = 'ai'): RulesResult {
```

and the last return of the `map`:

```ts
    return { id, name: group.name, color: colors.next(), provenance: newProvenance, tabs };
```

- [ ] **Step 3: Rewrite `domainGroups` in `src/organizer/pipeline.ts`**

1. Rename `aiContext` to `groupingContext` (definition and the two call sites) and give it a default for `descriptions`:

```ts
/** Dati comuni a tutti i livelli: tab con ID brevi (e descrizioni, se lette), opzioni, contesto delle regole. */
function groupingContext(inputs: ProposalInputs, descriptions: Map<number, string> = new Map()) {
```

Update the parameter type in `classifyThenGenerate` to `ctx: ReturnType<typeof groupingContext>`.

2. Replace the import `import { groupByDomain } from './domain-grouping';` with `import { domainOf } from './domain-grouping';` and remove the now unused `createColorAssigner` and `GroupColor` imports if nothing else uses them.

3. Replace `domainGroups`:

```ts
/**
 * Raggruppamento per dominio: modalità per sito, ultimo livello della pipeline e anteprima mostrata
 * mentre l'AI calcola. Minimo di tab, gruppi aperti con lo stesso nome (es. "github.com") e colori
 * seguono `applyGroupRules`, come per l'AI.
 */
export function domainGroups(inputs: ProposalInputs): ProposedGroup[] {
  const ctx = groupingContext(inputs);
  const byDomain = new Map<string, ValidGroup>();
  for (const { id } of ctx.tabs) {
    const domain = domainOf(ctx.rules.byShortId.get(id)!.url);
    if (!domain) continue;
    const group = byDomain.get(domain) ?? { name: domain, tabIds: [] };
    group.tabIds.push(id);
    byDomain.set(domain, group);
  }
  return applyGroupRules([...byDomain.values()], ctx.rules, 'domain').groups;
}
```

- [ ] **Step 4: Drop `groupByDomain`**

In `src/organizer/domain-grouping.ts`, delete `DomainGroup` and `groupByDomain` (and the `CandidateTab` import); keep `domainOf` unchanged.

- [ ] **Step 5: Run the whole suite and the type check**

Run: `npx vitest run && npm run compile`
Expected: all PASS, no type errors. If a domain test fails, the refactor changed behavior: fix the refactor, not the test.

- [ ] **Step 6: Commit**

```bash
git add src/organizer/group-rules.ts src/organizer/pipeline.ts src/organizer/domain-grouping.ts
git commit -m "refactor: build by-site groups through applyGroupRules"
```

---

### Task 4: Rules in By-site mode, preview and fallback

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/organizer/group-rules.ts`
- Modify: `src/organizer/pipeline.ts`
- Modify: `src/organizer/proposal-edits.ts`
- Test: `tests/site-rules-pipeline.test.ts` (create)

**Interfaces:**
- Consumes: `createSiteMatcher`, `SiteMatch` (Task 2); `Settings.categorySites` (Task 1); `applyGroupRules(..., newProvenance)` and `groupingContext` (Task 3).
- Produces:
  - `ProposedTab.rule?: string`
  - `RulesContext.siteOf?: Map<string, string>` (short ID → site)
  - `siteMatches(inputs: ProposalInputs): Map<number, SiteMatch>` in `pipeline.ts` (Chrome tab ID → match; internal)
  - `groupingContext(inputs, matches = siteMatches(inputs), descriptions = new Map())` returns `{ tabs /* only tabs no rule took */, options, aiOptions, knownNames, rules, siteGroups: ValidGroup[] }`

- [ ] **Step 1: Write the failing tests**

Create `tests/site-rules-pipeline.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { saveSettings } from '../src/settings';
import type { Category, OrganizerState } from '../src/shared/types';
import { installFakeI18n } from './fake-i18n';
import { installFakePermissions } from './fake-network';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let organizer: Organizer;
const W = 1;
const CATEGORIES: Category[] = [
  { id: 'dev', name: 'Dev', description: 'Programmazione', color: 'grey' },
  { id: 'work', name: 'Work', description: 'Lavoro', color: 'blue' },
  { id: 'google', name: 'Google', description: 'Servizi Google', color: 'green' },
];
const SITES = { dev: ['github.com'], work: ['github.com/mia-org'], google: ['mail.google.com', 'calendar.google.com'] };

beforeEach(async () => {
  fakeBrowser.reset();
  installFakeI18n('it');
  installFakePermissions(['https://openrouter.ai/*', 'http://127.0.0.1/*']);
  strip = installFakeTabStrip({ currentWindowId: W });
  organizer = createOrganizer();
  await saveSettings({ mode: 'domain', categories: CATEGORIES, categorySites: SITES });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const summary = (state: OrganizerState) =>
  state.proposal!.groups.map((g) => ({ name: g.name, provenance: g.provenance, color: g.color, tabs: g.tabs.map((t) => t.title) }));

describe('regole sui siti, modalità per sito', () => {
  it('le tab dei siti vanno nella loro categoria, le altre per dominio, con colori distinti', async () => {
    strip.addTab({ url: 'https://mail.google.com/mail/u/0', title: 'Posta' });
    strip.addTab({ url: 'https://news.ycombinator.com/', title: 'HN 1' });
    strip.addTab({ url: 'https://calendar.google.com/r', title: 'Calendario' });
    strip.addTab({ url: 'https://news.ycombinator.com/item?id=1', title: 'HN 2' });

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([
      { name: 'Google', provenance: 'list', color: 'green', tabs: ['Posta', 'Calendario'] },
      { name: 'news.ycombinator.com', provenance: 'domain', color: 'grey', tabs: ['HN 1', 'HN 2'] },
    ]);
    expect(state.proposal!.groups[0]!.tabs.map((t) => t.rule)).toEqual(['mail.google.com', 'calendar.google.com']);
    expect(state.proposal!.groups[1]!.tabs.map((t) => t.rule)).toEqual([undefined, undefined]);
  });

  it('vince la regola più specifica', async () => {
    strip.addTab({ url: 'https://github.com/mia-org/a', title: 'Org A' });
    strip.addTab({ url: 'https://github.com/torvalds/linux', title: 'Linux' });
    strip.addTab({ url: 'https://github.com/mia-org/b', title: 'Org B' });
    strip.addTab({ url: 'https://gist.github.com/x', title: 'Gist' });

    expect(summary(await organizer.propose(W))).toEqual([
      { name: 'Work', provenance: 'list', color: 'blue', tabs: ['Org A', 'Org B'] },
      { name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Linux', 'Gist'] },
    ]);
  });

  it('una categoria sotto il minimo non forma il gruppo: la tab resta libera, non va nel gruppo del suo dominio', async () => {
    strip.addTab({ url: 'https://github.com/mia-org/a', title: 'Org A' });
    strip.addTab({ url: 'https://github.com/altro', title: 'Altro' });
    strip.addTab({ url: 'https://github.com/altro2', title: 'Altro 2' });

    expect(summary(await organizer.propose(W))).toEqual([{ name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Altro', 'Altro 2'] }]);
  });

  it('un gruppo aperto con il nome della categoria riceve anche una sola tab', async () => {
    const mine = strip.addTab({ url: 'https://x.com/', title: 'Mia' });
    const open = await strip.addGroup('dev', 'pink', [mine]);
    strip.addTab({ url: 'https://github.com/a', title: 'Repo' });

    const { proposal } = await organizer.propose(W);

    expect(proposal!.groups).toMatchObject([{ name: 'dev', color: 'pink', provenance: 'existing', existingGroupId: open, tabs: [{ title: 'Repo' }] }]);
  });

  it('le regole seguono la categoria anche se viene rinominata', async () => {
    await saveSettings({ categories: CATEGORIES.map((c) => (c.id === 'dev' ? { ...c, name: 'Codice' } : c)) });
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });

    expect(summary(await organizer.propose(W))).toEqual([{ name: 'Codice', provenance: 'list', color: 'grey', tabs: ['Repo 1', 'Repo 2'] }]);
  });

  it('una tab spostata dall\'utente perde l\'indicazione della regola', async () => {
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    strip.addTab({ url: 'https://news.ycombinator.com/', title: 'HN 1' });
    strip.addTab({ url: 'https://news.ycombinator.com/2', title: 'HN 2' });
    const { proposal } = await organizer.propose(W);
    const [dev, hn] = proposal!.groups;

    const state = await organizer.edit({ kind: 'move-tab', tabId: dev!.tabs[0]!.tabId, toGroupId: hn!.id });

    expect(state.proposal!.groups.find((g) => g.id === hn!.id)!.tabs.at(-1)).not.toHaveProperty('rule');
  });

  it('cambiare i siti rende non più attuale una proposta salvata', async () => {
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    const first = await organizer.propose(W);

    await saveSettings({ categorySites: { dev: ['github.com', 'gitlab.com'] } });
    const second = await organizer.propose(W);

    expect(second.proposal!.signature).not.toBe(first.proposal!.signature);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/site-rules-pipeline.test.ts`
Expected: FAIL — groups are by domain only (`github.com`, `google.com` subdomains split), no `rule` on tabs.

- [ ] **Step 3: Add `rule` to `ProposedTab`**

In `src/shared/types.ts`, inside `interface ProposedTab`:

```ts
  /** Il sito della regola che ha messo la tab nel suo gruppo; sparisce se l'utente la sposta. */
  rule?: string;
```

- [ ] **Step 4: Carry the rule into proposed tabs**

In `src/organizer/group-rules.ts`, add to `RulesContext`:

```ts
  /** ID brevi delle tab prese da una regola sui siti → sito della regola. */
  siteOf?: Map<string, string>;
```

and replace the line `const tabs = group.tabIds.map((id) => toProposedTab(ctx.byShortId.get(id)!));` with:

```ts
    const tabs = group.tabIds.map((id) => {
      const tab = toProposedTab(ctx.byShortId.get(id)!);
      const rule = ctx.siteOf?.get(id);
      return rule ? { ...tab, rule } : tab;
    });
```

- [ ] **Step 5: Split the candidates by rules in `src/organizer/pipeline.ts`**

1. Imports: add `import { createSiteMatcher, type SiteMatch } from './site-rules';`.

2. Add above `groupingContext`:

```ts
/** Le tab candidate prese da una regola sui siti: ID della tab in Chrome → regola. */
function siteMatches(inputs: ProposalInputs): Map<number, SiteMatch> {
  const match = createSiteMatcher(inputs.settings.categories, inputs.settings.categorySites);
  const result = new Map<number, SiteMatch>();
  for (const tab of inputs.candidates) {
    const found = match(tab.url);
    if (found) result.set(tab.tabId, found);
  }
  return result;
}
```

3. Replace `groupingContext`:

```ts
/**
 * Dati comuni a tutti i livelli. Gli ID brevi valgono per tutte le candidate, così i gruppi delle
 * regole sui siti (`siteGroups`, uno per categoria) e quelli dell'AI o del dominio si uniscono per nome.
 * `tabs` contiene solo le tab che nessuna regola ha preso: sono le sole che vedono l'AI e il dominio.
 */
function groupingContext(inputs: ProposalInputs, matches = siteMatches(inputs), descriptions: Map<number, string> = new Map()) {
  const { tabs, byShortId } = prepareTabs(inputs.candidates, descriptions);
  const options = buildOptions(inputs.settings.categories, inputs.openGroups, (name) =>
    browser.i18n.getMessage('userGroupDescription' as never, name),
  );
  const siteOf = new Map<string, string>();
  const bySite = new Map<string, ValidGroup>();
  for (const [id, tab] of byShortId) {
    const match = matches.get(tab.tabId);
    if (!match) continue;
    siteOf.set(id, match.site);
    const key = categoryKey(match.category.name);
    const group = bySite.get(key) ?? { name: match.category.name, tabIds: [] };
    group.tabIds.push(id);
    bySite.set(key, group);
  }
  const rules: RulesContext = {
    options,
    byShortId,
    minTabs: inputs.settings.minTabs,
    usedColors: inputs.openGroups.map((g) => g.color),
    siteOf,
  };
  return {
    tabs: tabs.filter((t) => !siteOf.has(t.id)),
    options,
    aiOptions: options.map(({ name, description }): AiOption => ({ name, description })),
    knownNames: new Set(options.map((o) => categoryKey(o.name))),
    rules,
    siteGroups: [...bySite.values()],
  };
}
```

4. In `runPipeline`, the existing call `groupingContext(inputs, descriptions)` must become `groupingContext(inputs, siteMatches(inputs), descriptions)` for now (Task 5 reworks this branch).

5. In `domainGroups`, merge the rule groups in front of the domain groups:

```ts
  return applyGroupRules(mergeByName([...ctx.siteGroups, ...byDomain.values()]), ctx.rules, 'domain').groups;
```

and update its doc comment's first line to: `Regole sui siti, poi raggruppamento per dominio delle altre tab: modalità per sito, ultimo livello della pipeline e anteprima mostrata mentre l'AI calcola.`

- [ ] **Step 6: Moving a tab clears its rule**

In `src/organizer/proposal-edits.ts`, add `ProposedTab` to the type import and, above `editProposal`:

```ts
/** Una tab spostata dall'utente non è più lì per una regola. */
const moved = ({ rule: _rule, ...tab }: ProposedTab): ProposedTab => tab;
```

In the `add-tab` case use `moved(edit.tab)` in place of both `edit.tab` inside the new group / appended tabs (`[...g.tabs, moved(edit.tab)]` and `tabs: [moved(edit.tab)]`). In the `move-tab` case use `{ ...g, tabs: [...g.tabs, moved(tab)] }`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run && npm run compile`
Expected: all PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/organizer/group-rules.ts src/organizer/pipeline.ts src/organizer/proposal-edits.ts tests/site-rules-pipeline.test.ts
git commit -m "feat: apply site rules before by-site grouping"
```

---

### Task 5: Rules in AI mode

**Files:**
- Modify: `src/organizer/pipeline.ts`
- Test: `tests/site-rules-pipeline.test.ts` (append)

**Interfaces:**
- Consumes: `siteMatches`, `groupingContext` (Task 4).
- Produces: `willAskAi(inputs)` is false when every candidate is taken by a rule; `runPipeline` sends only non-rule tabs to Description reader, Classifier and Generator.

- [ ] **Step 1: Write the failing tests**

Append to `tests/site-rules-pipeline.test.ts`. Extend the imports: `saveApiKey` from `'../src/settings'`; `HANG, httpError, installFakeFetch, openAiReply, systemOneReply, type RecordedRequest` from `'./fake-network'`; `installFakeScripting` from `'./fake-scripting'`.

```ts
const OPENROUTER = { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'm' };
const KEV = { preset: 'kev', baseUrl: 'http://127.0.0.1:8009', model: '' };

async function aiMode(extra: Parameters<typeof saveSettings>[0] = {}) {
  await saveSettings({ mode: 'ai', generator: OPENROUTER, ...extra });
  await saveApiKey('generator', 'sk-test');
}

/** Titoli delle tab inviate al Generatore in una richiesta. */
const sentTitles = (request: RecordedRequest) => JSON.parse(request.body.messages[1].content).tabs.map((t: { title: string }) => t.title);

describe('regole sui siti, modalità AI', () => {
  it('all\'AI arrivano solo le tab che nessuna regola ha preso; i gruppi con lo stesso nome si uniscono', async () => {
    await aiMode();
    strip.addTab({ url: 'https://github.com/a', title: 'Repo' });
    strip.addTab({ url: 'https://stackoverflow.com/q/1', title: 'Domanda' });
    strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    strip.addTab({ url: 'https://cucina.it/pizza', title: 'Pizza' });
    const { requests } = installFakeFetch(openAiReply({ groups: [{ name: 'Dev', tabs: ['t2'] }, { name: 'Cucina', tabs: ['t3', 't4'] }] }));

    const state = await organizer.propose(W);

    expect(sentTitles(requests[0]!)).toEqual(['Domanda', 'Pasta', 'Pizza']);
    expect(summary(state)).toEqual([
      { name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Repo', 'Domanda'] },
      { name: 'Cucina', provenance: 'ai', color: 'blue', tabs: ['Pasta', 'Pizza'] },
    ]);
  });

  it('ignora l\'ID di una tab delle regole se l\'AI lo usa comunque', async () => {
    await aiMode();
    strip.addTab({ url: 'https://github.com/a', title: 'Repo' });
    strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    strip.addTab({ url: 'https://cucina.it/pizza', title: 'Pizza' });
    installFakeFetch(openAiReply({ groups: [{ name: 'Cucina', tabs: ['t1', 't2', 't3'] }] }));

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([{ name: 'Cucina', provenance: 'ai', color: 'grey', tabs: ['Pasta', 'Pizza'] }]);
  });

  it('se tutte le tab sono prese dalle regole non interroga l\'AI e non mostra l\'anteprima', async () => {
    await aiMode();
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    const { fetchMock } = installFakeFetch(new Error('nessuna richiesta attesa'));
    const announced: OrganizerState[] = [];
    organizer = createOrganizer({ onStateChange: (s) => announced.push(s) });

    const state = await organizer.propose(W);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(announced.some((s) => s.preview)).toBe(false);
    expect(state.proposal!.warnings).toEqual([]);
    expect(summary(state)).toEqual([{ name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Repo 1', 'Repo 2'] }]);
  });

  it('l\'anteprima per sito contiene già i gruppi delle regole, e "Usa questa" li tiene', async () => {
    await aiMode();
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    strip.addTab({ url: 'https://cucina.it/pizza', title: 'Pizza' });
    const { requests } = installFakeFetch(HANG);
    const announced: OrganizerState[] = [];
    organizer = createOrganizer({ onStateChange: (s) => announced.push(s) });

    const running = organizer.propose(W);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const names = announced.at(-1)!.preview!.groups.map((g) => g.name);
    await organizer.acceptPreview();
    const state = await running;

    expect(names).toEqual(['Dev', 'cucina.it']);
    expect(state.proposal!.groups.map((g) => g.name)).toEqual(['Dev', 'cucina.it']);
  });

  it('se l\'AI non risponde il ripiego è regole + dominio', async () => {
    await aiMode();
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    strip.addTab({ url: 'https://cucina.it/pizza', title: 'Pizza' });
    installFakeFetch(httpError(401));

    const state = await organizer.propose(W);

    expect(state.proposal!.warnings).toMatchObject([{ level: 'generator', cause: 'invalid-key' }]);
    expect(state.proposal!.groups.map((g) => [g.name, g.provenance])).toEqual([
      ['Dev', 'list'],
      ['cucina.it', 'domain'],
    ]);
  });

  it('Classificatore: le tab delle regole contano per il minimo e non vanno mai al Generatore', async () => {
    await aiMode({ classifier: KEV });
    strip.addTab({ url: 'https://github.com/a', title: 'Repo' });
    strip.addTab({ url: 'https://stackoverflow.com/q/1', title: 'Domanda' });
    strip.addTab({ url: 'https://github.com/mia-org/x', title: 'Org' });
    strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    strip.addTab({ url: 'https://cucina.it/pizza', title: 'Pizza' });
    const { requests } = installFakeFetch((request: RecordedRequest) => {
      if (request.url.endsWith('/v1/systemone')) {
        const choice = request.body.state.title === 'Domanda' ? 'Dev' : 'none_of_the_above';
        return systemOneReply({ group: { choice, confidence: 0.9 } });
      }
      const tabs = JSON.parse(request.body.messages[1].content).tabs as { id: string }[];
      return openAiReply({ groups: [{ name: 'Cucina', tabs: tabs.map((t) => t.id) }] });
    });

    const state = await organizer.propose(W);

    const classified = requests.filter((r) => r.url.endsWith('/v1/systemone')).map((r) => r.body.state.title);
    expect(classified.sort()).toEqual(['Domanda', 'Pasta', 'Pizza']);
    const generated = requests.filter((r) => !r.url.endsWith('/v1/systemone')).flatMap(sentTitles);
    expect(generated).toEqual(['Pasta', 'Pizza']);
    // "Org" (Work) resta sotto il minimo: libera, non passata al Generatore.
    expect(summary(state)).toEqual([
      { name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Repo', 'Domanda'] },
      { name: 'Cucina', provenance: 'ai', color: 'blue', tabs: ['Pasta', 'Pizza'] },
    ]);
  });

  it('non legge la descrizione delle pagine prese dalle regole', async () => {
    installFakePermissions(['https://openrouter.ai/*', '<all_urls>']);
    await aiMode({ readDescriptions: true });
    const repo = strip.addTab({ url: 'https://github.com/a', title: 'Repo' });
    const pasta = strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    const { read } = installFakeScripting(new Map([[repo, { description: 'R' }], [pasta, { description: 'P' }]]));
    installFakeFetch(openAiReply({ groups: [] }));

    await organizer.propose(W);

    expect(read).toEqual([pasta]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/site-rules-pipeline.test.ts`
Expected: FAIL — the AI still receives the rule tabs (`Repo` among sent titles), a request is made when all tabs are ruled, the page of `Repo` is read.

- [ ] **Step 3: Implement in `src/organizer/pipeline.ts`**

1. Replace `willAskAi`:

```ts
/**
 * Vero se il calcolo interrogherà almeno un livello AI: modalità AI, qualche tab candidata che
 * nessuna regola sui siti ha preso e un Classificatore o un Generatore utilizzabile. Solo allora vale
 * la pena mostrare l'anteprima per sito.
 */
export function willAskAi(inputs: ProposalInputs): boolean {
  if (inputs.settings.mode !== 'ai') return false;
  const matches = siteMatches(inputs);
  if (!inputs.candidates.some((t) => !matches.has(t.tabId))) return false;
  return inputs.classifier.usable || inputs.generator.usable || inputs.nano === 'available';
}
```

2. In `runPipeline`, replace everything from `if (inputs.candidates.length === 0) ...` down to `const ctx = ...` with:

```ts
  if (inputs.candidates.length === 0) return { groups: [], warnings };
  const matches = siteMatches(inputs);
  const rest = inputs.candidates.filter((t) => !matches.has(t.tabId));
  // Tutte le tab sono già decise dalle regole sui siti: nessuna richiesta all'AI.
  if (rest.length === 0) return byDomain(warnings);
  // Gemini Nano prepara la sessione mentre si leggono le pagine e lavora il Classificatore.
  generator?.prepare?.(classifier ? 'new-only' : 'full', languageName());
  // Le descrizioni servono solo all'AI: senza Classificatore né Generatore non si legge nessuna pagina,
  // e le pagine prese dalle regole non si leggono mai.
  const descriptions = inputs.readDescriptions && (classifier || generator) ? await readDescriptions(rest) : new Map<number, string>();
  signal?.throwIfAborted();
  clock?.lap('descriptions');
  const ctx = groupingContext(inputs, matches, descriptions);
```

3. In the full-Generator branch of `runPipeline`, replace the two lines computing `valid` and `groups`:

```ts
      // Solo gli ID delle tab inviate: un ID delle regole nella risposta viene ignorato.
      const valid = validateGroups(raw, new Set(ctx.tabs.map((t) => t.id)), ctx.knownNames);
      const groups = applyGroupRules(mergeByName([...ctx.siteGroups, ...valid]), ctx.rules).groups;
```

4. In `classifyThenGenerate`, replace the three lines from `const step1 = ...` to `const leftover = ...` with:

```ts
  // Le tab delle regole contano per il minimo della loro categoria insieme a quelle del Classificatore.
  const step1Groups = mergeByName([...ctx.siteGroups, ...byOption.values()]);
  const step1 = applyGroupRules(step1Groups, ctx.rules);
  const kept = step1Groups.filter((g) => !g.tabIds.some((id) => step1.leftover.includes(id)));
  // Le tab delle regole rimaste sotto il minimo restano libere: il Generatore non deve metterle altrove.
  const leftover = [...uncertain, ...step1.leftover.filter((id) => !ctx.rules.siteOf?.has(id))];
```

5. Update the `runPipeline` doc comment: add after the table `Prima di tutto le regole sui siti: le tab che prendono non arrivano all'AI e i loro gruppi si uniscono per nome a quelli dell'AI (o del dominio, nel ripiego).`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run compile`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/organizer/pipeline.ts tests/site-rules-pipeline.test.ts
git commit -m "feat: apply site rules before the AI levels"
```

---

### Task 6: "Remember this site" in the Organizer

**Files:**
- Create: `src/organizer/remember-site.ts`
- Modify: `src/organizer/index.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/messages.ts`
- Modify: `entrypoints/background.ts`
- Modify: `public/_locales/it/messages.json`, `public/_locales/en/messages.json`
- Test: `tests/site-rules-pipeline.test.ts` (append)

**Interfaces:**
- Consumes: `siteToRemember` (Task 2); `loadSettings`, `saveSettings`, `SettingsError`, `categoryKey` (settings); `collectInputs`, `signatureOf` (proposal-builder).
- Produces:
  - `OrganizerState.notice?: { key: string; arg?: string | string[] }`
  - `rememberTabSite(proposal: Proposal, tabId: number): Promise<{ proposal: Proposal; notice: NonNullable<OrganizerState['notice']> } | null>`
  - `Organizer.rememberSite(tabId: number): Promise<OrganizerState>`
  - request `{ type: 'organizer/remember-site'; tabId: number }`
  - i18n `panelSiteRemembered` ($SITE$, $CATEGORY$), `panelSiteMoved` ($SITE$, $FROM$, $TO$)

- [ ] **Step 1: Write the failing tests**

Append to `tests/site-rules-pipeline.test.ts` (add `loadSettings` to the settings import):

```ts
describe('Metti sempre qui', () => {
  it('ricorda il dominio della tab nella categoria del suo gruppo, e la proposta resta attuale', async () => {
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    const gitlab = strip.addTab({ url: 'https://www.gitlab.com/x', title: 'GitLab' });
    const { proposal } = await organizer.propose(W);
    const dev = proposal!.groups.find((g) => g.name === 'Dev')!;
    await organizer.edit({ kind: 'add-tab', tab: { tabId: gitlab, title: 'GitLab', url: 'https://www.gitlab.com/x' }, to: { groupId: dev.id } });

    const state = await organizer.rememberSite(gitlab);

    expect((await loadSettings()).categorySites).toEqual({ ...SITES, dev: ['github.com', 'gitlab.com'] });
    expect(state.notice).toEqual({ key: 'panelSiteRemembered', arg: ['gitlab.com', 'Dev'] });
    expect(state.proposal!.groups.find((g) => g.id === dev.id)!.tabs.find((t) => t.tabId === gitlab)!.rule).toBe('gitlab.com');
    // Riaprendo il pannello la proposta modificata resta.
    expect((await organizer.propose(W)).proposal).toEqual(state.proposal);
  });

  it('sposta dalla sua categoria il sito che oggi decide la tab', async () => {
    const orgA = strip.addTab({ url: 'https://github.com/mia-org/a', title: 'Org A' });
    strip.addTab({ url: 'https://github.com/mia-org/b', title: 'Org B' });
    strip.addTab({ url: 'https://github.com/x', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/y', title: 'Repo 2' });
    const { proposal } = await organizer.propose(W);
    const dev = proposal!.groups.find((g) => g.name === 'Dev')!;
    await organizer.edit({ kind: 'move-tab', tabId: orgA, toGroupId: dev.id });

    const state = await organizer.rememberSite(orgA);

    expect((await loadSettings()).categorySites).toEqual({ dev: ['github.com', 'github.com/mia-org'], google: SITES.google });
    expect(state.notice).toEqual({ key: 'panelSiteMoved', arg: ['github.com/mia-org', 'Work', 'Dev'] });
  });

  it('non fa nulla per i gruppi che non sono una categoria', async () => {
    const hn = strip.addTab({ url: 'https://news.ycombinator.com/', title: 'HN 1' });
    strip.addTab({ url: 'https://news.ycombinator.com/2', title: 'HN 2' });
    const before = await organizer.propose(W);

    const state = await organizer.rememberSite(hn);

    expect(state).toEqual(before);
    expect((await loadSettings()).categorySites).toEqual(SITES);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/site-rules-pipeline.test.ts`
Expected: FAIL — `organizer.rememberSite is not a function`.

- [ ] **Step 3: Allow several arguments in a notice**

In `src/shared/types.ts`, in `OrganizerState`:

```ts
  /** Esito dell'ultima operazione da mostrare nel pannello (chiave i18n e argomenti), es. dopo "Salva nella lista". */
  notice?: { key: string; arg?: string | string[] };
```

- [ ] **Step 4: Create `src/organizer/remember-site.ts`**

```ts
import { categoryKey, loadSettings, saveSettings, SettingsError } from '../settings';
import type { OrganizerState, Proposal } from '../shared/types';
import { collectInputs, signatureOf } from './proposal-builder';
import { siteToRemember } from './site-rules';

interface RememberResult {
  proposal: Proposal;
  notice: NonNullable<OrganizerState['notice']>;
}

/**
 * "Metti sempre qui": la tab andrà sempre nella categoria del gruppo in cui si trova ora nella
 * proposta. Si salva il sito della regola che oggi la decide (togliendolo dalla sua categoria),
 * oppure, senza regole, il suo dominio. Vale solo per i gruppi che sono una categoria: della lista,
 * o un gruppo aperto con lo stesso nome. Se la proposta era attuale resta attuale, con la nuova impronta.
 */
export async function rememberTabSite(proposal: Proposal, tabId: number): Promise<RememberResult | null> {
  const group = proposal.groups.find((g) => g.tabs.some((t) => t.tabId === tabId));
  if (!group || (group.provenance !== 'list' && group.provenance !== 'existing')) return null;
  const { categories, categorySites } = await loadSettings();
  const category = categories.find((c) => categoryKey(c.name) === categoryKey(group.name));
  const tab = group.tabs.find((t) => t.tabId === tabId)!;
  const site = siteToRemember(tab.url, categories, categorySites);
  if (!category || !site) return null;

  const from = categories.find((c) => c.id !== category.id && categorySites[c.id]?.includes(site));
  if (!categorySites[category.id]?.includes(site)) {
    const next = Object.fromEntries(Object.entries(categorySites).map(([id, sites]) => [id, sites.filter((s) => s !== site)]));
    next[category.id] = [...(next[category.id] ?? []), site];
    const wasCurrent = proposal.signature === signatureOf(await collectInputs(proposal.windowId));
    try {
      await saveSettings({ categorySites: next });
    } catch (err) {
      if (err instanceof SettingsError) return { proposal, notice: { key: err.messageKey } };
      throw err;
    }
    if (wasCurrent) proposal = { ...proposal, signature: signatureOf(await collectInputs(proposal.windowId)) };
  }

  const groups = proposal.groups.map((g) =>
    g.id === group.id ? { ...g, tabs: g.tabs.map((t) => (t.tabId === tabId ? { ...t, rule: site } : t)) } : g,
  );
  const notice = from
    ? { key: 'panelSiteMoved', arg: [site, from.name, category.name] }
    : { key: 'panelSiteRemembered', arg: [site, category.name] };
  return { proposal: { ...proposal, groups }, notice };
}
```

- [ ] **Step 5: Add `rememberSite` to the Organizer**

In `src/organizer/index.ts`:
- import: `import { rememberTabSite } from './remember-site';`
- in `interface Organizer`, after `saveToList`:

```ts
  /**
   * "Metti sempre qui": la tab andrà sempre nella categoria del suo gruppo nella proposta (vedi
   * `rememberTabSite`). Non fa nulla per i gruppi che non sono una categoria.
   */
  rememberSite(tabId: number): Promise<OrganizerState>;
```

- in the returned object, after `saveToList`:

```ts
    rememberSite(tabId) {
      return exclusive(async () => {
        const current = await loadState();
        if (current.phase !== 'ready' || !current.proposal) return current;
        const result = await rememberTabSite(current.proposal, tabId);
        if (!result) return current;
        return setState({ ...current, proposal: result.proposal, notice: result.notice });
      });
    },
```

- [ ] **Step 6: Wire the message**

In `src/shared/messages.ts`, add `| { type: 'organizer/remember-site'; tabId: number }` to `OrganizerRequest` and `'organizer/remember-site'` to `REQUEST_TYPES`.

In `entrypoints/background.ts`, in `handle`:

```ts
      case 'organizer/remember-site':
        return organizer.rememberSite(request.tabId);
```

- [ ] **Step 7: Add the notice texts**

`public/_locales/it/messages.json`:

```json
  "panelSiteRemembered": {
    "message": "Le tab di $SITE$ andranno sempre in $CATEGORY$.",
    "placeholders": { "site": { "content": "$1" }, "category": { "content": "$2" } }
  },
  "panelSiteMoved": {
    "message": "$SITE$ spostato da $FROM$ a $TO$.",
    "placeholders": { "site": { "content": "$1" }, "from": { "content": "$2" }, "to": { "content": "$3" } }
  },
```

`public/_locales/en/messages.json`:

```json
  "panelSiteRemembered": {
    "message": "Tabs from $SITE$ will always go to $CATEGORY$.",
    "placeholders": { "site": { "content": "$1" }, "category": { "content": "$2" } }
  },
  "panelSiteMoved": {
    "message": "$SITE$ moved from $FROM$ to $TO$.",
    "placeholders": { "site": { "content": "$1" }, "from": { "content": "$2" }, "to": { "content": "$3" } }
  },
```

(Format the placeholders on several lines to match the surrounding entries.)

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run && npm run compile`
Expected: all PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/organizer/remember-site.ts src/organizer/index.ts src/shared/types.ts src/shared/messages.ts entrypoints/background.ts public/_locales tests/site-rules-pipeline.test.ts
git commit -m "feat: remember a tab's site in its category"
```

---

### Task 7: Sites in the category editor

**Files:**
- Create: `entrypoints/options/SitesRow.tsx`
- Modify: `entrypoints/options/App.tsx`
- Modify: `entrypoints/options/style.css`
- Modify: `public/_locales/it/messages.json`, `public/_locales/en/messages.json`

**Interfaces:**
- Consumes: `normalizeSite`, `CategorySites`, `Settings.categorySites`, `resetCategories` (Task 1).
- Produces: `SitesRow({ category, categories, sites, onChange })` component.

This repo has no React component tests; the deliverable is verified by type check, build and a manual check.

- [ ] **Step 1: Create `entrypoints/options/SitesRow.tsx`**

```tsx
import { useState } from 'react';
import { normalizeSite, type CategorySites } from '../../src/settings';
import { t } from '../../src/shared/i18n';
import type { Category } from '../../src/shared/types';
import { Icon } from '../../src/ui/Icon';

interface SitesRowProps {
  category: Category;
  /** Tutte le categorie: servono a dire in quale si trova già un sito. */
  categories: Category[];
  sites: CategorySites;
  /** Salva tutti i siti; restituisce false se sono stati rifiutati. */
  onChange: (sites: CategorySites) => Promise<boolean>;
}

/** Riga "Siti" di una categoria: le tab di questi siti vanno sempre lì, senza chiedere all'AI. */
export function SitesRow({ category, categories, sites, onChange }: SitesRowProps) {
  // null = campo chiuso: una categoria senza siti mostra solo "+ Sito".
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; arg?: string } | null>(null);
  const own = sites[category.id] ?? [];

  function close() {
    setDraft(null);
    setError(null);
  }

  async function add() {
    const site = normalizeSite(draft ?? '');
    if (!site) return setError({ key: 'optionsSiteInvalid' });
    const owner = categories.find((c) => sites[c.id]?.includes(site));
    if (owner) return setError({ key: 'optionsSiteDuplicate', arg: owner.name });
    if (await onChange({ ...sites, [category.id]: [...own, site] })) close();
  }

  return (
    <div className="category-sites">
      {own.length > 0 && (
        <ul className="domains" aria-label={t('optionsSites')}>
          {own.map((site) => (
            <li key={site} className="chip">
              <span>{site}</span>
              <button
                className="icon danger"
                title={t('optionsRemove')}
                aria-label={`${t('optionsRemove')}: ${site}`}
                onClick={() => onChange({ ...sites, [category.id]: own.filter((s) => s !== site) })}
              >
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {draft === null ? (
        <button className="text small" title={t('optionsSitesHint')} onClick={() => setDraft('')}>
          <Icon name="add" size={18} />
          {t('optionsAddSite')}
        </button>
      ) : (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            type="text"
            autoFocus
            value={draft}
            placeholder={t('optionsSitePlaceholder')}
            aria-label={t('optionsSites')}
            aria-invalid={error !== null}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Escape' && close()}
          />
          <button type="submit" className="tonal">
            {t('optionsAdd')}
          </button>
        </form>
      )}
      {error && <p className="hint error">{t(error.key, error.arg)}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Show the Categories card in both modes and pass the sites**

In `entrypoints/options/App.tsx`:

1. In `SECTIONS`, remove `ai: true` from the `categories` entry.
2. Move the `<CategoriesSection … />` element out of the `{ai ? (<>…</>) : …}` block, right after `<ModeSection … />`, and give it the sites:

```tsx
        <CategoriesSection
          categories={settings.categories}
          sites={settings.categorySites}
          onChange={(categories) => update({ categories })}
          onSitesChange={(categorySites) => update({ categorySites })}
          onReset={async () => {
            const categories = await resetCategories();
            setSettings((current) => (current ? { ...current, categories, categorySites: {} } : current));
            confirmSaved();
          }}
        />
```

3. `update(patch)` merges the patch into the local state; but `saveSettings` prunes `categorySites` when categories change. After a category is deleted, reload the sites so the page shows the pruned value: change `update` so that, after a successful save, it does `setSettings(await loadSettings())` instead of merging the patch:

```ts
  async function update(patch: Partial<Settings>) {
    try {
      await saveSettings(patch);
    } catch (err) {
      console.error('autoGroup:', err);
      setSaveError(err instanceof SettingsError ? err.messageKey : 'errorSaveSettings');
      return false;
    }
    setSettings(await loadSettings());
    confirmSaved();
    return true;
  }
```

4. Extend `CategoriesSectionProps`:

```ts
  sites: CategorySites;
  /** Salva i siti di tutte le categorie; restituisce false se sono stati rifiutati. */
  onSitesChange: (sites: CategorySites) => Promise<boolean>;
```

and the signature `function CategoriesSection({ categories, sites, onChange, onSitesChange, onReset }: CategoriesSectionProps)`.

5. Inside each `<li className="category">`, after the `category-actions` div:

```tsx
            <SitesRow category={category} categories={draft} sites={sites} onChange={onSitesChange} />
```

6. Imports: `import { SitesRow } from './SitesRow';` and `type CategorySites` from `'../../src/settings'`.

- [ ] **Step 3: Style the row**

In `entrypoints/options/style.css`, after the `.category-actions` rules:

```css
.category-sites { grid-column: 2 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.category-sites .domains { margin: 0; }
.category-sites .inline-form { flex: 1 1 260px; }
.category-sites .hint { flex-basis: 100%; margin: 0; }
```

- [ ] **Step 4: Add and update texts**

`public/_locales/it/messages.json` (new keys):

```json
  "optionsSites": { "message": "Siti" },
  "optionsAddSite": { "message": "Sito" },
  "optionsSitesHint": { "message": "Le tab di questi siti vanno sempre in questa categoria, senza chiedere all'AI." },
  "optionsSitePlaceholder": { "message": "es. github.com/mia-org" },
  "optionsSiteInvalid": { "message": "Non sembra un sito valido." },
  "optionsSiteDuplicate": {
    "message": "Questo sito è già in $CATEGORY$.",
    "placeholders": { "category": { "content": "$1" } }
  },
```

Change `optionsCategoriesHint` to: `"Le categorie sono le opzioni tra cui sceglie l'AI. La descrizione spiega cosa ci rientra; il colore è quello del gruppo creato. Le tab dei siti di una categoria ci vanno sempre, anche nel raggruppamento per sito."`

Change `optionsModeDomainNote` to: `"Raggruppamento per sito: i provider AI non vengono usati e le categorie servono solo per i loro siti. Scegli \"Per argomento, con l'AI\" per configurare l'AI."`

`public/_locales/en/messages.json` (new keys):

```json
  "optionsSites": { "message": "Sites" },
  "optionsAddSite": { "message": "Site" },
  "optionsSitesHint": { "message": "Tabs from these sites always go to this category, without asking the AI." },
  "optionsSitePlaceholder": { "message": "e.g. github.com/my-org" },
  "optionsSiteInvalid": { "message": "This does not look like a valid site." },
  "optionsSiteDuplicate": {
    "message": "This site is already in $CATEGORY$.",
    "placeholders": { "category": { "content": "$1" } }
  },
```

Change `optionsCategoriesHint` to: `"Categories are the options the AI chooses from. The description explains what belongs in each one; the color is the color of the created group. Tabs from a category's sites always go there, also when grouping by site."`

Change `optionsModeDomainNote` to: `"Grouping by site: AI providers are not used and categories only count for their sites. Choose \"By topic, with AI\" to set up the AI."`

(Format multi-line like the surrounding entries.)

- [ ] **Step 5: Verify**

Run: `npm run check`
Expected: type check OK, all tests PASS (including `tests/locales.test.ts`), build OK.

Manual check: `npm run dev`, open the settings page:
- in *With AI* and in *By site* mode the Categories card is visible;
- "+ Site" on Dev, type `https://www.GitHub.com/Mia-Org/` + Enter → chip `github.com/mia-org`;
- typing the same site on Work → "This site is already in Dev.";
- Esc closes the field; ✕ removes the chip;
- deleting a category with sites and adding it again shows no old sites.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/options public/_locales
git commit -m "feat: edit category sites in the settings"
```

---

### Task 8: Rule chip and "remember" snackbar in the side panel

**Files:**
- Modify: `entrypoints/sidepanel/App.tsx`
- Modify: `public/_locales/it/messages.json`, `public/_locales/en/messages.json`

**Interfaces:**
- Consumes: `ProposedTab.rule` (Task 4); `siteToRemember` (Task 2); `organizer/remember-site` request (Task 6); `categoryKey` from settings.

- [ ] **Step 1: Show the rule chip**

In `TabRow`, after the `added` chip:

```tsx
      {tab.rule && (
        <span className="tab-chip muted" title={t('panelRuleHint', tab.rule)}>
          {t('panelRule')}
        </span>
      )}
```

- [ ] **Step 2: Offer "remember" after a move**

1. Imports: add `categoryKey` to the settings import; `import { siteToRemember } from '../../src/organizer/site-rules';`.

2. Above `App`, add:

```tsx
/** "Metti sempre qui" proposto dopo uno spostamento: la tab, il sito che verrebbe salvato e la categoria. */
interface RememberOffer {
  tabId: number;
  site: string;
  category: string;
}

/**
 * Dopo aver messo una tab in un gruppo che è una categoria (della lista o un gruppo aperto con lo
 * stesso nome), il sito che "Metti sempre qui" salverebbe. Nessuna offerta se ci va già.
 */
function rememberOffer(state: OrganizerState, tabId: number, settings: Settings | null): RememberOffer | null {
  const group = state.proposal?.groups.find((g) => g.tabs.some((t) => t.tabId === tabId));
  if (!settings || !group || (group.provenance !== 'list' && group.provenance !== 'existing')) return null;
  const category = settings.categories.find((c) => categoryKey(c.name) === categoryKey(group.name));
  const tab = group.tabs.find((t) => t.tabId === tabId)!;
  const site = siteToRemember(tab.url, settings.categories, settings.categorySites);
  if (!category || !site || settings.categorySites[category.id]?.includes(site)) return null;
  return { tabId, site, category: category.name };
}

/** Per quanto resta visibile l'offerta "Metti sempre qui". */
const OFFER_MS = 8000;
```

3. In `App`, next to the other `useState`s:

```tsx
  const [offer, setOffer] = useState<RememberOffer | null>(null);
  useEffect(() => {
    if (!offer) return;
    const timer = setTimeout(() => setOffer(null), OFFER_MS);
    return () => clearTimeout(timer);
  }, [offer]);
```

4. Make `edit` return the new state:

```tsx
  async function edit(change: ProposalEdit): Promise<OrganizerState | null> {
    setFailure(null);
    try {
      const next = await callOrganizer({ type: 'organizer/edit', edit: change });
      setState(next);
      return next;
    } catch (err) {
      console.error('autoGroup:', err);
      setFailure('errorUnexpected');
      return null;
    }
  }
```

5. Replace `moveTab`:

```tsx
  const moveTab = async (tab: ProposedTab, value: string) => {
    const target = targets.find((x) => x.value === value);
    if (!target) return;
    const next = await edit({ kind: 'add-tab', tab, to: target.to });
    setOffer(next ? rememberOffer(next, tab.tabId, settings) : null);
  };
```

6. In `recompute()` add `setOffer(null);`. In the "Apply" button callback (`run({ type: 'organizer/apply' }, () => { … })`) add `setOffer(null);`.

7. Replace the notice snackbar block (`{proposal && state?.notice && ( <div className="snackbar" …> … )}`) with:

```tsx
      {proposal && offer ? (
        <div className="snackbar" role="status">
          <span>{t('panelRememberSite', [offer.site, offer.category])}</span>
          <button
            className="text small inverse"
            onClick={() => {
              setOffer(null);
              run({ type: 'organizer/remember-site', tabId: offer.tabId });
            }}
          >
            {t('panelRememberSiteYes')}
          </button>
        </div>
      ) : (
        proposal &&
        state?.notice && (
          <div className="snackbar" role="status">
            <span>{t(state.notice.key, state.notice.arg)}</span>
            {state.notice.key === 'saveToListNoDescription' && (
              <button className="text small inverse" onClick={() => openSettings('categories')}>
                {t('popupWarningSettings')}
              </button>
            )}
          </div>
        )
      )}
```

- [ ] **Step 3: Add the texts**

`public/_locales/it/messages.json`:

```json
  "panelRule": { "message": "regola" },
  "panelRuleHint": {
    "message": "Regola: $SITE$",
    "placeholders": { "site": { "content": "$1" } }
  },
  "panelRememberSite": {
    "message": "Mettere sempre $SITE$ in $CATEGORY$?",
    "placeholders": { "site": { "content": "$1" }, "category": { "content": "$2" } }
  },
  "panelRememberSiteYes": { "message": "Sì" },
```

`public/_locales/en/messages.json`:

```json
  "panelRule": { "message": "rule" },
  "panelRuleHint": {
    "message": "Rule: $SITE$",
    "placeholders": { "site": { "content": "$1" } }
  },
  "panelRememberSite": {
    "message": "Always put $SITE$ in $CATEGORY$?",
    "placeholders": { "site": { "content": "$1" }, "category": { "content": "$2" } }
  },
  "panelRememberSiteYes": { "message": "Yes" },
```

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: type check OK, all tests PASS, build OK.

Manual check with `npm run dev`:
- with `github.com` in Dev and two GitHub tabs open, the panel shows group Dev with a "rule" chip on each tab (tooltip "Rule: github.com");
- move a `gitlab.com` tab into Dev → snackbar "Always put gitlab.com in Dev?" → **Yes** → snackbar "Tabs from gitlab.com will always go to Dev."; the settings page shows the new chip; the proposal is not marked stale;
- move a tab into a domain group → no snackbar;
- the snackbar disappears by itself after about 8 s.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/sidepanel/App.tsx public/_locales
git commit -m "feat: rule chip and remember-site offer in the side panel"
```

---

### Task 9: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: README**

In `README.md`, section "Choosing the AI", after the **Categories** paragraph, add:

```markdown
**Sites**: each category can also have sites, such as `github.com` or `github.com/my-org`. Tabs from those sites (subdomains included) always go to that category, before any AI, also when grouping *By site*: the AI only receives the other tabs. If two sites match, the more specific one wins. In the panel, after you move a tab into a category, autoGroup offers to **always put** that site there.
```

- [ ] **Step 2: Architecture**

In `docs/architecture.md`:

1. Folder structure, under `src/organizer/`: replace the `domain-grouping.ts` line with `domain-grouping.ts   domain of a URL ("no AI" level)` and add:

```
    site-rules.ts        site rules of the categories: matching, most specific rule, site to remember
    remember-site.ts     "Always put here": saves a tab's site in the category of its group
```

and under `settings/` → `index.ts`: `loading and saving, validation, excluded domains, category sites`.

2. Organizer table: add the row

```markdown
| `rememberSite(tabId)` | "Always put here": saves the site of the tab in the category of its group (list, or open group with the same name). The site is the one of the rule that decides the tab today, moved from its category, or the bare domain. The proposal stays current. |
```

3. Under "AI pipeline (`pipeline.ts`)", before "**Mode**", add a subsection:

```markdown
**Site rules** (`site-rules.ts`): before any level, the candidate tabs whose URL matches a site of a category (`settings.categorySites`, category ID → `domain[/path]`) are taken out. A domain matches its subdomains, a path matches by whole segments, case-insensitively; with several matches the most specific site wins (host labels + path segments, then the longer path). The other tabs follow the normal path: only they are read by the Description reader and sent to the Classifier or Generator. Rule groups are `ValidGroup`s with the same short IDs and are merged by name with the groups of the AI or of the domain grouping before `applyGroupRules`, so they follow the same minimum: a rule tab below the minimum stays ungrouped and is never passed to step 2. If every candidate is taken by a rule, no AI is queried and there is no preview. Tabs placed by a rule carry `rule` (the site) in the proposal; moving them clears it.
```

4. In "By-site preview", replace "that is `domainGroups` on the same tabs" with "that is `domainGroups` (site rules, then domain) on the same tabs".

5. Wherever the domain level is described, note that `domainGroups` now builds `ValidGroup`s by domain and passes them through `applyGroupRules` with provenance `domain`.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/architecture.md
git commit -m "docs: document category site rules"
```

---

## Final verification

- [ ] `npm run check` passes (type check, all tests, build).
- [ ] Manual run of the checks listed in Tasks 7 and 8.
