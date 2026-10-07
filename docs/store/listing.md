# Chrome Web Store listing

Texts to paste into the developer dashboard ("Store listing" tab), per language.

**No lists of brand names in the description.** The first version was rejected on 5 October 2026 ("Yellow Argon" violation, *excessive keywords*) because of the lists of product names ("Ollama, LM Studio, Unsloth Studio", "OpenRouter", "Jev, Kev, Rizzo Flow"). Each option must be described by what it does; the provider names belong in the extension and in the README. Name and summary already come from the manifest (`extName`, `extDescription` in `public/_locales`); the detailed description is written in the dashboard for each language.

- **Category**: Productivity → Workflow & Planning (*Produttività → Flusso di lavoro e pianificazione*).
- **Languages**: Italian (default language of the manifest) and English.
- **Images**: `docs/store/<language>/screenshot-1…4.png` (1280×800), `docs/store/<language>/promo-small.png` (440×280), icon `docs/store/icon-128.png`. Regenerate them with `npm run store-assets`.
- **Website / support**: to fill in if you publish the repository or a project page.
- **Privacy policy**: the URL of the page published from [privacy.md](privacy.md).

## Italian

**Nome** (from the manifest): autoGroup – AI Tab Groups

**Riepilogo** (from the manifest, 65 characters out of 132): Raggruppa le tab con l'AI che scegli tu, con anteprima e annulla.

**Descrizione dettagliata**:

```text
Troppe tab aperte? autoGroup le divide in gruppi di Chrome, per sito o per argomento, e ti mostra la proposta prima di toccare qualunque cosa.

COME FUNZIONA
• Clicchi l'icona (o premi Alt+Shift+G) e si apre il pannello laterale con la proposta per la finestra.
• Controlli e modifichi i gruppi: rinomina, colore, sposta o togli una tab, scarta un gruppo.
• Premi «Applica» e i gruppi vengono creati. «Annulla» rimette tutto com'era.
Nessuna tab si muove senza la tua conferma.

DUE MODALITÀ
• Per sito: le tab dello stesso sito nello stesso gruppo. Immediato, nessuna configurazione, nessun dato esce dal computer.
• Con l'AI: le tab divise per argomento, tra le tue categorie o in gruppi nuovi proposti dall'AI. I gruppi già aperti vengono estesi con le tab che c'entrano.

L'AI LA SCEGLI TU
• Il modello integrato in Chrome, se il tuo computer lo supporta: gratis, senza chiavi, nessun dato esce dal computer.
• Un modello che gira sul tuo computer.
• Un servizio online compatibile con le API di OpenAI, con la tua chiave.
• Facoltativo: un classificatore veloce che assegna le tab alle tue categorie.
Se l'AI non risponde si passa al raggruppamento per sito: una proposta arriva sempre. Mentre l'AI lavora vedi già la proposta per sito, e con «Usa questa» non aspetti.

PRIVACY
• Nessun server dello sviluppatore, nessuna statistica.
• All'AI arrivano solo titolo e indirizzo ripulito delle tab (senza parametri), mai le tab fissate, già raggruppate o dei domini che escludi.
• La lettura della descrizione delle pagine è facoltativa e chiede il permesso solo quando la accendi.
• Le chiavi API restano su questo computer.

Una guida al primo avvio ti aiuta a scegliere modalità e provider. Interfaccia in italiano e in inglese.
```

## English

**Name** (from the manifest): autoGroup – AI Tab Groups

**Summary** (from the manifest, 66 characters out of 132): Group your tabs with the AI of your choice, with preview and undo.

**Detailed description**:

```text
Too many open tabs? autoGroup sorts them into Chrome tab groups, by site or by topic, and shows you the proposal before touching anything.

HOW IT WORKS
• Click the icon (or press Alt+Shift+G) and the side panel opens with a proposal for your window.
• Review and edit the groups: rename, recolor, move or remove a tab, discard a group.
• Press "Apply" and the groups are created. "Undo" puts everything back.
No tab moves without your confirmation.

TWO MODES
• By site: tabs from the same site go in the same group. Instant, no setup, no data leaves your computer.
• With AI: tabs sorted by topic, into your categories or new groups suggested by the AI. Groups you already have open are extended with the tabs that belong there.

YOU CHOOSE THE AI
• The model built into Chrome, if your computer supports it: free, no keys, no data leaves your computer.
• A model running on your computer.
• An online service compatible with the OpenAI API, with your own key.
• Optional: a fast classifier that puts tabs into your categories.
If the AI doesn't answer, grouping by site takes over: you always get a proposal. While the AI works you already see the by-site proposal, and "Use this" saves you the wait.

PRIVACY
• No developer servers, no analytics.
• The AI only receives the title and cleaned address of your tabs (no parameters), never pinned tabs, grouped tabs or tabs from domains you exclude.
• Reading page descriptions is optional and asks for permission only when you turn it on.
• API keys stay on this computer.

A first-run guide helps you choose the mode and the provider. Interface in English and Italian.
```

## Screenshot captions

| # | Italian | English |
|---|---|---|
| 1 | Le tab in ordine, per argomento | Your tabs, sorted by topic |
| 2 | Subito una proposta, mentre l'AI pensa | A proposal right away, while the AI thinks |
| 3 | L'AI la scegli tu | You choose the AI |
| 4 | Le tue categorie | Your categories |

The captions are already in the images (see `COPY` in `scripts/store-assets.mjs`).
