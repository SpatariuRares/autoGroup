# Scheda del Chrome Web Store

Testi da incollare nella dashboard sviluppatore (scheda "Store listing"), per lingua. Nome e riepilogo arrivano già dal manifest (`extName`, `extDescription` in `public/_locales`); la descrizione dettagliata si scrive nella dashboard per ogni lingua.

- **Categoria**: Produttività → Flusso di lavoro e pianificazione (*Productivity → Workflow & Planning*).
- **Lingue**: italiano (lingua predefinita del manifest) e inglese.
- **Immagini**: `docs/store/<lingua>/screenshot-1…4.png` (1280×800), `docs/store/<lingua>/promo-small.png` (440×280), icona `docs/store/icon-128.png`. Si rigenerano con `npm run store-assets`.
- **Sito web / assistenza**: da compilare se pubblichi il repository o una pagina del progetto.
- **Informativa privacy**: l'URL della pagina pubblicata da [privacy.md](privacy.md).

## Italiano

**Nome**: autoGroup

**Riepilogo** (dal manifest, 65 caratteri su 132): Raggruppa le tab con l'AI che scegli tu, con anteprima e annulla.

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
• Con l'AI: le tab divise per argomento, tra le tue categorie (Lavoro, Sviluppo, Notizie, Viaggi…) o in gruppi nuovi inventati dall'AI. I gruppi già aperti vengono estesi con le tab che c'entrano.

L'AI LA SCEGLI TU
• Gemini Nano, integrato in Chrome: gratis, senza chiavi, nessun dato esce dal computer (se il tuo computer lo supporta).
• Un server sul tuo computer: Ollama, LM Studio, Unsloth Studio.
• Un servizio online compatibile OpenAI, come OpenRouter, con la tua chiave.
• Facoltativo: un classificatore System One (Jev, Kev, Rizzo Flow), veloce ed economico, per assegnare le tab alle categorie.
Se un livello non risponde si passa al successivo, fino al raggruppamento per sito: una proposta arriva sempre. Mentre l'AI lavora vedi già la proposta per sito, e con «Usa questa» non aspetti.

PRIVACY
• Nessun server dello sviluppatore, nessuna statistica.
• All'AI arrivano solo titolo e indirizzo ripulito delle tab (senza parametri), mai le tab fissate, già raggruppate o dei domini che escludi.
• La lettura della descrizione delle pagine è facoltativa e chiede il permesso solo quando la accendi.
• Le chiavi API restano su questo computer.

Una guida al primo avvio ti aiuta a scegliere modalità e provider. Interfaccia in italiano e in inglese.
```

## English

**Name**: autoGroup

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
• With AI: tabs sorted by topic, into your categories (Work, Dev, News, Travel…) or new groups made up by the AI. Groups you already have open are extended with the tabs that belong there.

YOU CHOOSE THE AI
• Gemini Nano, built into Chrome: free, no keys, no data leaves your computer (if your computer supports it).
• A server on your computer: Ollama, LM Studio, Unsloth Studio.
• An OpenAI-compatible online service, such as OpenRouter, with your own key.
• Optional: a System One classifier (Jev, Kev, Rizzo Flow), fast and cheap, to put tabs into your categories.
If a level doesn't answer, the next one takes over, down to grouping by site: you always get a proposal. While the AI works you already see the by-site proposal, and "Use this" saves you the wait.

PRIVACY
• No developer servers, no analytics.
• The AI only receives the title and cleaned address of your tabs (no parameters), never pinned tabs, grouped tabs or tabs from domains you exclude.
• Reading page descriptions is optional and asks for permission only when you turn it on.
• API keys stay on this computer.

A first-run guide helps you choose the mode and the provider. Interface in English and Italian.
```

## Didascalie degli screenshot

| # | Italiano | English |
|---|---|---|
| 1 | Le tab in ordine, per argomento | Your tabs, sorted by topic |
| 2 | Subito una proposta, mentre l'AI pensa | A proposal right away, while the AI thinks |
| 3 | L'AI la scegli tu | You choose the AI |
| 4 | Le tue categorie | Your categories |

Le didascalie sono già nelle immagini (vedi `COPY` in `scripts/store-assets.mjs`).
