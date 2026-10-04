# autoGroup

Estensione Chrome (Manifest V3) che raggruppa le tab come "Organizza schede" di Microsoft Edge, con la possibilità di collegare un provider AI a scelta: un classificatore System One (Jev, Kev, Rizzo Flow) e/o un LLM compatibile OpenAI (OpenRouter, Ollama, LM Studio, Unsloth Studio, Gemini Nano integrato in Chrome).

Interfaccia in italiano e in inglese (segue la lingua di Chrome). La documentazione tecnica è in [`docs/`](docs/README.md).

## Installazione

Serve Node.js 20 o superiore.

```bash
npm install
npm run build        # crea .output/chrome-mv3
```

1. Apri `chrome://extensions` e attiva **Modalità sviluppatore**.
2. **Carica estensione non pacchettizzata** e scegli la cartella `.output/chrome-mv3`.
3. (Facoltativo) Fissa l'icona di autoGroup nella barra degli strumenti.

La scorciatoia suggerita per aprire il popup è `Alt+Shift+G`. Si cambia da `chrome://extensions/shortcuts`; se un'altra estensione la usa già, Chrome non la assegna e va scelta lì.

Per lo sviluppo: `npm run dev` apre Chrome con l'estensione caricata e la ricarica a ogni modifica. Comandi di verifica:

| Comando | Cosa fa |
|---|---|
| `npm run check` | Controllo dei tipi, test (Vitest) e build |
| `npm run smoke` | Prova completa in Chrome for Testing con Puppeteer, con provider AI finti in locale |
| `npm run zip` | Crea lo zip per il Chrome Web Store |

Senza nessun provider configurato l'estensione funziona subito: raggruppa le tab per dominio (o usa Gemini Nano se Chrome lo rende disponibile).

## Come funziona

1. Clicchi l'icona dell'estensione (o `Alt+Shift+G`).
2. Il service worker raccoglie le tab della **finestra corrente** e calcola una proposta di gruppi.
3. Il popup mostra un'**anteprima modificabile**.
4. Premi **Applica**: i gruppi vengono creati. Se qualcosa non ti piace, **Annulla** riporta tutto com'era.

L'estensione non tocca mai le tab senza conferma. Non c'è raggruppamento automatico all'apertura di nuove tab.

### Quali tab vengono considerate

- Solo la finestra corrente: i gruppi di Chrome esistono dentro una singola finestra.
- Escluse: tab fissate, tab già in un gruppo, pagine interne (`chrome://`, nuova scheda), tab ancora senza titolo, tab dei domini esclusi (vedi [Privacy](#privacy)).
- I gruppi già aperti non vengono modificati: servono come **opzioni** in cui inserire le tab libere.

## Pipeline di classificazione

Due ruoli distinti, ognuno con il suo adattatore:

| Ruolo | Protocollo | Cosa fa | Preset |
|---|---|---|---|
| **Classificatore** | System One (`POST /v1/systemone`) | Sceglie una categoria tra quelle note, con confidenza calibrata | Jev (`https://api.typesafe.ai`), Kev (`http://127.0.0.1:8009`), Rizzo Flow (`http://127.0.0.1:8017`) |
| **Generatore** | Compatibile OpenAI (`/chat/completions`) | Inventa nomi di nuove categorie | OpenRouter (`https://openrouter.ai/api/v1`), Ollama (`http://localhost:11434/v1`), LM Studio (`http://localhost:1234/v1`), Unsloth Studio (`http://127.0.0.1:8888/v1`), Gemini Nano (Prompt API di Chrome, nessuna configurazione) |

**Passo 1, Classificatore.** Per ogni tab una domanda `choice` con queste opzioni: categorie della lista + gruppi già aperti nella finestra. Le tab sopra la soglia di confidenza (default 0,7, configurabile) vengono assegnate.

**Passo 2, Generatore.** Riceve in un'unica chiamata (Gemini Nano: in blocchi, se le tab non entrano nella sua finestra di contesto) le tab rimaste: confidenza sotto soglia, oppure categoria con una sola tab (vedi sotto). Propone gruppi nuovi con nomi di massimo 2 parole, nella lingua del browser.

### Fallback in base a cosa è configurato

| Classificatore | Generatore | Comportamento |
|---|---|---|
| sì | sì | Pipeline completa: passo 1, poi il passo 2 sulle tab rimaste |
| sì | no | Solo passo 1: le tab rimaste restano libere |
| no | sì | Il Generatore fa tutto in una chiamata: sceglie dalla lista o dai gruppi esistenti, oppure inventa |
| no | no | Raggruppamento per dominio |

Generatore usato, in ordine: quello configurato dall'utente, altrimenti Gemini Nano se `LanguageModel.availability()` lo segnala disponibile, altrimenti nessuno.

Il Classificatore viene saltato se non ci sono opzioni (lista vuota e nessun gruppo aperto); il passo 2 se le tab rimaste sono meno del minimo per un gruppo nuovo.

### Regole sui gruppi

- Un **gruppo nuovo** richiede almeno **2 tab** (configurabile).
- Una tab può entrare **da sola** in un gruppo già esistente.
- Le tab rimaste sole dopo il passo 1 passano al Generatore; i gruppi nuovi che dopo il passo 2 hanno ancora meno di 2 tab vengono sciolti.
- Le stesse regole valgono per il raggruppamento per dominio.

### Note su `jev-router`

Su OpenRouter c'è `typesafe/jev-router`, che però **non** è il classificatore Jev: è un router che inoltra la richiesta a un LLM scelto di volta in volta, quindi senza confidenza calibrata e con un prezzo variabile. Per questo non lo usiamo come Classificatore. Jev vero è disponibile solo tramite l'API TypeSafe diretta, oppure con le alternative locali che ne replicano il protocollo (Kev, Rizzo Flow).

## Configurazione dei provider

Nelle impostazioni (clic destro sull'icona → **Opzioni**, oppure il link negli avvisi del popup) ogni ruolo ha un preset, l'URL, la chiave API e il modello. I campi si possono modificare anche partendo da un preset; **Personalizzato** serve per qualsiasi altro server compatibile.

- Al **Salva** Chrome chiede il permesso di contattare l'host del provider: è un permesso opzionale, concesso solo per quell'host. Cambiando provider il permesso del vecchio host viene tolto, a meno che l'altro ruolo non lo usi ancora.
- **Prova connessione** fa una richiesta minima e mostra l'esito (chiave non valida, server non raggiungibile, modello inesistente, …).
- Le chiavi API restano in `chrome.storage.local` e non vengono sincronizzate.

### Classificatore (System One)

| Preset | URL | Chiave | Modello | Note |
|---|---|---|---|---|
| Jev | `https://api.typesafe.ai` | sì (TypeSafe) | `jev-latest` | Servizio remoto: titoli e URL escono dal computer |
| Kev | `http://127.0.0.1:8009` | no | facoltativo | Locale. Su un Mac portatile usare `kev-0.8b` (~4 GB); la 4B di default richiede ~17 GB |
| Rizzo Flow | `http://127.0.0.1:8017` | no | facoltativo | Locale. 1.7B (~1,8 GB) o 4B (~4,4 GB), con Metal, MLX o CPU |

La soglia di confidenza (default 0,7) si imposta nella stessa sezione: le tab sotto soglia passano al Generatore.

### Generatore (compatibile OpenAI)

| Preset | URL | Chiave | Modello | Note |
|---|---|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | sì | `openai/gpt-4o-mini` (modificabile) | Servizio remoto |
| Ollama | `http://localhost:11434/v1` | no | `llama3.2` (o un altro modello scaricato) | Vedi sotto per `OLLAMA_ORIGINS` |
| LM Studio | `http://localhost:1234/v1` | no | quello caricato | Avviare il server locale da LM Studio |
| Unsloth Studio | `http://127.0.0.1:8888/v1` | sì | quello caricato | La chiave API si crea in Studio dopo l'accesso |

Il Generatore chiede una risposta in JSON con schema (`response_format: json_schema`); se il server non lo supporta e risponde 400, ripete la richiesta senza schema e valida la risposta lato estensione.

**Ollama.** Ollama controlla l'origine delle richieste e può rifiutare quelle che arrivano da `chrome-extension://…` con un 403, che nel popup appare come "chiave API non valida". In quel caso avviarlo consentendo le estensioni:

```bash
OLLAMA_ORIGINS="chrome-extension://*" ollama serve
# app per macOS: launchctl setenv OLLAMA_ORIGINS "chrome-extension://*" e riavviare Ollama
```

**Gemini Nano.** Non richiede configurazione: con il Generatore su **Nessuno**, la sezione mostra lo stato del modello integrato in Chrome (disponibile, da scaricare, in download, non disponibile) e un pulsante per avviare il download. Serve un Chrome recente con la Prompt API e hardware supportato (spazio su disco e GPU o RAM sufficienti, secondo i requisiti di Google). Se il modello non è ancora scaricato, il popup lo segnala con un avviso e usa il livello successivo.

## Categorie

La lista fissa è la "memoria" dell'estensione. Ogni categoria ha:

- **nome** breve (le etichette dei gruppi in Chrome hanno poco spazio);
- **descrizione**, passata come `criteria` al Classificatore e come contesto al Generatore;
- **colore** fisso, scelto tra i 9 di Chrome.

Default, nella lingua del browser: Lavoro, Sviluppo, AI, Social, Notizie, Video, Shopping, Viaggi, Finanza, Studio.

- **Corrispondenza per nome:** se un gruppo aperto si chiama come una categoria (maiuscole e minuscole non contano), se ne usano descrizione e colore. Altrimenti la descrizione è "Gruppo creato dall'utente: «nome»".
- **Gruppi inventati dall'AI:** non vengono salvati in automatico. Nell'anteprima c'è il pulsante **Salva nella lista**, che aggiunge la categoria con una descrizione generata e modificabile.
- I gruppi inventati ricevono un colore a rotazione tra quelli non ancora usati nella finestra.

## Anteprima (popup)

- Il calcolo gira nel **service worker** e la proposta è salvata in `chrome.storage.session`: se il popup si chiude (basta cliccare fuori), riaprendolo la si ritrova.
- Si può: rinominare un gruppo e cambiarne il colore, togliere una tab (✕, la tab resta libera), spostare una tab in un altro gruppo (menu a tendina), scartare un gruppo intero.
- Ogni gruppo ha un'etichetta con la provenienza: *lista*, *esistente*, *nuovo (AI)*, *dominio*.
- Pulsante **Interrompi** durante il calcolo.
- Il drag & drop è rimandato a dopo.

## Annulla

- Prima di applicare si salva una foto dello stato in `chrome.storage.session`: per ogni tab l'ID, il gruppo (o nessuno) e la posizione.
- **Annulla ultima organizzazione** resta disponibile nel popup fino all'organizzazione successiva o alla chiusura di Chrome.
- Il ripristino è "per quanto possibile": le tab chiuse nel frattempo vengono ignorate, quelle nuove non vengono toccate, i gruppi rinominati dopo non vengono rinominati all'indietro.

## Errori

- Se un provider fallisce, **si scende di un livello** nella tabella dei fallback e si mostra comunque un'anteprima.
- L'anteprima mostra un **avviso** con la causa (es. "Kev (http://127.0.0.1:8009) non raggiungibile") e un link alle impostazioni. Per 401 e 403: "chiave non valida"; per 400, 404 e 422: richiesta rifiutata (di solito il modello è sbagliato); per 429 e 529: troppe richieste.
- Timeout per singola richiesta: **5 s** per il Classificatore (ogni tab), **30 s** per il Generatore (con Gemini Nano: ogni blocco di tab).
- Se il Classificatore fallisce su una tab, le richieste per le altre tab si fermano subito.
- **Un solo nuovo tentativo**, con una breve attesa, solo per 429, 529 e 5xx.
- La risposta del Generatore viene validata contro uno schema JSON (structured output dove supportato). Le tab sono indicate con ID brevi (`t1`, `t2`, …). ID inesistenti, duplicati o nomi vuoti vengono scartati e quelle tab restano libere.

## Privacy

Dati inviati all'AI per ogni tab:

- **titolo**;
- **URL ripulito**: dominio e percorso, senza `?query` né `#frammento`;
- **descrizione della pagina** (`<meta name="description">`, oppure `og:description` se la prima manca o è vuota), solo se l'utente attiva l'opzione nelle impostazioni e concede il permesso opzionale `<all_urls>`.
  - Lettura con `chrome.scripting.executeScript`, in parallelo, con un timeout di ~500 ms per tab.
  - Fallback tab per tab a titolo e URL quando la pagina non è leggibile (tab sospese da Risparmio memoria, `chrome://`, Web Store, PDF). **Le tab sospese non vengono mai risvegliate.**

Lista di **domini esclusi** (vuota di default): le tab di quei domini non vengono mai inviate e restano libere.

Con i provider locali (Kev, Rizzo, Ollama, LM Studio, Gemini Nano) nessun dato esce dal computer.

## Impostazioni

Pagina opzioni in una tab intera (`options_ui.open_in_tab`):

1. **Categorie**: nome, descrizione e colore; si possono aggiungere, modificare, eliminare e riordinare; c'è un pulsante "Ripristina default".
2. **Classificatore**: preset, URL, chiave API, modello, soglia di confidenza, pulsante "Prova connessione".
3. **Generatore**: preset, URL, chiave API, modello, pulsante "Prova connessione"; con **Nessuno**, lo stato di Gemini Nano.
4. **Comportamento**: numero minimo di tab per gruppo.
5. **Privacy**: interruttore per la descrizione delle pagine, domini esclusi.

Salvataggio: chiavi API in `chrome.storage.local` (non sincronizzate); categorie e preferenze in `chrome.storage.sync`.

## Permessi

- Obbligatori: `tabs`, `tabGroups`, `storage`, `scripting`.
- Opzionali, richiesti al momento: gli host dei provider configurati (al salvataggio del provider) e `<all_urls>` per la descrizione delle pagine (all'accensione dell'interruttore). Spegnendo l'opzione o cambiando provider il permesso viene tolto.
- Scorciatoia: `commands._execute_action`, che non richiede permessi.

## Stack

- [WXT](https://wxt.dev) + TypeScript
- React per popup e impostazioni
- Vitest + fake browser di WXT per testare pipeline, fallback, validazione e annulla senza aprire Chrome
- Testi tramite `chrome.i18n` fin dall'inizio (italiano e inglese)

## Tappe

Tutte completate; il dettaglio per issue è in [`docs/lavoro-svolto.md`](docs/lavoro-svolto.md).

1. **Struttura di base**: progetto WXT, popup, service worker, anteprima modificabile, Applica e Annulla, raggruppamento per dominio.
2. **Impostazioni**: pagina opzioni, categorie, privacy, comportamento, corrispondenza per nome con i gruppi aperti.
3. **Generatore**: adattatore compatibile OpenAI (OpenRouter, Ollama, LM Studio) + Gemini Nano.
4. **Classificatore**: adattatore System One (Jev, Kev, Rizzo), soglia, passaggio delle tab rimaste al Generatore, Salva nella lista.
5. **Descrizione delle pagine**: permesso opzionale `<all_urls>`, lettura in parallelo con fallback.
6. **Rifinitura**: traduzioni italiano e inglese, scorciatoia da tastiera, revisione del README.

## TODO: pubblicazione sul Chrome Web Store

Per ora l'estensione è per uso personale (caricata come estensione non pacchettizzata), ma è già progettata per essere pubblicata: permessi opzionali e testi in `chrome.i18n`. Prima di pubblicare serve:

- [ ] **Informativa privacy** pubblica: inviamo titoli, URL e, se attivata, la descrizione delle pagine a servizi esterni (TypeSafe, OpenRouter). Il Web Store la richiede.
- [ ] Compilare la sezione **Privacy practices** della dashboard sviluppatore (dati raccolti, finalità, nessuna vendita a terzi).
- [ ] **Onboarding** al primo avvio: spiegare i livelli di fallback e guidare la configurazione di un provider.
- [ ] Pagina dello store: descrizione, screenshot, icone in tutte le dimensioni richieste.
- [x] Traduzioni complete in italiano e inglese per l'interfaccia (controllate dai test).
- [ ] Traduzioni della scheda dello store.
- [x] Verificare che nessun permesso obbligatorio vada oltre il necessario (solo `tabs`, `tabGroups`, `storage`, `scripting`).
- [ ] Motivare ogni permesso nella richiesta di revisione.
- [ ] Provare a mano la rimozione di `<all_urls>` quando un provider usa un host già coperto (vedi [review AG-R3](docs/review/AG-R3.md)).
- [ ] Generare lo zip con `wxt zip` e caricarlo.

## Fuori scope (per ora)

- Raggruppamento automatico all'apertura di nuove tab.
- Pulsante "Riorganizza tutto", che rimetterebbe in gioco anche le tab già raggruppate.
- Raggruppamento su più finestre.
- Drag & drop nell'anteprima.
- Adattatori per protocolli diversi da System One e compatibile OpenAI.
