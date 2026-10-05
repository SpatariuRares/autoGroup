# autoGroup

Estensione Chrome (Manifest V3) che raggruppa le tab come "Organizza schede" di Microsoft Edge, con la possibilità di collegare un provider AI a scelta: un classificatore System One (Jev, Kev, Rizzo Flow) e/o un LLM compatibile OpenAI (OpenRouter, Ollama, LM Studio, Unsloth Studio, Gemini Nano integrato in Chrome).

Interfaccia in italiano e in inglese (segue la lingua di Chrome). La documentazione tecnica è in [`docs/`](docs/README.md).

<a href="https://www.buymeacoffee.com/SpatariuRares"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=✈️&slug=SpatariuRares&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" /></a>

## Installazione

Serve Node.js 20 o superiore.

```bash
npm install
npm run build        # crea .output/chrome-mv3
```

1. Apri `chrome://extensions` e attiva **Modalità sviluppatore**.
2. **Carica estensione non pacchettizzata** e scegli la cartella `.output/chrome-mv3`.
3. (Facoltativo) Fissa l'icona di autoGroup nella barra degli strumenti.

Alla prima installazione si apre una **guida** a passi: modalità, Generatore, Classificatore facoltativo e un riepilogo dei livelli di ripiego. Si può rivedere dalle impostazioni ("Rivedi la guida").

Il clic sull'icona apre il **pannello laterale** di autoGroup. La scorciatoia suggerita è `Alt+Shift+G`. Si cambia da `chrome://extensions/shortcuts`; se un'altra estensione la usa già, Chrome non la assegna e va scelta lì.

Per lo sviluppo: `npm run dev` apre Chrome con l'estensione caricata e la ricarica a ogni modifica. Comandi di verifica:

| Comando | Cosa fa |
|---|---|
| `npm run check` | Controllo dei tipi, test (Vitest) e build |
| `npm run smoke` | Prova completa in Chrome for Testing con Puppeteer, con provider AI finti in locale |
| `npm run zip` | Crea lo zip per il Chrome Web Store |

Senza nessuna configurazione l'estensione funziona subito: usa Gemini Nano se Chrome lo rende disponibile, altrimenti raggruppa le tab per sito. Chi vuole solo il raggruppamento per sito lo sceglie in cima alle impostazioni.

## Come funziona

1. Clicchi l'icona dell'estensione (o `Alt+Shift+G`).
2. Il service worker raccoglie le tab della **finestra corrente** e calcola una proposta di gruppi.
3. Il pannello laterale mostra un'**anteprima modificabile**. Resta aperto mentre l'AI calcola e mentre cambi tab.
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

Generatore usato: quello scelto dall'utente nelle impostazioni, cioè un server compatibile OpenAI, Gemini Nano (il default, usato solo se `LanguageModel.availability()` lo dà disponibile) oppure **Nessuno**. Un server senza permesso o non raggiungibile non viene sostituito da Nano: si scende di livello con un avviso.

In cima alle impostazioni si sceglie **come raggruppare**: *Per sito* (sempre per dominio: nessuna AI, nessun dato inviato, nessuna pagina letta) oppure *Per argomento, con l'AI* (la tabella sopra).

Il Classificatore viene saltato se non ci sono opzioni (lista vuota e nessun gruppo aperto); il passo 2 se le tab rimaste sono meno del minimo per un gruppo nuovo.

### Regole sui gruppi

- Un **gruppo nuovo** richiede almeno **2 tab** (configurabile).
- Una tab può entrare **da sola** in un gruppo già esistente.
- Le tab rimaste sole dopo il passo 1 passano al Generatore; i gruppi nuovi che dopo il passo 2 hanno ancora meno di 2 tab vengono sciolti.
- Le stesse regole valgono per il raggruppamento per dominio: le tab di un sito entrano anche da sole in un gruppo aperto che si chiama come il dominio.

### Note su `jev-router`

Su OpenRouter c'è `typesafe/jev-router`, che però **non** è il classificatore Jev: è un router che inoltra la richiesta a un LLM scelto di volta in volta, quindi senza confidenza calibrata e con un prezzo variabile. Per questo non lo usiamo come Classificatore. Jev vero è disponibile solo tramite l'API TypeSafe diretta, oppure con le alternative locali che ne replicano il protocollo (Kev, Rizzo Flow).

## Configurazione dei provider

Nelle impostazioni (clic destro sull'icona → **Opzioni**, oppure ⚙ nel pannello e il link negli avvisi) ogni ruolo ha un preset, l'URL, la chiave API e il modello. I campi si possono modificare anche partendo da un preset; **Personalizzato** serve per qualsiasi altro server compatibile.

- Al **Salva** Chrome chiede il permesso di contattare l'host del provider: è un permesso opzionale, concesso solo per quell'host. Cambiando provider il permesso del vecchio host viene tolto, a meno che l'altro ruolo non lo usi ancora.
- **Prova connessione** fa una richiesta minima e mostra l'esito (chiave non valida, server non raggiungibile, modello inesistente, …).
- Le chiavi API restano in `chrome.storage.local` e non vengono sincronizzate.

### Classificatore (System One)

| Preset | URL | Chiave | Modello | Note |
|---|---|---|---|---|
| Jev | `https://api.typesafe.ai` | sì (TypeSafe) | `jev-latest` | Servizio remoto: titoli e URL escono dal computer |
| Kev | `http://127.0.0.1:8009` | no | facoltativo | Locale. Su un Mac portatile usare `kev-0.8b` (~4 GB); la 4B di default richiede ~17 GB |
| Rizzo Flow | `http://127.0.0.1:8017` | no | `rizzo-latest` (obbligatorio: senza, il server risponde 422) | Locale. 1.7B (~1,8 GB) o 4B (~4,4 GB), con Metal, MLX o CPU. `jev-latest` è un alias che risponde con Rizzo Flow, non con Jev |

La soglia di confidenza (default 0,7) si imposta nella stessa sezione: le tab sotto soglia passano al Generatore.

### Generatore (compatibile OpenAI)

| Preset | URL | Chiave | Modello | Note |
|---|---|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | sì | `openai/gpt-4o-mini` (modificabile) | Servizio remoto |
| Ollama | `http://localhost:11434/v1` | no | `llama3.2` (o un altro modello scaricato) | Vedi sotto per `OLLAMA_ORIGINS` |
| LM Studio | `http://localhost:1234/v1` | no | quello caricato | Avviare il server locale da LM Studio |
| Unsloth Studio | `http://127.0.0.1:8888/v1` | sì | quello caricato (es. `rizzoaiacademy/rizzo-flow`) | La chiave API si crea in Studio dopo l'accesso; il modello va caricato in Studio (o attivare "Model auto-switch" in Settings > API) |

Il Generatore chiede una risposta in JSON con schema (`response_format: json_schema`); se il server non lo supporta e risponde 400, ripete la richiesta senza schema e valida la risposta lato estensione.

**Modelli locali e tempo massimo.** Ogni richiesta al Generatore ha 30 s. Un modello locale piccolo con il "ragionamento" attivo può non bastare con molte tab: con Unsloth Studio e `rizzo-flow` 10 tab hanno richiesto 11 s, 30 tab hanno superato il limite. In quel caso la proposta ripiega sul livello successivo, con l'avviso "non ha risposto in tempo".

**Ollama.** Ollama controlla l'origine delle richieste e può rifiutare quelle che arrivano da `chrome-extension://…` con un 403, che nel pannello appare come "chiave API non valida". In quel caso avviarlo consentendo le estensioni:

```bash
OLLAMA_ORIGINS="chrome-extension://*" ollama serve
# app per macOS: launchctl setenv OLLAMA_ORIGINS "chrome-extension://*" e riavviare Ollama
```

**Gemini Nano.** Non richiede configurazione ed è il Generatore predefinito: con **Gemini Nano** selezionato, la sezione mostra lo stato del modello integrato in Chrome (disponibile, da scaricare, in download, non disponibile) e un pulsante per avviare il download. Serve un Chrome recente con la Prompt API e hardware supportato (spazio su disco e GPU o RAM sufficienti, secondo i requisiti di Google). Gemini Nano risponde solo in tedesco, inglese, spagnolo, francese e giapponese: con Chrome in un'altra lingua (es. italiano) i nomi dei gruppi inventati da Nano sono in inglese. Se il modello non è ancora scaricato, il pannello lo segnala con un avviso e usa il livello successivo.

## Categorie

La lista fissa è la "memoria" dell'estensione. Ogni categoria ha:

- **nome** breve (le etichette dei gruppi in Chrome hanno poco spazio);
- **descrizione**, passata come `criteria` al Classificatore e come contesto al Generatore;
- **colore** fisso, scelto tra i 9 di Chrome.

Default, nella lingua del browser: Lavoro, Sviluppo, AI, Social, Notizie, Video, Shopping, Viaggi, Finanza, Studio.

- **Corrispondenza per nome:** se un gruppo aperto si chiama come una categoria (maiuscole e minuscole non contano), se ne usano descrizione e colore. Altrimenti la descrizione è "Gruppo creato dall'utente: «nome»".
- **Gruppi inventati dall'AI:** non vengono salvati in automatico. Nell'anteprima c'è il pulsante **Salva nella lista**, che aggiunge la categoria con una descrizione generata e modificabile.
- I gruppi inventati ricevono un colore a rotazione tra quelli non ancora usati nella finestra.

## Anteprima (pannello laterale)

- In cima al pannello si sceglie la modalità, **Per sito** o **Con l'AI**, con il riepilogo dei provider che verranno usati: la proposta si ricalcola subito.
- Da ogni riga si può **chiudere la tab** (✕) oppure toglierla dal gruppo proposto (−). Chiudere una tab non obbliga a ricalcolare: la proposta resta valida.
- Il pannello mostra **tutta la finestra**:
  - i gruppi nuovi;
  - i gruppi già aperti, con le loro tab e quelle che verranno aggiunte, segnate "nuova";
  - le tab che restano senza gruppo, da aggiungere a mano;
  - quelle che l'estensione non tocca (fissate, pagine del browser, domini esclusi), con il motivo.
- Il pannello laterale di Chrome resta aperto mentre si naviga: con i provider locali il calcolo può durare decine di secondi, e un popup si chiuderebbe al primo clic fuori.
- Il calcolo gira nel **service worker** e la proposta è salvata in `chrome.storage.session`: chiudendo e riaprendo il pannello la si ritrova.
- Se le tab della finestra cambiano dopo la proposta (tab aperte, chiuse, spostate, raggruppate a mano), il pannello lo segnala e offre **Ricalcola**. Non ricalcola da solo, per non rifare chiamate AI a ogni tab aperta.
- Si può: rinominare un gruppo e cambiarne il colore, togliere una tab (✕, la tab resta libera), spostare una tab in un altro gruppo (menu a tendina), scartare un gruppo intero.
- Ogni gruppo ha un'etichetta con la provenienza: *lista*, *esistente*, *nuovo (AI)*, *sito*.
- Pulsante **Interrompi** durante il calcolo; con l'AI, intanto, la proposta per sito in sola lettura e **Usa questa** per tenerla senza aspettare.
- Il drag & drop è rimandato a dopo.

## Annulla

- Prima di applicare si salva una foto dello stato in `chrome.storage.session`: per ogni tab l'ID, il gruppo (o nessuno) e la posizione.
- **Annulla ultima organizzazione** resta disponibile nel pannello fino all'organizzazione successiva o alla chiusura di Chrome.
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

Pagina opzioni in una tab intera (`options_ui.open_in_tab`), con un menu laterale per le sezioni e, sotto, il link "Rivedi la guida":

1. **Come raggruppare**: *Per sito* oppure *Per argomento, con l'AI*. In modalità per sito le sezioni AI (Categorie, Classificatore, Generatore, descrizione delle pagine) sono nascoste.
2. **Categorie**: una riga per categoria con colore (tavolozza a comparsa), nome e descrizione; si possono aggiungere, modificare, eliminare e riordinare; c'è un pulsante "Ripristina default".
3. **Classificatore**: provider (Nessuno, Jev, Kev, Rizzo Flow, Personalizzato), URL, modello, chiave API, "Salva" e "Prova connessione"; sotto, la soglia di confidenza. In alto a destra, il provider attivo o "Disattivato".
4. **Generatore**: provider (Nessuno, Gemini Nano, OpenRouter, Ollama, LM Studio, Unsloth Studio, Personalizzato); con Gemini Nano, il suo stato e il download.
5. **Comportamento**: numero minimo di tab per gruppo.
6. **Privacy**: interruttore per la descrizione delle pagine (solo in modalità AI), domini esclusi.

Salvataggio: chiavi API in `chrome.storage.local` (non sincronizzate); categorie e preferenze in `chrome.storage.sync`.

## Permessi

- Obbligatori: `tabs`, `tabGroups`, `storage`, `scripting`, `sidePanel` (quest'ultimo non mostra avvisi all'installazione).
- Opzionali, richiesti al momento: gli host dei provider configurati (al salvataggio del provider) e `<all_urls>` per la descrizione delle pagine (all'accensione dell'interruttore). Spegnendo l'opzione o cambiando provider il permesso viene tolto.
- Scorciatoia: `commands._execute_action`, che apre il pannello come il clic sull'icona e non richiede permessi.

## Stack

- [WXT](https://wxt.dev) + TypeScript
- React per pannello laterale e impostazioni, con **Material Design 3**: token `--md-sys-*` generati da `npm run theme` (`scripts/generate-theme.mjs`, colore di partenza il blu di Chrome) e icone Material Symbols incluse come SVG
- Vitest + fake browser di WXT per testare pipeline, fallback, validazione e annulla senza aprire Chrome
- Testi tramite `chrome.i18n` fin dall'inizio (italiano e inglese)

## Tappe

Tutte completate; il dettaglio per issue è in [`docs/lavoro-svolto.md`](docs/lavoro-svolto.md).

1. **Struttura di base**: progetto WXT, popup (poi pannello laterale), service worker, anteprima modificabile, Applica e Annulla, raggruppamento per dominio.
2. **Impostazioni**: pagina opzioni, categorie, privacy, comportamento, corrispondenza per nome con i gruppi aperti.
3. **Generatore**: adattatore compatibile OpenAI (OpenRouter, Ollama, LM Studio) + Gemini Nano.
4. **Classificatore**: adattatore System One (Jev, Kev, Rizzo), soglia, passaggio delle tab rimaste al Generatore, Salva nella lista.
5. **Descrizione delle pagine**: permesso opzionale `<all_urls>`, lettura in parallelo con fallback.
6. **Rifinitura**: traduzioni italiano e inglese, scorciatoia da tastiera, revisione del README.

## TODO: pubblicazione sul Chrome Web Store

Per ora l'estensione è per uso personale (caricata come estensione non pacchettizzata), ma è già progettata per essere pubblicata: permessi opzionali e testi in `chrome.i18n`. Prima di pubblicare serve:

Materiale e passi in [docs/store](docs/store/README.md).

- [x] **Informativa privacy** scritta, in inglese e italiano: [docs/store/privacy.md](docs/store/privacy.md).
- [ ] Pubblicarla a un indirizzo pubblico, con un'email di contatto al posto del segnaposto (serve l'account o un sito dello sviluppatore).
- [x] Risposte per la sezione **Privacy practices** (scopo unico, dati, dichiarazioni): [docs/store/revisione.md](docs/store/revisione.md).
- [ ] Incollarle nella dashboard sviluppatore.
- [x] **Onboarding** al primo avvio: spiegare i livelli di fallback e guidare la configurazione di un provider.
- [x] "Apri il pannello" dalla guida (`sidePanel.open`): verificato dallo smoke test, il clic apre il pannello laterale.
- [x] Pagina dello store: descrizione, 4 screenshot 1280×800 e tile 440×280 per lingua, icona 128×128 con margine (`npm run store-assets`).
- [x] Traduzioni complete in italiano e inglese per l'interfaccia (controllate dai test).
- [x] Traduzioni della scheda dello store: italiano e inglese in [docs/store/scheda.md](docs/store/scheda.md).
- [x] Verificare che nessun permesso obbligatorio vada oltre il necessario (solo `tabs`, `tabGroups`, `storage`, `scripting`, `sidePanel`).
- [x] Motivare ogni permesso nella richiesta di revisione: [docs/store/revisione.md](docs/store/revisione.md).
- [x] Rimozione di `<all_urls>` quando un provider usa un host già coperto (vedi [review AG-R3](docs/review/AG-R3.md)): resa sicura nel codice, spegnendo le descrizioni gli host dei provider rimasti senza permesso vengono chiesti di nuovo nello stesso clic.
- [x] Generare lo zip: `npm run zip` → `.output/autogroup-0.1.0-chrome.zip`.
- [ ] Caricarlo sullo store e inviare la revisione (serve l'account sviluppatore).
- [x] Pulsante **"Offrimi un caffè"** (Buy Me a Coffee): nel README e nelle impostazioni, sotto il menu laterale.

## Fuori scope (per ora)

- Raggruppamento automatico all'apertura di nuove tab.
- Pulsante "Riorganizza tutto", che rimetterebbe in gioco anche le tab già raggruppate.
- Raggruppamento su più finestre.
- Drag & drop nell'anteprima.
- Adattatori per protocolli diversi da System One e compatibile OpenAI.
