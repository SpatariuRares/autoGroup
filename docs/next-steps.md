# Next steps after v1.2.0

Open work after the v1.2.0 release (10 October 2026). The release is on GitHub: [v1.2.0](https://github.com/SpatariuRares/autoGroup/releases/tag/v1.2.0).

## Chrome Web Store

### 1. Publish v1.2.0 on the store (manual)

- [x] Upload `autogroup-1.2.0-chrome.zip` from the GitHub release in the developer dashboard.
- [ ] Paste the new store texts from [store/listing.md](store/listing.md), Italian and English. They now mention category sites, automatic grouping, duplicate tabs, backup and the five languages.
- [x] Upload the screenshots from `docs/store/it/` and `docs/store/en/` (`screenshot-1.png` to `screenshot-4.png`).
- [ ] In *Privacy practices*, update the justification of the `tabs` permission from [store/privacy-practices.md](store/privacy-practices.md). It now covers automatic grouping: when a tab's URL changes, it is checked against the category sites, locally, and nothing is sent anywhere.
- [ ] Republish the privacy policy from [store/privacy.md](store/privacy.md) (dated 10 October 2026) wherever it is hosted.

### 2. Store page in Spanish, French and German

The extension interface is now translated, but the store page is not: users with Chrome in Spanish, French or German see the English description.

- [ ] Add Spanish, French and German sections to [store/listing.md](store/listing.md), translated from the English one.
- [ ] Extend `scripts/store-assets.mjs` to generate screenshots in `es`, `fr` and `de` too. Today it only generates `it` and `en`: the captions are in `COPY` and the example tab titles in the table at the top of the script.
- [ ] Paste the texts and upload the screenshots for each language in the dashboard.

### 3. Native-speaker review of the translations

The files in `public/_locales/{es,fr,de}` were translated by AI agents. Keys, placeholders and store length limits are checked by `tests/locales.test.ts`, but the wording was not reviewed line by line, and the panel was never seen in these languages. Doubtful choices to check first:

| Language | Key | Current text | Doubt |
|---|---|---|---|
| es | `provenance_ai` | nuevo IA | Literal copy of the Italian "nuovo AI"; "creado por IA" is clearer but longer |
| es | `optionsResetCategories` | Restablecer predeterminadas | Shortened for space |
| es | `category_dev_description` | (keeps "issues", "CI", "consolas cloud") | Tech jargon left in English |
| fr | `category_dev_name` | Dév | "Développement" if the width allows |
| fr | `category_social_name` | Réseaux sociaux | Much longer than "Social", which also works in French |
| fr | `provenance_ai` | nouveau (IA) | "créé par l'IA" is clearer but longer |
| fr | `optionsResetCategories` | Rétablir les valeurs par défaut | Long for a button; "Rétablir par défaut" is shorter |
| de | `popupUndo`, `popupUndone`, `errorUndo` | "Ordnung" for "organization" | "Gruppierung" is the alternative |
| de | `panelHeldExcluded` | ausgeschl. Domain | Abbreviated for the chip |
| de | `category_dev_name` | Entwicklung | Much longer than "Dev" |
| de | `optionsNavAbout` | Über | Very short; check it reads well in the menu |

To see the interface in one language, start Chrome with that language, e.g. `--lang=de`, and load the build from `.output/chrome-mv3`.

## Side panel

### 4. Fewer Tab presses (roving tabindex)

Up and down arrows already move between tab rows (`entrypoints/sidepanel/row-navigation.ts`), but Tab still stops on every control of every row: with 9 tabs that is about 27 presses to reach "Apply".

- [ ] Make the tab list a single Tab stop: only the current row's controls are in the Tab order (`tabIndex={0}`), all other rows' controls get `tabIndex={-1}`.
- [ ] Arrows move the current row, as today; Tab leaves the list and goes to the next section or to the bottom bar.
- [ ] Keep the "Move to…" menus' native arrows.
- [ ] Add a smoke check: from the first row, one Tab press leaves the list.

### 5. Make duplicates easier to spot

Today the duplicates show up only in the banner, through "Review".

- [ ] Add a "duplicate" chip on the rows that "Close duplicates" would close, like the existing "new" and "rule" chips in `TabRow.tsx`.
- [ ] Decide whether to look for duplicates across all windows. Today `findDuplicates` only looks at the current window, like the rest of the panel.
