# Test

## Principio

Un solo seam: **l'interfaccia dell'Organizzatore** (`propose`, `apply`, `state`, e poi `undo`). I test preparano la barra delle tab, chiamano l'Organizzatore e controllano cosa esce (la proposta) o cosa resta nel browser (gruppi e ordine delle tab). Non controllano come i moduli interni si chiamano tra loro.

`tests/organizer.test.ts` è il test modello per tutte le issue successive.

## Ambiente

- **Vitest** con il plugin `WxtVitest`, che sostituisce `wxt/browser` con il fake browser di WXT (`@webext-core/fake-browser`). Storage (`session`, `sync`, `local`) e `runtime` vengono dal fake di WXT.
- **`tests/fake-tab-strip.ts`**: il fake di WXT non conosce gruppi, tab fissate né posizioni. Il simulatore tiene per ogni finestra la lista ordinata delle tab e sostituisce `tabs.query/get/remove/group/ungroup/move` e l'intero `tabGroups` con un comportamento simile a Chrome:
  - `tabs.group` senza `groupId` crea un gruppo nella posizione della prima tab e vi accosta le altre; con `groupId` aggiunge le tab in fondo al gruppo;
  - `tabs.ungroup` porta la tab subito dopo la fine del gruppo;
  - `tabs.move` fa entrare in un gruppo una tab che finisce tra due sue tab e fa uscire dal gruppo una tab che non è più accanto a nessuna tab del gruppo;
  - i gruppi rimasti vuoti spariscono; raggruppare una tab fissata è un errore.
- **`tests/fake-i18n.ts`**: il fake di WXT non implementa `i18n`. Questo fake legge i veri file `public/_locales/<lingua>/messages.json` e implementa `getMessage` (con i segnaposto) e `getUILanguage`. Ogni test parte in italiano; `installFakeI18n('en')` passa all'inglese.
- **`tests/fake-network.ts`**: `installFakePermissions(concessi)` sostituisce `permissions` (non implementato dal fake di WXT); `installFakeFetch(...risposte)` sostituisce `fetch` con una coda di risposte (o errori, o funzioni) e registra URL, intestazioni e corpo di ogni richiesta; `openAiReply(contenuto)` e `httpError(status)` costruiscono risposte nel formato OpenAI.
- **`tests/fake-nano.ts`**: stub dell'oggetto globale `LanguageModel` con i quattro stati di disponibilità, una finestra di contesto configurabile (un "token" ogni 4 caratteri), `measureContextUsage`, `clone`, e una funzione che risponde a ogni prompt registrando sistema, opzioni, tab e schema.
- **`tests/setup.ts`** (in `setupFiles`): prima di ogni test accorcia `TIMINGS` (timeout di 200 ms, attesa del nuovo tentativo di 1 ms), così timeout e nuovi tentativi si provano senza aspettare davvero.
- `installFakeFetch` rispetta il segnale della richiesta come il `fetch` vero (una richiesta appesa fallisce appena il segnale viene interrotto) e registra il segnale; `HANG` è una risposta che non arriva mai.
- **`tests/fake-scripting.ts`**: sostituisce `scripting.executeScript` (non implementato dal fake di WXT); ogni tab ha la sua pagina finta con una descrizione e un eventuale ritardo (`Infinity` = non risponde mai); una tab senza pagina simula una pagina non accessibile. Registra le tab lette.
- Helper per i test: `addTab`, `addGroup`, `closeTab`, `groupsIn()` (gruppi con titoli delle tab, in ordine) e `layout()` (la barra come elenco di titoli).

## Scenari coperti (AG-01)

- Raggruppamento per dominio: nome senza `www.`, provenienza `domain`, query e frammento ignorati.
- Regola delle 2 tab.
- Selezione: finestra corrente, tab fissate, già raggruppate, pagine interne, tab senza titolo o con titolo uguale all'URL.
- Colori a rotazione tra quelli liberi nella finestra.
- Nessuna modifica alla barra prima di "Applica".
- Persistenza della proposta (un nuovo Organizzatore la ritrova).
- Due richieste contemporanee producono un solo calcolo.
- "Applica": gruppi con nome e colore, gruppi esistenti intatti, tab chiuse nel frattempo saltate, proposta azzerata.

## Scenari coperti (AG-02)

- "Annulla" non disponibile prima di "Applica", disponibile dopo.
- Barra mista (tab fissata, gruppo dell'utente, tab libere di più domini): applica e poi annulla riporta esattamente la barra iniziale e scioglie i gruppi creati.
- Tab chiusa tra "Applica" e "Annulla": ignorata senza errori, le altre tornano al loro posto.
- Tab aperta dopo "Applica": resta in fondo, non viene toccata.
- Gruppo rinominato dall'utente dopo "Applica": non viene rinominato all'indietro.
- "Annulla" sopravvive a una nuova proposta e vale solo per l'ultima operazione applicata.

## Scenari coperti (AG-03)

- "Applica" dopo rinomina, cambio colore, spostamento di una tab, rimozione di una tab e scarto di un gruppo crea esattamente i gruppi modificati; le tab tolte o scartate restano libere.
- Un gruppo svuotato dagli spostamenti sparisce dalla proposta.
- Le modifiche restano nello stato e un nuovo Organizzatore (pannello riaperto) le ritrova.
- Le modifiche a gruppi o tab inesistenti vengono ignorate.
- Ogni gruppo ha provenienza e tab.

## Scenari coperti (AG-04)

- Default (minimo 2, nessun dominio escluso) e salvataggio in `storage.sync`.
- Minimo 3: un dominio con 2 tab non forma un gruppo. Minimo 1: anche una tab sola forma un gruppo.
- Un minimo modificato vale per la proposta successiva; i valori non interi o minori di 1 vengono rifiutati.
- Domini esclusi: escluso il dominio e i suoi sottodomini (`google.com` → `mail.google.com`, `www.google.com`), non i domini che finiscono con lo stesso testo (`notgoogle.com`); dopo "Applica" le tab escluse restano libere.
- Normalizzazione dei domini scritti dall'utente.

## Scenari coperti (AG-R1)

- Una proposta chiesta durante "Applica" non cancella la foto per "Annulla".
- Riaprendo il pannello la proposta viene ricalcolata se le tab libere sono cambiate, e mantenuta (con le modifiche) se non lo sono.
- Lo stato indica sempre la finestra.

## Scenari coperti (AG-05)

- Al primo avvio le 10 categorie predefinite in italiano, con descrizione e colore; in inglese con il browser in inglese.
- Aggiunta, modifica (nome con spazi ripuliti, colore), eliminazione e riordino; la lista finisce in `storage.sync`.
- Nomi duplicati (maiuscole e spazi ignorati) e nomi vuoti rifiutati, senza salvare nulla.
- "Ripristina default" riporta la lista iniziale; una lista vuota è ammessa.
- Modificare le categorie rende non più attuale una proposta salvata.

## Scenari coperti (AG-06), in `tests/generator.test.ts`

- Assegnazione a categoria (colore fisso), a gruppo aperto (anche una tab, nome e colore del gruppo) e a gruppo nuovo (primo colore libero), con le provenienze.
- Privacy sulla richiesta reale: solo ID brevi, titoli e URL ripuliti; nessuna query, frammento, credenziale, ID di Chrome né tab dei domini esclusi.
- Opzioni: categorie più gruppi aperti, corrispondenza per nome senza distinguere maiuscole, descrizione "Gruppo creato dall'utente".
- Contratto della richiesta: URL `/chat/completions`, `Bearer`, modello, `json_schema`, lingua del browser.
- Nuovo tentativo senza structured output dopo un 400; risposta in un blocco ```json.
- Validazione: ID inesistenti, tab duplicate, nomi vuoti od oltre le 2 parole.
- Regole: minimo per gruppi nuovi e categorie, non per i gruppi esistenti.
- "Applica" estende un gruppo esistente senza cambiarne nome e colore; "Annulla" lo riporta alla composizione originale.
- Fallback al dominio con avviso per 500, 401, 429, errore di rete, JSON illeggibile e JSON fuori schema.
- Permesso host mancante: nessuna richiesta, proposta per dominio, avviso `no-permission`.
- La chiave API sta in `storage.local` e mai in `sync` né nello stato di sessione.

## Scenari coperti (AG-07), in `tests/nano.test.ts`

- Nessun Generatore configurato e Nano disponibile: Nano usato con lo schema JSON, nessuna richiesta di rete, stessi dati ripuliti, lingua del browser.
- Il Generatore configurato ha la precedenza su Nano; uno configurato senza permesso lascia il posto a Nano con l'avviso.
- Nano da scaricare, in download o non supportato: proposta per dominio, Nano mai usato, avviso nei primi due casi; senza Prompt API nessun avviso.
- Divisione in blocchi con un contesto piccolo: tutte le tab inviate una sola volta, il nome inventato nel primo blocco tra le opzioni del secondo, gruppi omonimi uniti.
- Nano in errore: proposta per dominio con avviso.
- Stessa validazione degli altri Generatori.

## Scenari coperti (AG-08), in `tests/classifier.test.ts`

`installFakeFetch` riceve una funzione che risponde secondo l'URL: `/v1/systemone` nel formato System One (`systemOneReply`), `/chat/completions` nel formato OpenAI.

- Contratto: `POST /v1/systemone`, `state` con la sola tab ripulita, `questions.group` di tipo `choice` con le opzioni (categorie e gruppi aperti) come `criteria` più `none_of_the_above`; `Bearer` solo con la chiave; `model` solo se compilato (Jev).
- Al massimo 255 opzioni nei `criteria`.
- Riga 2: assegnazione sopra soglia, tab incerte e categoria sotto il minimo libere, tab singola in un gruppo esistente.
- Soglia configurabile.
- Riga 1: al Generatore arrivano solo le rimaste, in modalità "solo nuovi"; un gruppo nuovo di una sola tab viene sciolto; una tab già assegnata al passo 1 non può essere spostata dal passo 2.
- Nessuna chiamata al Generatore senza tab rimaste.
- Passo 2 in errore: rimaste libere, avviso.
- Classificatore in errore: riga 3 con avviso; senza Generatore, riga 4.
- Permesso mancante: nessuna richiesta, avviso.
- Strategie: `batch` (una richiesta, una domanda per tab, stesso risultato), limite di parallelismo di `per-tab`, scelta sconosciuta o "nessuna".

Prova di mutazione: togliendo il confronto con la soglia falliscono 3 test; chiamando il passo 2 anche senza rimaste ne fallisce 1.

## Scenari coperti (AG-R2)

- Nomi lunghi accettati quando sono quelli di un gruppo aperto o di una categoria.
- Senza opzioni il Classificatore non viene interrogato.
- Il passo 2 non parte con meno tab rimaste del minimo.
- Smoke test: nessuna query, frammento, tab esclusa né ID di Chrome nelle richieste System One.

## Scenari coperti (AG-09), in `tests/save-to-list.test.ts`

- La categoria prende nome e colore attuali del gruppo (dopo rinomina e cambio colore) e la descrizione generata, ripulita; alla descrizione arrivano nome ed esempi con URL ripuliti; il gruppo diventa "lista".
- La proposta resta valida riaprendo il pannello.
- Generatore in errore: descrizione vuota e avviso.
- Nome già presente (maiuscole diverse): nessun duplicato, avviso.
- Solo i gruppi "nuovo AI".
- La categoria salvata è tra le opzioni dell'organizzazione successiva.
- Una modifica successiva toglie l'avviso.

## Scenari coperti (AG-10), in `tests/errors.test.ts`

- Nuovo tentativo dopo 429, 529, 500, 503 con la seconda risposta usata; un solo nuovo tentativo (due errori → livello successivo con l'avviso giusto); nessun nuovo tentativo dopo 401, 403, 422, errore di rete e timeout; anche per il Classificatore.
- Timeout del Generatore (→ dominio) e del Classificatore (→ Generatore), con l'avviso "timeout".
- Risposte non JSON, senza `choices`, fuori schema, System One senza `answers`: avviso "risposta non valida".
- "Interrompi": richieste interrotte, nessuna proposta, avviso; interrompe anche l'attesa del nuovo tentativo; dopo si può ricalcolare e "Annulla" resta; senza calcolo in corso non cambia nulla.
- Classificatore e Generatore entrambi in errore: proposta per dominio con due avvisi.

## Scenari coperti (AG-11), in `tests/descriptions.test.ts`

- Opzione accesa e permesso concesso: descrizioni ripulite al Generatore e, nello `state`, al Classificatore; le pagine senza descrizione restano con titolo e URL.
- Permesso negato oppure opzione spenta: nessuna pagina letta.
- Tab sospesa: non letta.
- Pagina che non risponde: dopo ~500 ms solo titolo e URL per quella tab, senza rallentare le altre.
- Web Store (vecchio e nuovo) e PDF saltati; una pagina non accessibile non blocca le altre.
- Domini esclusi mai letti.
- Senza AI (raggruppamento per dominio) nessuna pagina letta.

`tests/locales.test.ts` controlla che italiano e inglese abbiano le stesse chiavi e che siano tutte nel formato accettato da Chrome (`[A-Za-z0-9_]`).

## Scenari coperti (AG-12), in `tests/locales.test.ts`

- Ogni chiave scritta nel codice (`t('…')`, chiavi di errore e di avviso, `__MSG_…__` nel manifest e nell'HTML) esiste nelle traduzioni. Il test legge i sorgenti di `src/`, `entrypoints/` e `wxt.config.ts` e riconosce le chiavi dai prefissi usati nei file di traduzione.
- Esistono le chiavi composte a runtime: avvisi per ogni causa, 9 colori, 4 provenienze, 4 stati di Gemini Nano, nome e descrizione delle 10 categorie predefinite.
- Italiano e inglese usano gli stessi segnaposto (`$PROVIDER$`, `$NAME$`, …).

Prova di mutazione fatta a mano: cambiando `t('popupSaveToListHint')` in una chiave inesistente il test fallisce indicando la chiave.

Prova di mutazione fatta a mano: togliendo lo scarto delle tab duplicate o il controllo del permesso, il test corrispondente fallisce.

## Scenari coperti (AG-R3)

- `tests/classifier.test.ts`: in modalità `per-tab`, al primo errore non partono altre richieste e quelle in corso vengono interrotte (10 tab, 3 in parallelo: 3 richieste).
- `tests/errors.test.ts`: "Interrompi" ferma anche un calcolo ancora in coda, che non fa richieste; due richieste per la stessa finestra condividono il calcolo; una per un'altra finestra riceve la propria proposta; "Ricalcola" durante un calcolo ne avvia uno nuovo.
- `tests/nano.test.ts`: un errore di `clone()` diventa `invalid-request`; il tempo massimo vale per ogni blocco (due blocchi da 120 ms con un limite di 200 ms riescono). Il `prompt` finto ora rispetta il segnale di interruzione, come la Prompt API.
- `tests/save-to-list.test.ts`: una tab aperta mentre si genera la descrizione fa scadere la proposta.

Ogni test nuovo è stato provato con una mutazione: rimettendo il comportamento vecchio, fallisce.

## Scenari coperti (anteprima per sito e tempi), in `tests/preview.test.ts`

- Mentre l'AI calcola, lo stato annunciato è `computing` con la proposta per sito in `preview`; la proposta AI la sostituisce e `preview` sparisce.
- "Usa questa": richiesta interrotta, proposta per sito in `ready`, senza avviso, modificabile e applicabile; riaprendo il pannello viene riusata senza nuove richieste; senza calcolo in corso non cambia nulla; un calcolo in coda senza anteprima finisce come con "Interrompi".
- "Interrompi" resta com'era: nessuna proposta, nemmeno l'anteprima.
- Nessuna anteprima in modalità per sito e senza livelli AI utilizzabili.
- Tempi: fasi misurate con il Generatore, con il Generatore in errore (anche `domain`) e in modalità per sito; il cronometro con un orologio finto.
- Prova di mutazione: senza l'anteprima falliscono 4 test.

## Scenari coperti (cache, Generatore e Gemini Nano più veloci), in `tests/speed.test.ts`

- Cache del Classificatore: aprendo una tab si classifica solo quella, con lo stesso risultato; "Ricalcola" e il cambio di soglia non fanno richieste; cambiare la descrizione di una categoria o il modello riclassifica tutto; una risposta illeggibile non viene ricordata; dopo un errore non resta nulla in cache.
- Cache delle descrizioni: un nuovo calcolo legge solo le pagine nuove; una pagina lenta o non accessibile si riprova; una tab sospesa ritrova la descrizione dello stesso URL senza essere letta.
- `createSessionCache`: oltre il limite escono le voci più vecchie, una voce riscritta torna la più recente.
- Generatore: `max_tokens` inviato; risposta tagliata → "risposta non valida" e dominio; dopo un 400 il nuovo tentativo è senza schema né tetto; in "solo nuovi" le opzioni vanno solo per nome.
- Gemini Nano: sessione base creata una volta e riusata; con il Classificatore la sessione esiste già mentre il Classificatore lavora; una creazione fallita (anche quella anticipata) e una sessione rotta non vengono riusate.
- Il test di privacy del Generatore cercava "token" in tutta la richiesta e ora lo trovava in `max_tokens`: cerca `token=abc` e `abc`.
- Prove di mutazione su 16 punti del codice nuovo: ognuna fa fallire almeno un test.

## Scenari coperti (guida al primo avvio), in `tests/onboarding.test.ts`

- Passi della guida con l'AI (benvenuto, modalità, Generatore, Classificatore, riepilogo) e per sito (senza i provider).
- Alla prima installazione si apre una scheda con `onboarding.html`; dopo un aggiornamento dell'estensione, di Chrome o di un modulo condiviso no.
- Il test delle traduzioni controlla anche le chiavi con prefisso `onboarding`.
- Smoke test: la guida aperta all'installazione si percorre fino in fondo (5 passi con l'AI, con le sezioni Generatore e Classificatore), il riepilogo mostra i tre livelli e l'avviso "Gemini Nano non supportato"; passando a "Per sito" i passi diventano 3. Screenshot del passo del Generatore e del riepilogo.

## Scenari coperti (permessi dei provider e `<all_urls>`), in `tests/permissions.test.ts`

Con un finto `permissions` che riproduce il caso peggiore di Chrome (un host già coperto da `<all_urls>` viene concesso senza essere registrato):
- spegnendo le descrizioni gli host dei provider rimasti senza permesso vengono richiesti di nuovo, tutti in una richiesta;
- se Chrome li aveva registrati non si chiede nulla;
- se l'utente rifiuta, vengono restituiti gli host rimasti senza permesso;
- senza provider su un server si toglie solo `<all_urls>`.
- Prova di mutazione: senza la nuova richiesta falliscono 2 test.

Smoke test: "Apri il pannello" nella guida apre davvero il pannello laterale (bersaglio `sidepanel.html`); nelle impostazioni il pulsante "Offrimi un caffè" punta a Buy Me a Coffee ed è visibile a 800 px (in fondo) e a 1280 px (nel menu).

## Prova in Chrome

`npm run smoke` compila e lancia `scripts/smoke.mjs`: apre Chrome for Testing con l'estensione caricata, apre pagine servite da un server locale su `localhost` e `127.0.0.1` (due domini diversi), apre il pannello laterale come pagina (`sidepanel.html`), ricarica il pannello per verificare che la proposta resti, rinomina un gruppo, ne cambia il colore e sposta una tab (salvando uno screenshot in `scripts/smoke-popup.png`), ricarica di nuovo per verificare che le modifiche restino, preme "Applica", poi "Annulla ultima organizzazione" e controlla che ordine delle tab e gruppi tornino come prima; infine apre la pagina opzioni, prova la sezione Categorie (nome duplicato rifiutato, rinomina, aggiunta, riordino, ripristino, controllando `storage.sync`), imposta il minimo a 3 ed esclude `127.0.0.1` (screenshot in `scripts/smoke-options.png`), controlla `storage.sync` e ricalcola la proposta. Stampa i gruppi creati e gli eventuali errori in console del service worker e del pannello.

Poi lo script accende "Leggi la descrizione delle pagine" nella sezione Privacy, ricalcola e controlla che al finto Generatore arrivino le meta description lette dalle pagine con `chrome.scripting`, quindi spegne l'interruttore.

Infine lo script configura il Classificatore (preset Personalizzato verso un finto endpoint System One dello stesso server), lo salva, prova la connessione e ricalcola: la proposta viene dal Classificatore, senza chiamate al Generatore e senza avvisi.

`scripts/measure-classifier.mjs` non fa parte dello smoke test: misura le due strategie del Classificatore su un server System One reale (vedi l'architettura).

Lo script legge anche lo stato di Gemini Nano mostrato nelle impostazioni. In Chrome for Testing headless la Prompt API esiste nel service worker dell'estensione, ma il modello risulta "non supportato": il percorso con Nano disponibile è coperto solo dallo stub e va provato a mano in un Chrome che supporta Gemini Nano.

Dopo le impostazioni lo script configura il Generatore dall'interfaccia (preset Personalizzato verso un finto server compatibile OpenAI dentro lo script stesso), lo salva, preme "Prova connessione", controlla che la chiave sia in `storage.local` e non in `sync`, ricalcola la proposta (gruppo "nuovo AI"), preme "Salva nella lista" e controlla la categoria salvata in `storage.sync`, controlla che le richieste non contengano query, frammenti né tab escluse, poi fa fallire il server (500) e verifica il nuovo tentativo (2 richieste) e il ripiego sul dominio con l'avviso, poi lascia il server senza risposta e preme "Interrompi" (nessuna proposta, avviso di calcolo interrotto) (screenshot in `scripts/smoke-popup-warning.png`).

Alla fine lo script prova le quattro righe della tabella dei fallback con tutte le tab, accendendo e spegnendo i provider in `storage.sync`. Il finto System One risponde con confidenza bassa per le pagine `/c` e `/d`. Risultati attesi e ottenuti: entrambi → "Work" (lista, 3 tab) + "Nuovo Tema" (nuovo AI, 2 tab), 5 richieste System One e 1 al Generatore; solo Classificatore → "Work" (3 tab), le altre 2 libere, nessuna richiesta al Generatore; solo Generatore → un gruppo da 5 tab; nessuno → due gruppi per dominio. `repropose` conta solo le richieste del calcolo forzato da "Ricalcola", non quelle del calcolo che il pannello fa da solo all'apertura. La pagina `/e` ha la meta description vuota e una `og:description`, che deve arrivare all'AI.

`scripts/permissions-check.mjs` (a parte, sulla build normale) controlla che le richieste di permesso partano dentro il gesto dell'utente: il clic su "Salva" del Generatore e sull'interruttore delle descrizioni lasciano aperta la finestra di Chrome, mentre una richiesta dal service worker viene rifiutata. Una richiesta da `page.evaluate` non serve come controprova, perché Puppeteer la esegue come gesto dell'utente. Prova di mutazione: spostando `permissions.request` dopo un'attesa di 6 s, il salvataggio fallisce con "must be called during a user gesture".

All'avvio lo script controlla anche con `chrome.commands.getAll()` che la scorciatoia per il pannello sia registrata (su macOS: `⌥⇧G`).

`npm run smoke` compila con `AUTOGROUP_SMOKE=1`, che aggiunge `<all_urls>` ai permessi host: in headless la finestra di Chrome che chiede il permesso non si può accettare. Alla fine ricompila la build normale.

Chrome stabile dalla 137 ignora `--load-extension`, quindi lo script usa Chrome for Testing scaricato da Puppeteer.
