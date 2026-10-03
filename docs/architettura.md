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
    proposal-builder.ts  lettura degli input (tab, gruppi aperti, impostazioni) e calcolo della proposta
    tab-selection.ts     selezione delle tab candidate
    domain-grouping.ts   raggruppamento per dominio (livello "nessuna AI")
    colors.ts            assegnatore dei colori
    applier.ts           crea i gruppi in Chrome, dopo aver salvato la foto per "Annulla"
    undo.ts              foto dello stato e ripristino
    proposal-edits.ts    modifiche dell'utente alla proposta (funzione pura)
    session-state.ts     lettura e scrittura dello stato in chrome.storage.session
  settings/              preferenze in chrome.storage.sync: caricamento, validazione, domini esclusi
  ui/base.css            colori, pulsanti e tavolozza comuni a popup e impostazioni
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
| `apply()` | Salva la foto per "Annulla", crea in Chrome i gruppi della proposta corrente, poi azzera la proposta. |
| `undo()` | Annulla l'ultima organizzazione applicata e azzera la proposta. |
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

### Operazioni in coda

Tutte le operazioni (`propose`, `edit`, `apply`, `undo`) passano dalla coda `exclusive` e vengono eseguite una alla volta, nell'ordine di arrivo. Ognuna legge lo stato, eventualmente tocca le tab e riscrive lo stato: senza la coda, una proposta calcolata durante "Applica" potrebbe riscrivere la vecchia foto per "Annulla". `state()` è una sola lettura e non passa dalla coda.

### Impronta della proposta

Ogni proposta ha una `signature`: ID e URL delle tab candidate più le impostazioni usate. Quando il popup si riapre, `propose` rilegge gli input e confronta l'impronta: se coincide restituisce la proposta salvata (con le modifiche dell'utente), altrimenti ne calcola una nuova. Il titolo non fa parte dell'impronta, perché cambia spesso da solo (contatori come "(3) Posta").

### Flusso di `propose`

```
collectInputs(windowId)                         buildProposal(inputs)
  tabs.query ─► selectCandidateTabs ─┐            groupByDomain(minTabs) ─► colori ─► Proposal
  tabGroups.query ───────────────────┼─► inputs ─►                                       │
  loadSettings ──────────────────────┘                          chrome.storage.session (phase: ready)
```

0. **Impostazioni**: `loadSettings()` legge da `storage.sync` il numero minimo di tab e i domini esclusi, a ogni proposta (quindi una modifica vale dalla proposta successiva).
1. **Selezione tab**: tiene solo le tab della finestra non fissate, non già in un gruppo, con URL `http`, `https` o `file` (quindi niente `chrome://`, nuova scheda, pagine di estensioni), con un titolo vero (non vuoto e diverso dall'URL, come accade durante il caricamento) e non appartenenti a un dominio escluso o a un suo sottodominio. L'esclusione avviene qui, al primo passo, così le tab escluse non arrivano mai ai passi successivi (e in futuro all'AI).
2. **Raggruppamento per dominio**: hostname senza `www.`; un dominio diventa gruppo solo con almeno `minTabs` tab (default 2). I gruppi seguono l'ordine della prima tab di ciascun dominio. Provenienza `domain`.
3. **Colori**: l'assegnatore conta i colori dei gruppi già aperti nella finestra e dà a ogni gruppo nuovo il primo colore meno usato, nell'ordine di Chrome (grey, blue, red, yellow, green, pink, purple, cyan, orange). Così prima si esauriscono i colori liberi, poi si ricomincia la rotazione. Il metodo `reserve()` servirà per i colori fissi delle categorie (AG-05/AG-06).

È in `buildProposal` che si inserirà la pipeline AI (AG-06, AG-08): i livelli AI verranno prima del raggruppamento per dominio, che resta l'ultimo livello della tabella dei fallback, e useranno lo stesso assegnatore di colori e le stesse regole sui gruppi. `collectInputs` è il punto in cui si aggiungeranno le categorie (AG-05) e, più avanti, la preparazione dei dati per l'AI (ID brevi, URL ripulito).

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

Funzioni: `loadSettings`, `saveSettings(patch)`, `isValidMinTabs`, `normalizeDomain` (da quello che scrive l'utente a un dominio, oppure `null`), `isExcludedHost(host, domini)` (vale anche per i sottodomini: `google.com` esclude `mail.google.com` ma non `notgoogle.com`).

### Pagina opzioni

`entrypoints/options`, dichiarata con `open_in_tab`: si apre in una tab intera da `chrome://extensions` e dal pulsante "⚙ Impostazioni" del popup (`runtime.openOptionsPage`). Le modifiche si salvano subito, con l'indicazione "Salvato". Sezioni attuali:

- **Comportamento**: numero minimo di tab (campo numerico; un valore non valido viene segnalato e non salvato).
- **Privacy**: domini esclusi, con aggiunta (Invio o "Aggiungi"), rifiuto dei duplicati e dei valori non validi, rimozione con ✕.

Le sezioni Categorie, Classificatore e Generatore arriveranno con AG-05, AG-08 e AG-06.

## Messaggi popup ↔ service worker

Definiti in `src/shared/messages.ts`.

| Messaggio | Direzione | Risposta |
|---|---|---|
| `organizer/state` | popup → SW | `{ ok, state }` |
| `organizer/propose` (`windowId`, `force?`) | popup → SW | `{ ok, state }` a calcolo finito |
| `organizer/edit` (`edit`) | popup → SW | `{ ok, state }` |
| `organizer/apply` | popup → SW | `{ ok, state }` |
| `organizer/undo` | popup → SW | `{ ok, state }` |
| `organizer/state-changed` (`state`) | SW → popup | nessuna; il SW ignora l'errore se il popup è chiuso |

Il service worker risponde con `sendResponse` + `return true`, che funziona in tutte le versioni di Chrome MV3, e ignora i messaggi che non superano `isOrganizerRequest`. Se la risposta è un errore, il popup mostra "Si è verificato un errore imprevisto. Riprova.".

## Popup

All'apertura legge la finestra corrente e chiede `organizer/propose`. Mostra "Calcolo della proposta…", poi i gruppi. Per ogni gruppo: pallino del colore (cliccandolo si apre la tavolozza dei 9 colori), nome modificabile (si conferma con Invio o uscendo dal campo, Esc annulla), etichetta di provenienza, numero di tab, ✕ per scartare il gruppo. Per ogni tab: favicon, titolo (URL nel tooltip), menu "Sposta in…" verso gli altri gruppi e ✕ per toglierla. Sotto ci sono e i pulsanti "Ricalcola" e "Applica". Dopo un'organizzazione mostra anche "Annulla ultima organizzazione" e un avviso di conferma ("Gruppi creati.", "Organizzazione annullata."). Non contiene logica di raggruppamento.

## Testi e lingue

Tutti i testi passano da `t(key)` (`src/shared/i18n.ts`), che usa `chrome.i18n.getMessage`. Anche nome, descrizione e titolo dell'azione nel manifest sono `__MSG_…__`. Lingua di default: italiano; inglese già presente.

## Permessi

Obbligatori: `tabs`, `tabGroups`, `storage`, `scripting`. Nessun permesso host per ora.
