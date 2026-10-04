# Architettura

Estensione Manifest V3 costruita con WXT, TypeScript e React. Tutta la logica sta nel service worker; il popup è solo interfaccia.

## Struttura delle cartelle

```
entrypoints/
  background.ts          service worker: crea l'Organizzatore e risponde ai messaggi del popup
  popup/                 popup React (index.html, main.tsx, App.tsx, style.css)
  options/               pagina impostazioni React, aperta in una tab intera
src/
  organizer/             l'Organizzatore e i suoi moduli interni
    index.ts             interfaccia pubblica: createOrganizer() → propose / edit / apply / undo / state
    proposal-builder.ts  lettura degli input (tab, gruppi aperti, impostazioni, Generatore) e impronta
    pipeline.ts          tabella dei fallback: scelta del Generatore, chiamata, ripiego sul dominio
    ai-input.ts          dati per l'AI (ID brevi, URL ripulito) e opzioni (categorie + gruppi aperti)
    validator.ts         validazione della risposta del Generatore
    group-rules.ts       regole sui gruppi e colori, comuni a tutti i livelli AI
    tab-selection.ts     selezione delle tab candidate
    domain-grouping.ts   raggruppamento per dominio (livello "nessuna AI")
    colors.ts            assegnatore dei colori
    applier.ts           crea i gruppi in Chrome, dopo aver salvato la foto per "Annulla"
    undo.ts              foto dello stato e ripristino
    proposal-edits.ts    modifiche dell'utente alla proposta (funzione pura)
    save-to-list.ts      "Salva nella lista": categoria nuova da un gruppo inventato dall'AI
    description-reader.ts  Lettore descrizioni: meta description delle pagine, con permesso opzionale
    session-state.ts     lettura e scrittura dello stato in chrome.storage.session
  settings/              preferenze in chrome.storage.sync
    index.ts             caricamento e salvataggio, validazione, domini esclusi
    categories.ts        categorie predefinite (da chrome.i18n), validazione della lista
    providers.ts         preset dei due ruoli, configurazione, chiavi API, permessi host
  ui/base.css            colori, pulsanti e tavolozza comuni a popup e impostazioni
  ai/                    adattatori dei provider AI, senza dipendenze dall'Organizzatore
    types.ts             contratti di Generatore e Classificatore, AiTab, AiOption, ProviderError
    http.ts              POST JSON comune: Bearer, timeout, un nuovo tentativo, classificazione degli errori; tempi (TIMINGS)
    systemone-classifier.ts  Classificatore System One (Jev, Kev, Rizzo Flow), due strategie di richiesta
    prompt.ts            istruzioni, schema JSON della risposta, lettura della risposta
    openai-generator.ts  Generatore compatibile OpenAI e "Prova connessione"
    nano-generator.ts    Gemini Nano (Prompt API): disponibilità, download, generazione a blocchi
  shared/                codice usato sia dal service worker sia dal popup
    types.ts             forma dei dati: Proposal, ProposedGroup, OrganizerState, colori
    messages.ts          contratto dei messaggi popup ↔ service worker
    organizer-client.ts  lato popup: invio delle richieste e ascolto dei cambi di stato
    i18n.ts              t(): testi tramite chrome.i18n
public/
  _locales/{it,en}/      testi dell'interfaccia
  icon/                  icone 16/32/48/128
tests/
  organizer.test.ts      test sull'interfaccia dell'Organizzatore
  fake-tab-strip.ts      simulatore di tabs/tabGroups innestato sul fake browser di WXT
scripts/
  smoke.mjs              prova in Chrome for Testing
```

## L'Organizzatore

È il modulo principale e **l'unico punto chiamato dal popup**. Interfaccia:

| Metodo | Cosa fa |
|---|---|
| `propose(windowId, { force? })` | Calcola una proposta per la finestra e la salva nello stato. Riusa la proposta salvata (con le modifiche dell'utente) se è per la stessa finestra e la sua impronta coincide con quella attuale, salvo `force`; se c'è un calcolo in corso restituisce quello, senza avviarne un secondo. |
| `edit(edit)` | Applica una modifica dell'utente alla proposta corrente e la salva nello stato. |
| `saveToList(groupId)` | "Salva nella lista": aggiunge un gruppo "nuovo AI" alla lista delle categorie. |
| `apply()` | Salva la foto per "Annulla", crea in Chrome i gruppi della proposta corrente, poi azzera la proposta. |
| `undo()` | Annulla l'ultima organizzazione applicata e azzera la proposta. |
| `abort()` | "Interrompi": annulla le richieste del calcolo in corso; il calcolo finisce senza proposta. |
| `state()` | Restituisce lo stato corrente. |

### Modifiche alla proposta

Il popup non modifica la proposta da solo: invia una `ProposalEdit` e riceve lo stato aggiornato. Le modifiche possibili:

| `kind` | Effetto |
|---|---|
| `rename` (`groupId`, `name`) | Rinomina il gruppo (spazi iniziali e finali tolti). |
| `recolor` (`groupId`, `color`) | Cambia colore, tra i 9 di Chrome. |
| `remove-tab` (`tabId`) | Toglie la tab dalla proposta: resterà libera. |
| `move-tab` (`tabId`, `toGroupId`) | Sposta la tab in fondo a un altro gruppo della proposta. |
| `discard-group` (`groupId`) | Scarta il gruppo: le sue tab restano libere. |

Un gruppo rimasto senza tab sparisce dalla proposta. Le modifiche a gruppi o tab inesistenti vengono ignorate. Siccome la proposta modificata è salvata in `storage.session`, le modifiche sopravvivono alla chiusura del popup, e "Applica" usa sempre la versione modificata.

### Salva nella lista (`save-to-list.ts`)

Solo per i gruppi con provenienza `ai`. La categoria nuova prende **nome e colore attuali** del gruppo nella proposta (quindi anche quelli cambiati dall'utente) e una descrizione chiesta al Generatore con `describe` (stesso ordine di scelta della pipeline: configurato, poi Gemini Nano). Al Generatore arrivano il nome e fino a 8 tab di esempio, con titolo e URL ripulito.

- Generatore assente o in errore: la categoria viene salvata con la descrizione vuota e l'avviso invita a completarla nelle impostazioni (con un link alla sezione Categorie).
- Esiste già una categoria con lo stesso nome (senza distinguere maiuscole e minuscole): niente duplicato, avviso.
- Dopo il salvataggio il gruppo diventa `list` e l'impronta della proposta viene aggiornata con la nuova lista: la proposta resta attuale (le categorie sono cambiate, ma la proposta le tiene già in conto), quindi riaprendo il popup non si perdono le modifiche. Le tab sono lette una sola volta, prima di chiedere la descrizione: se la proposta era già scaduta resta scaduta, e una tab aperta durante la descrizione (fino a 30 s) la fa scadere.
- L'esito va nel campo `notice` dello stato (chiave i18n e nome), mostrato nel popup; la modifica successiva lo toglie.

### Operazioni in coda

Tutte le operazioni (`propose`, `edit`, `saveToList`, `apply`, `undo`) passano dalla coda `exclusive` e vengono eseguite una alla volta, nell'ordine di arrivo. Ognuna legge lo stato, eventualmente tocca le tab e riscrive lo stato: senza la coda, una proposta calcolata durante "Applica" potrebbe riscrivere la vecchia foto per "Annulla". `state()` è una sola lettura e non passa dalla coda. Nemmeno `abort()` ci passa, perché deve agire proprio mentre il calcolo la occupa.

Una `propose` arrivata mentre un'altra è in corso o in coda ne condivide il risultato solo se è per la stessa finestra e senza `force`. Per un'altra finestra, o con "Ricalcola", si mette in coda un calcolo nuovo: altrimenti il popup della seconda finestra riceverebbe la proposta della prima.

### Interrompi

Ogni `propose` crea un `AbortController` già al momento della richiesta, prima di entrare in coda, e ne passa il segnale a `buildProposal` → `runPipeline` → adattatori → `fetch` (o Prompt API). `abort()` lo interrompe: le richieste in corso falliscono subito, anche durante l'attesa prima di un nuovo tentativo, e il calcolo finisce in `phase: 'idle'`, senza proposta, con l'avviso `popupAborted`. La foto per "Annulla" resta. Nel popup il pulsante "Interrompi" compare accanto a "Calcolo della proposta…". `abort()` interrompe tutti i calcoli in corso e in coda: un calcolo interrotto mentre era ancora in coda finisce allo stesso modo senza fare nessuna richiesta.

### Impronta della proposta

Ogni proposta ha una `signature`: ID e URL delle tab candidate, gruppi aperti (ID, nome, colore), impostazioni usate, disponibilità dei provider e di Gemini Nano, e lettura delle descrizioni attiva o no. Quando il popup si riapre, `propose` rilegge gli input e confronta l'impronta: se coincide restituisce la proposta salvata (con le modifiche dell'utente), altrimenti ne calcola una nuova. Il titolo non fa parte dell'impronta, perché cambia spesso da solo (contatori come "(3) Posta").

### Pipeline AI (`pipeline.ts`)

Realizza tutta la tabella dei fallback del PRD:

| Classificatore | Generatore | Comportamento |
|---|---|---|
| sì | sì | passo 1 (Classificatore), poi passo 2 (Generatore "solo nuovi") sulle tab rimaste |
| sì | no | solo passo 1: le tab rimaste restano libere |
| no | sì | Generatore in modalità "completo" |
| no | no | raggruppamento per dominio |

**Sempre una proposta**: tranne che con "Interrompi", ogni errore di un provider viene registrato come avviso (`recordFailure`) e la pipeline scende di livello; un errore inatteso, che non è un `ProviderError`, viene registrato come "risposta non valida" invece di interrompere il calcolo. Solo un segnale interrotto viene rilanciato.

Se un provider va in errore si scende di un livello: Classificatore in errore → riga 3 (o 4 senza Generatore); Generatore in errore in modalità completo → riga 4; Generatore in errore al passo 2 → le rimaste restano libere (riga 2). Ogni discesa aggiunge un avviso con livello, provider e causa (`recordFailure`).

**Scelta del Classificatore** (`resolveClassifier`): quello configurato (preset diverso da "Nessuno" e URL base; il modello è facoltativo, perché Kev e Rizzo Flow ne servono uno solo) se ha il permesso host; senza permesso, nessuno e un avviso `no-permission`.

**Passo 1** (`classifyThenGenerate`): il Classificatore restituisce per ogni tab scelta e confidenza. Diventano "rimaste" le tab con confidenza sotto la soglia (default 0,7), con scelta "nessuna delle precedenti" o illeggibile, e quelle di una categoria che resterebbe con meno tab del minimo (stessa `applyGroupRules`). Una tab sola può entrare in un gruppo esistente.

Se non ci sono opzioni (nessuna categoria né gruppo aperto) il Classificatore non viene interrogato, perché potrebbe solo rispondere "nessuna": si passa alla riga 3 o 4.

**Passo 2**: solo se c'è un Generatore **e** le tab rimaste sono almeno `minTabs` (altrimenti nessun gruppo nuovo sarebbe valido, quindi nessuna chiamata). Il Generatore riceve solo le rimaste, in modalità "solo nuovi", con le opzioni note perché non le duplichi. I gruppi del passo 1 e del passo 2 vengono uniti per nome (`mergeByName`) e passano una volta sola da `applyGroupRules`: i gruppi nuovi sotto il minimo vengono sciolti e i colori assegnati in un unico punto.

**Scelta del Generatore** (`resolveGenerator`), nell'ordine del PRD:

1. quello configurato dall'utente (preset compatibile OpenAI con URL e modello), se il permesso host è stato concesso; se manca il permesso si aggiunge l'avviso `no-permission` e si passa al punto 2;
2. Gemini Nano, se `LanguageModel.availability()` restituisce `available`; con `downloadable` o `downloading` non viene usato e si aggiunge l'avviso `needs-download` o `downloading`; con `unavailable` (o senza Prompt API) nessun avviso;
3. nessuno: raggruppamento per dominio.

La disponibilità di Nano viene letta in `collectInputs` solo se il Generatore configurato non è utilizzabile, e fa parte dell'impronta: quando il download finisce, la proposta successiva viene ricalcolata.

**Descrizione delle pagine** (`description-reader.ts`): se l'opzione è accesa e il permesso `<all_urls>` è concesso (`inputs.readDescriptions`), e solo se c'è almeno un livello AI da interrogare, prima delle chiamate la pipeline legge la meta description (o `og:description`, se la prima manca o è vuota) delle tab candidate con `chrome.scripting.executeScript`, tutte in parallelo e con un tempo massimo di 500 ms per tab. Le tab sospese da Risparmio memoria (`discarded`) non vengono mai lette, perché leggerle le risveglierebbe; sono saltate anche le pagine non `http(s)`, il Web Store e i PDF. Una tab che non risponde in tempo o non è accessibile resta con titolo e URL. Le tab dei domini esclusi non ci arrivano, perché la selezione le ha già scartate. La descrizione (al massimo 300 caratteri, spazi compattati) diventa `AiTab.description`, quindi arriva sia al Generatore sia al Classificatore (nello `state`). Con il raggruppamento per dominio non si legge nulla.

**Modalità completo**, passo per passo:

1. `prepareTabs`: per ogni tab candidata un ID breve (`t1`, `t2`, …), il titolo e l'URL ripulito (`cleanUrl`: host e percorso, senza schema, credenziali, query né frammento). La tabella `byShortId` riporta gli ID brevi alle tab di Chrome, che non escono mai dall'estensione. Le tab dei domini esclusi non ci sono, perché sono state scartate dalla selezione.
2. `buildOptions`: categorie della lista, poi gruppi aperti con un nome. Un gruppo aperto con lo stesso nome di una categoria (senza distinguere maiuscole e minuscole) prende il posto della categoria e ne usa la descrizione; gli altri hanno la descrizione "Gruppo creato dall'utente: «nome»" (da `chrome.i18n`).
3. `generator.generate({ mode: 'full', tabs, options, language })`, con `language` dalla chiave i18n `aiLanguageName` ("italiano", "English").
4. `validateGroups`: scarta nomi non stringa, vuoti, nomi nuovi oltre le 2 parole (i nomi delle opzioni note sono accettati anche se più lunghi), ID inesistenti, e le tab assegnate a più gruppi (restano libere); unisce i gruppi con lo stesso nome.
5. `applyGroupRules`: un nome che corrisponde a un'opzione diventa quella opzione (provenienza `existing` o `list`), altrimenti un gruppo `ai`. I gruppi esistenti accolgono anche una sola tab e tengono nome e colore; categorie e gruppi nuovi richiedono almeno `minTabs` tab (le tab escluse finiscono in `leftover`, che servirà al passo 2 di AG-08). Colori: le categorie usano il loro colore fisso, che viene riservato, poi i gruppi nuovi ruotano tra i colori ancora liberi nella finestra.

Se il Generatore lancia un `ProviderError`, la pipeline aggiunge un avviso `{ level: 'generator', provider, cause }` e ripiega sul raggruppamento per dominio. Gli errori di altro tipo (bug) non vengono nascosti.

### Adattatore System One (`src/ai/systemone-classifier.ts`)

Contratto di TypeSafe (verificato sulla documentazione pubblica di Jev): `POST {URL base}/v1/systemone` con `{ model?, state, questions }`, dove `questions` è un **oggetto** che mappa il nome della domanda alla definizione `{ type: 'choice', instructions, criteria }`; la risposta ha `answers`, un oggetto con lo stesso nome di domanda e `{ type, choice, probabilities, confidence }`.

- `criteria`: nome → descrizione di ogni opzione (categorie e gruppi aperti), al massimo 254, più `none_of_the_above` come consiglia TypeSafe, per un totale di al massimo 255. Una scelta `none_of_the_above`, sconosciuta o illeggibile lascia la tab senza categoria (quindi "rimasta"), senza far fallire le altre.
- `state`: la tab come oggetto `{ title, url, description? }`, con lo stesso URL ripulito inviato al Generatore.
- `model` solo se compilato (Jev: `jev-latest`); chiave `Bearer` solo se presente.
- Timeout di 5 s per richiesta; nuovo tentativo e cause come per il Generatore (vedi "Gestione degli errori").
- **Strategia delle richieste**: `per-tab` (default) invia una richiesta per tab con al massimo 4 richieste in parallelo; al primo errore non ne parte nessun'altra e quelle in corso vengono interrotte, perché la pipeline scende comunque di livello; `batch` invia una sola richiesta con `state` = tutte le tab e una domanda per tab (nome della domanda = ID breve). Vedi "Strategia del Classificatore" più sotto.
- `testSystemOneConnection`: una domanda minima.

### Gestione degli errori (`src/ai/http.ts`)

Il trasporto HTTP è comune ai due adattatori, quindi il comportamento è uniforme:

| Situazione | Nuovo tentativo | Causa dell'avviso |
|---|---|---|
| 429, 529 | uno, dopo 0,8 s | `rate-limit` ("troppe richieste") |
| 5xx | uno, dopo 0,8 s | `unreachable` ("non raggiungibile") |
| 401, 403 | no | `invalid-key` ("chiave API non valida") |
| 400, 404, 422 | no | `invalid-request` ("ha rifiutato la richiesta") |
| errore di rete | no | `unreachable` |
| tempo scaduto (Classificatore 5 s, Generatore 30 s, per richiesta) | no | `timeout` |
| risposta illeggibile o fuori schema | no | `invalid-response` |

- I tempi sono in `TIMINGS` (`classifier`, `generator`, `retryDelay`), un solo punto da cambiare; i test li accorciano in `tests/setup.ts`.
- Il timeout usa `deadline()`, un `setTimeout` esplicito unito al segnale di "Interrompi". **Non** si usa `AbortSignal.timeout`: combinato con `AbortSignal.any` è tenuto solo con riferimenti deboli, e una richiesta rimasta appesa senza altri riferimenti può far raccogliere il timer dal garbage collector, così il timeout non scatta mai (è successo nei test: un test bloccato per 1051 s).
- Gemini Nano non usa HTTP ma applica lo stesso tempo massimo del Generatore con `deadline()`.
- Gli avvisi indicano provider e URL base, es. "OpenRouter (https://openrouter.ai/api/v1) non raggiungibile.", e compaiono in cima all'anteprima con un link alla sezione giusta delle impostazioni (Classificatore o Generatore).

### Strategia del Classificatore

L'AC di AG-08 chiede di scegliere misurando. Durante lo sviluppo non era disponibile nessun server System One (né una chiave Jev, né Kev o Rizzo Flow installati), quindi:

- entrambe le strategie sono implementate e testate (`strategy: 'per-tab' | 'batch'`);
- il default è **`per-tab` con 4 richieste in parallelo**, per ragioni di qualità: lo `state` contiene una sola tab, quindi il classificatore non può confondere le tab tra loro, mentre in `batch` ogni domanda vede tutte le tab e deve trovare quella giusta tramite l'ID nelle istruzioni. Il costo è simile: in `per-tab` si ripetono i `criteria` a ogni richiesta, in `batch` si ripetono per ogni domanda (TypeSafe dichiara $0,042 per milione di token di input). La latenza dichiarata è 70–500 ms per richiesta: con 30 tab e 4 richieste in parallelo sono circa 8 giri, 1–4 s;
- `scripts/measure-classifier.mjs` misura le due strategie su un server reale (tempo mediano, token di input, accordo tra le strategie, scelte corrette su 10 tab di esempio). **La scelta va confermata eseguendo lo script su Jev, Kev o Rizzo Flow** (issue AG-13); cambiare default significa cambiare un valore in `createSystemOneClassifier`.

### Adattatore compatibile OpenAI (`src/ai/openai-generator.ts`)

- `POST {URL base}/chat/completions` con `model`, `temperature: 0`, due messaggi (istruzioni; JSON con opzioni e tab) e `response_format: { type: 'json_schema', json_schema: { name: 'tab_groups', strict: true, schema } }`. Lo schema chiede `{ "groups": [{ "name": string, "tabs": [string] }] }`.
- Se il server risponde 400 (tipicamente perché non supporta lo structured output) ritenta una volta senza `response_format`, affidandosi alle istruzioni e alla validazione. La risposta può anche essere in un blocco ```json.
- Chiave API come `Authorization: Bearer …`, solo se presente (facoltativa per i server locali).
- Timeout, nuovo tentativo e classificazione degli errori: vedi "Gestione degli errori".
- `describe`: una richiesta senza schema (`temperature: 0.2`, `max_tokens: 120`) che chiede una frase nella lingua del browser; la risposta viene ripulita da virgolette e spazi e tagliata a 300 caratteri (`cleanDescription`).
- `testOpenAiConnection`: una richiesta minima (`max_tokens: 1`) che verifica URL, chiave e modello.

Aggiungere un provider compatibile significa aggiungere una voce a `GENERATOR_PRESETS`: la pipeline non cambia.

### Adattatore Gemini Nano (`src/ai/nano-generator.ts`)

Stesso contratto (`Generator.generate` e `describe`) e stesse istruzioni e schema dell'adattatore OpenAI, ma tramite la Prompt API di Chrome (`LanguageModel`): nessuna chiave, nessun dato esce dal computer.

- Sessione base con `initialPrompts: [{ role: 'system', … }]`; ogni prompt usa `responseConstraint: GROUPS_SCHEMA` per vincolare la risposta.
- **Divisione in blocchi**: il budget è il contesto libero della sessione base (`contextWindow − contextUsage`, con ripiego su `inputQuota`/`inputUsage` per le versioni precedenti di Chrome) meno il 25% lasciato alla risposta. Se il prompt con tutte le tab supera il budget, le tab vengono distribuite in blocchi misurati con `measureContextUsage`; ogni blocco ha almeno una tab e un piccolo margine per i nomi che arriveranno.
- Ogni blocco gira in un clone della sessione base, così il contesto non si accumula. I nomi inventati nei blocchi precedenti si aggiungono alle opzioni dei blocchi successivi (con descrizione vuota); i gruppi con lo stesso nome nei vari blocchi vengono poi uniti dal validatore.
- Errori: creazione della sessione fallita → `unavailable`; ogni altro errore della Prompt API (clone, misura, prompt, es. contesto superato) → `invalid-request`; risposta fuori schema → `invalid-response`. La pipeline ripiega sul dominio con l'avviso.
- Tempo massimo: 30 s per ogni chiamata (creazione della sessione, misura, ogni blocco), come per ogni richiesta HTTP del Generatore compatibile OpenAI; con molte tab il calcolo totale può quindi durare di più senza scadere.
- `nanoAvailability()` e `downloadNano(onProgress)` servono alla pagina opzioni.

### Flusso di `propose`

```
collectInputs(windowId)                          buildProposal(inputs)
  tabs.query ─► selectCandidateTabs ─┐             runPipeline
  tabGroups.query ───────────────────┤               ├─ Generatore (completo) ─► validazione ─► regole e colori
  loadSettings ──────────────────────┼─► inputs ─►   └─ (nessuno / errore) ─► dominio + avviso
  chiave API (local), permesso host ─┘                                   │
                                                          Proposal ─► chrome.storage.session
```

0. **Impostazioni**: `loadSettings()` legge da `storage.sync` il numero minimo di tab e i domini esclusi, a ogni proposta (quindi una modifica vale dalla proposta successiva).
1. **Selezione tab**: tiene solo le tab della finestra non fissate, non già in un gruppo, con URL `http`, `https` o `file` (quindi niente `chrome://`, nuova scheda, pagine di estensioni), con un titolo vero (non vuoto e diverso dall'URL, come accade durante il caricamento) e non appartenenti a un dominio escluso o a un suo sottodominio. L'esclusione avviene qui, al primo passo, così le tab escluse non arrivano mai ai passi successivi (e in futuro all'AI).
2. **Raggruppamento per dominio**: hostname senza `www.`; un dominio diventa gruppo solo con almeno `minTabs` tab (default 2). I gruppi seguono l'ordine della prima tab di ciascun dominio. Provenienza `domain`.
3. **Colori**: l'assegnatore conta i colori dei gruppi già aperti nella finestra e dà a ogni gruppo nuovo il primo colore meno usato, nell'ordine di Chrome (grey, blue, red, yellow, green, pink, purple, cyan, orange). Così prima si esauriscono i colori liberi, poi si ricomincia la rotazione. Il metodo `reserve()` servirà per i colori fissi delle categorie (AG-05/AG-06).

`buildProposal` delega a `runPipeline`. La chiave API viene letta in `collectInputs` ma non entra mai nell'impronta né nello stato.

### Flusso di `apply`

L'applicatore rilegge le tab della finestra e salta quelle chiuse, spostate o raggruppate nel frattempo. Prima di toccare qualunque tab scatta la foto delle tab coinvolte (vedi sotto) e la salva nello stato: se il service worker si interrompe a metà, "Annulla" resta possibile. Per ogni gruppo nuovo chiama `tabs.group` e poi `tabGroups.update` con nome e colore; per i gruppi esistenti (da AG-06) aggiunge le tab con `tabs.group({ groupId })` senza toccare nome e colore. Gli ID dei gruppi creati finiscono nella foto (`createdGroupIds`).

### Annulla

La foto (`UndoSnapshot`) contiene, per ogni tab coinvolta, finestra, posizione e gruppo originale (o nessuno). `undo()`:

1. ignora le tab non più aperte;
2. toglie dai gruppi le tab che l'operazione ha raggruppato (`tabs.ungroup`);
3. rimette ogni tab nella posizione originale con `tabs.move`, da sinistra a destra, così ogni indice si riferisce alla barra già ricostruita (gli indici oltre la fine vengono limitati all'ultima posizione);
4. rimette nei gruppi originali le tab che ne avevano uno, se il gruppo esiste ancora (servirà da AG-06, quando le tab potranno entrare in gruppi esistenti);
5. se una tab spostata è finita in mezzo a un gruppo altrui (Chrome in quel caso la aggiunge al gruppo) la toglie.

I gruppi creati spariscono da soli quando restano senza tab. Le tab aperte dopo non vengono toccate, i gruppi non vengono mai rinominati. Dopo l'annullamento la proposta viene azzerata, perché era stata calcolata con le tab ancora raggruppate.

La foto resta disponibile finché non si applica un'altra organizzazione (calcolare una nuova proposta non la cancella) o finché Chrome non si chiude (`storage.session`). Il popup mostra "Annulla ultima organizzazione" solo nella finestra a cui la foto si riferisce.

## Stato e persistenza

Lo stato vive in `chrome.storage.session` sotto la chiave `organizer`:

```ts
interface OrganizerState {
  phase: 'idle' | 'computing' | 'ready';
  windowId?: number;
  proposal?: Proposal;   // gruppi + avvisi
  undo?: UndoSnapshot;   // presente finché "Annulla" è disponibile
  notice?: { key, arg }; // esito dell'ultima operazione, es. "Salva nella lista"
  error?: string;        // chiave i18n dell'ultimo errore
}
```

Lo stato ha sempre il `windowId` a cui si riferisce: è unico per tutte le finestre, e il popup mostra solo gli aggiornamenti della propria. Aprire il popup in un'altra finestra sostituisce la proposta precedente.

Sopravvive alla chiusura del popup e al riavvio del service worker, ma non alla chiusura di Chrome. Se il popup si chiude durante il calcolo, il service worker finisce comunque e salva la proposta; riaprendo il popup, `propose` trova la proposta pronta e la restituisce.

Divisione degli storage prevista dal PRD: `sync` per categorie e preferenze, `local` per le chiavi API, `session` per lo stato dell'Organizzatore. Oggi: `session` per lo stato, `sync` per le impostazioni.

## Impostazioni

Modulo `src/settings`, usato dall'Organizzatore (lettura) e dalla pagina opzioni (lettura e scrittura). Ogni preferenza è una chiave separata in `storage.sync`, così si resta lontani dal limite di 8 KB per elemento quando arriveranno le categorie.

| Chiave | Tipo | Default | Note |
|---|---|---|---|
| `minTabs` | intero ≥ 1 | 2 | `saveSettings` rifiuta valori non validi; `loadSettings` ignora valori corrotti e usa il default. |
| `excludedDomains` | `string[]` | `[]` | Domini normalizzati: minuscole, senza schema, percorso, porta né `www.`. |
| `classifier` | `{ preset, baseUrl, model }` | preset `none` | URL normalizzato senza `/` finale. |
| `threshold` | numero tra 0 e 1 | 0,7 | Soglia di confidenza del Classificatore. |
| `readDescriptions` | booleano | `false` | "Leggi la descrizione delle pagine"; vale solo con il permesso `<all_urls>`. |
| `generator` | `{ preset, baseUrl, model }` | preset `none` | URL normalizzato senza `/` finale. |
| `categories` | `Category[]` | le 10 predefinite | Assente finché l'utente non modifica la lista: in quel caso `loadSettings` restituisce le predefinite nella lingua del browser. Una lista salvata ma non valida viene ignorata. |

`saveSettings` rifiuta i valori non validi con un `SettingsError`, che porta la chiave i18n del messaggio da mostrare.

Le chiavi API sono in `storage.local` (`classifierApiKey`, `generatorApiKey`), mai in `sync`.

### Provider (`src/settings/providers.ts`)

Le funzioni sono comuni ai due ruoli (`ProviderRole = 'classifier' | 'generator'`): `presetsOf`, `isProviderSettings`, `isProviderConfigured`, `providerLabel` (es. "Kev (http://127.0.0.1:8009)"), `normalizeProvider`, `originPattern`, `hasHostPermission`, `loadApiKey`, `saveApiKey`. Aggiungere un provider significa aggiungere una voce a `PROVIDER_PRESETS`.

Preset del Classificatore:

| Preset | URL base | Modello |
|---|---|---|
| Nessuno | — | — |
| Jev | `https://api.typesafe.ai` | `jev-latest` |
| Kev | `http://127.0.0.1:8009` | (facoltativo) |
| Rizzo Flow | `http://127.0.0.1:8017` | (facoltativo) |
| Personalizzato | a scelta | a scelta |

Preset del Generatore:

| Preset | URL base | Modello di default |
|---|---|---|
| Gemini Nano (integrato in Chrome) | — | — (valore `none`: nessun Generatore configurato, quindi Nano se disponibile) |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Ollama | `http://localhost:11434/v1` | `llama3.2` |
| LM Studio | `http://localhost:1234/v1` | (da scegliere) |
| Unsloth Studio | `http://127.0.0.1:8888/v1` | (da scegliere) |
| Personalizzato | a scelta | a scelta |

Il Generatore è "configurato" con un preset diverso da "Nessuno" e URL e modello compilati; il Classificatore basta che abbia l'URL. Permesso host: `originPattern(baseUrl)` (es. `https://openrouter.ai/*`; le porte non contano nei pattern di Chrome), dichiarato fra gli `optional_host_permissions` del manifest e chiesto al salvataggio.

### Categorie

```ts
interface Category { id: string; name: string; description: string; color: GroupColor }
```

- **Predefinite** (`defaultCategories`): Lavoro, Sviluppo, AI, Social, Notizie, Video, Shopping, Viaggi, Finanza, Studio, con nome e descrizione presi da `chrome.i18n` (`category_<chiave>_name`, `category_<chiave>_description`), quindi in italiano o in inglese secondo il browser. Colori fissi; essendo 10 categorie e 9 colori, Lavoro e Studio condividono il blu.
- **Validazione** (`validateCategories`): nome non vuoto, al massimo 40 caratteri, unico senza distinguere maiuscole e minuscole e spazi ai lati (`categoryKey`); descrizione al massimo 300 caratteri; colore tra i 9 di Chrome. I limiti tengono la lista ben sotto gli 8 KB per elemento di `storage.sync`. Una lista vuota è ammessa.
- **Ripristina default** (`resetCategories`): cancella la chiave, così si torna alle predefinite nella lingua del browser corrente.
- Le categorie sono in `ProposalInputs.settings.categories`: è da qui che le leggeranno Generatore e Classificatore (AG-06, AG-08). Fanno parte dell'impronta della proposta, quindi modificarle rende non più attuale una proposta salvata.

Funzioni: `loadSettings`, `saveSettings(patch)`, `isValidMinTabs`, `normalizeDomain` (da quello che scrive l'utente a un dominio, oppure `null`), `isExcludedHost(host, domini)` (vale anche per i sottodomini: `google.com` esclude `mail.google.com` ma non `notgoogle.com`).

### Pagina opzioni

`entrypoints/options`, dichiarata con `open_in_tab`: si apre in una tab intera da `chrome://extensions` e dal pulsante "⚙ Impostazioni" del popup (`runtime.openOptionsPage`). Le modifiche si salvano subito, con l'indicazione "Salvato". Sezioni attuali:

- **Categorie**: per ogni categoria nome, descrizione e tavolozza dei 9 colori, pulsanti ↑ ↓ per riordinare e ✕ per eliminare; "Aggiungi categoria" (nome "Nuova categoria", numerato se già presente, e il primo colore non ancora usato) e "Ripristina default". La pagina tiene una bozza locale: una modifica non valida (es. nome duplicato) resta visibile con l'errore e non viene salvata finché non è corretta. Nome e descrizione si salvano all'uscita dal campo, colore e ordine subito.
- **Comportamento**: numero minimo di tab (campo numerico; un valore non valido viene segnalato e non salvato).
- **Privacy**: interruttore "Leggi la descrizione delle pagine per una maggiore precisione". Accendendolo si chiede `<all_urls>` nel gesto dell'utente; se il permesso viene rifiutato l'interruttore resta spento con un avviso. Spegnendolo il permesso viene tolto e si torna a titolo e URL. L'interruttore risulta acceso solo se l'opzione è salvata **e** il permesso c'è davvero. Poi i domini esclusi, con aggiunta (Invio o "Aggiungi"), rifiuto dei duplicati e dei valori non validi, rimozione con ✕.

- **Classificatore** e **Generatore**: la stessa sezione generica (`ProviderSection`, parametrizzata per ruolo). Il Classificatore ha in più la soglia di confidenza (cursore da 0 a 100%, salvato al rilascio); il Generatore, con "Gemini Nano" selezionato, mostra lo stato di Nano. Generatore: provider (Gemini Nano, OpenRouter, Ollama, LM Studio, Unsloth Studio, Personalizzato), URL base, modello, chiave API (campo password, salvata in `storage.local`), "Salva" e "Prova connessione". Il preset compila URL e modello. "Salva" chiede il permesso host **nel gesto dell'utente, prima di ogni `await`** (altrimenti Chrome rifiuta la richiesta), toglie il permesso del provider precedente se nessuno dei due ruoli usa più quell'host, e mostra l'esito: salvato con permesso, permesso mancante, configurazione incompleta o Generatore disattivato. La sezione si apre anche da `options.html#generator`. Con "Gemini Nano" selezionato la sezione mostra lo stato del modello (disponibile, da scaricare, in download, non supportato); se è da scaricare, il pulsante "Scarica Gemini Nano" avvia il download con `LanguageModel.create()` (serve il clic dell'utente) e mostra l'avanzamento in percentuale.

La sezione Classificatore arriverà con AG-08.

### Avvisi nel popup

Gli avvisi della proposta compaiono in cima all'anteprima ("Proposta meno precisa: OpenRouter (openrouter.ai) non raggiungibile.") con un link che apre le impostazioni sulla sezione del provider. Il testo viene dalla chiave `warning_<causa>` (con `-` sostituito da `_` tramite `warningKey`, perché Chrome non accetta `-` nelle chiavi). I gruppi `existing` non si possono rinominare né ricolorare nel popup, perché "Applica" non ne cambia nome e colore.

## Messaggi popup ↔ service worker

Definiti in `src/shared/messages.ts`.

| Messaggio | Direzione | Risposta |
|---|---|---|
| `organizer/state` | popup → SW | `{ ok, state }` |
| `organizer/propose` (`windowId`, `force?`) | popup → SW | `{ ok, state }` a calcolo finito |
| `organizer/edit` (`edit`) | popup → SW | `{ ok, state }` |
| `organizer/save-to-list` (`groupId`) | popup → SW | `{ ok, state }` con `state.notice` |
| `organizer/apply` | popup → SW | `{ ok, state }` |
| `organizer/undo` | popup → SW | `{ ok, state }` |
| `organizer/abort` | popup → SW | `{ ok, state }`; non passa dalla coda |
| `organizer/state-changed` (`state`) | SW → popup | nessuna; il SW ignora l'errore se il popup è chiuso |

Il service worker risponde con `sendResponse` + `return true`, che funziona in tutte le versioni di Chrome MV3, e ignora i messaggi che non superano `isOrganizerRequest`. Se la risposta è un errore, il popup mostra "Si è verificato un errore imprevisto. Riprova.".

## Popup

All'apertura legge la finestra corrente e chiede `organizer/propose`. Mostra "Calcolo della proposta…", poi i gruppi. Per ogni gruppo: pallino del colore (cliccandolo si apre la tavolozza dei 9 colori), nome modificabile (si conferma con Invio o uscendo dal campo, Esc annulla), etichetta di provenienza, numero di tab, ✕ per scartare il gruppo. Per ogni tab: favicon, titolo (URL nel tooltip), menu "Sposta in…" verso gli altri gruppi e ✕ per toglierla. I gruppi "nuovo AI" hanno il pulsante "Salva nella lista". Sotto ci sono e i pulsanti "Ricalcola" e "Applica". Dopo un'organizzazione mostra anche "Annulla ultima organizzazione" e un avviso di conferma ("Gruppi creati.", "Organizzazione annullata."). Non contiene logica di raggruppamento.

## Testi e lingue

Tutti i testi passano da `t(key)` (`src/shared/i18n.ts`), che usa `chrome.i18n.getMessage`. Anche nome, descrizione e titolo dell'azione nel manifest sono `__MSG_…__`. Lingua di default: italiano; inglese completo, con le stesse chiavi. Fuori da `chrome.i18n` restano solo testi che l'utente non vede: i prompt per l'AI (in inglese, con la lingua dei nomi passata a parte), le istruzioni al Classificatore e i messaggi degli errori interni scritti in console.

Alcune chiavi sono composte a runtime: `warning_<causa>` (via `warningKey`, che sostituisce `-` con `_`), `color_<colore>`, `provenance_<provenienza>`, `nanoStatus_<stato>`, `category_<chiave>_name|description`. `tests/locales.test.ts` controlla sia queste sia ogni chiave scritta nel codice.

## Scorciatoia da tastiera

`manifest.commands._execute_action` con `suggested_key` `Alt+Shift+G` apre il popup come un clic sull'icona, quindi parte subito il calcolo della proposta. Non richiede permessi e non serve codice: Chrome gestisce il comando da solo. Senza `description`, che Chrome ignora per `_execute_action` (in `chrome://extensions/shortcuts` mostra il titolo dell'azione). La scorciatoia è solo suggerita: si cambia da `chrome://extensions/shortcuts` e Chrome non la assegna se un'altra estensione la usa già.

## Permessi

Obbligatori: `tabs`, `tabGroups`, `storage`, `scripting`. Opzionali: `optional_host_permissions: ["http://*/*", "https://*/*", "<all_urls>"]`, da cui si chiedono solo l'host del provider configurato (al salvataggio) e `<all_urls>` (all'accensione delle descrizioni). Solo la build dello smoke test (`AUTOGROUP_SMOKE=1`) concede in anticipo `<all_urls>`, perché in headless le richieste di permesso non si possono accettare.

Verifica nella build normale (`scripts/permissions-check.mjs`): senza permessi host all'avvio, il clic su "Salva" del Generatore e quello sull'interruttore delle descrizioni aprono la finestra di Chrome; una richiesta fatta fuori da un gesto viene rifiutata ("This function must be called during a user gesture").

**Da provare a mano:** se l'host di un provider viene concesso mentre `<all_urls>` è già attivo, spegnere le descrizioni potrebbe togliere anche l'accesso a quell'host. In quel caso compare l'avviso `no-permission`, che invita a salvare di nuovo il provider.
