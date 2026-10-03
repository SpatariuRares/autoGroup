# PRD: autoGroup, raggruppamento AI delle tab per Chrome

Etichetta: `ready-for-agent`

## Problem Statement

Chi lavora con molte tab aperte in Chrome perde rapidamente l'orientamento: tab di lavoro, ricerche, social, acquisti e documentazione si mescolano nella stessa barra. Chrome permette di creare gruppi di tab, ma farlo a mano è lento e noioso, quindi in pratica non lo fa quasi nessuno.

Microsoft Edge ha una funzione "Organizza schede" che propone i gruppi in automatico. Su Chrome però non c'è un equivalente che lasci scegliere quale AI usare. Il raggruppamento integrato di Chrome è legato al modello di Google e non permette di:

- usare un classificatore veloce ed economico come Jev, né le sue alternative locali (Kev, Rizzo Flow);
- usare il proprio account OpenRouter o un modello locale (Ollama, LM Studio);
- definire le proprie categorie con descrizioni che guidano la classificazione;
- controllare quali dati delle tab escono dal computer.

## Solution

Un'estensione Chrome che, al clic sull'icona (o con una scorciatoia da tastiera), analizza le tab libere della finestra corrente e propone dei gruppi. La proposta appare in un'anteprima modificabile nel popup: si possono rinominare i gruppi, cambiarne il colore, spostare o togliere tab e scartare gruppi. Le tab vengono raggruppate solo quando l'utente preme "Applica", e "Annulla" riporta tutto com'era.

La classificazione usa due ruoli AI distinti:

- **Classificatore** (protocollo System One: Jev cloud, Kev o Rizzo Flow in locale). Assegna ogni tab a una categoria nota (lista fissa dell'utente o gruppo già aperto) con una confidenza calibrata.
- **Generatore** (protocollo compatibile OpenAI: OpenRouter, Ollama, LM Studio, oppure Gemini Nano integrato in Chrome). Inventa nomi di nuove categorie per le tab che il Classificatore non sa collocare.

L'estensione funziona anche senza alcuna configurazione. Se non c'è nessuna AI raggruppa per dominio; se Chrome ha Gemini Nano lo usa in automatico. Se un provider fallisce si passa al livello successivo e un avviso spiega cosa è successo.

L'utente decide quali dati vengono inviati: di default titolo e URL ripulito; in più, con un permesso opzionale, la descrizione delle pagine. Può anche escludere interi domini.

## User Stories

### Flusso principale

1. Come utente con molte tab aperte, voglio cliccare l'icona dell'estensione per ottenere una proposta di gruppi, così da mettere ordine senza trascinare le tab a mano.
2. Come utente, voglio avviare l'organizzazione con una scorciatoia da tastiera, così da non dover usare il mouse.
3. Come utente, voglio vedere un'anteprima dei gruppi proposti prima che vengano creati, così da mantenere il controllo sulle mie tab.
4. Come utente, voglio che nessuna tab venga spostata o raggruppata finché non premo "Applica", così da potermi fidare dell'estensione.
5. Come utente, voglio che venga considerata solo la finestra corrente, così che le tab delle altre finestre restino dove le ho messe.
6. Come utente, voglio che le tab fissate non vengano mai toccate, così che le mie tab permanenti restino al loro posto.
7. Come utente, voglio che le tab già in un gruppo restino dove sono, così che l'organizzazione fatta a mano venga rispettata.
8. Come utente, voglio che le pagine interne del browser e le tab ancora senza titolo vengano ignorate, così che la proposta contenga solo pagine reali.
9. Come utente, voglio che le tab libere possano finire nei gruppi che ho già creato, così da estendere la mia organizzazione invece di duplicarla.
10. Come utente, voglio che il calcolo continui anche se il popup si chiude per sbaglio, e ritrovare la proposta riaprendolo, così da non dover ricominciare.
11. Come utente, voglio vedere che il calcolo è in corso e poterlo interrompere, così da non restare bloccato se l'AI è lenta.

### Anteprima

12. Come utente, voglio rinominare un gruppo proposto, così che il nome rispecchi come penso io a quelle tab.
13. Come utente, voglio cambiare il colore di un gruppo proposto, così da riconoscerlo a colpo d'occhio.
14. Come utente, voglio togliere una singola tab da un gruppo proposto, così che resti libera se è stata classificata male.
15. Come utente, voglio spostare una tab in un altro gruppo della proposta tramite un menu, così da correggere gli errori senza rifare tutto.
16. Come utente, voglio scartare un intero gruppo proposto, così che le sue tab restino libere.
17. Come utente, voglio vedere la provenienza di ogni gruppo (lista, esistente, nuovo AI, dominio), così da capire perché è stato proposto.
18. Come utente, voglio vedere quali tab compongono ogni gruppo proposto, così da valutare la proposta prima di applicarla.
19. Come utente, voglio salvare nella lista delle categorie un gruppo inventato dall'AI, con un pulsante "Salva nella lista", così che le volte successive venga riconosciuto direttamente.

### Annulla

20. Come utente, voglio annullare l'ultima organizzazione applicata, così da tornare indietro se il risultato non mi piace.
21. Come utente, voglio che "Annulla" riporti ogni tab nel gruppo e nella posizione originali, così da ritrovare la barra com'era.
22. Come utente, voglio che "Annulla" ignori le tab chiuse nel frattempo e non tocchi quelle aperte dopo, così da non perdere il lavoro fatto dopo l'organizzazione.
23. Come utente, voglio che "Annulla" resti disponibile fino all'organizzazione successiva, così da avere tempo per valutare il risultato.

### Regole sui gruppi

24. Come utente, voglio che non vengano creati gruppi nuovi con una sola tab, così che la barra non si riempia di gruppi inutili.
25. Come utente, voglio configurare il numero minimo di tab per creare un gruppo nuovo, così da adattare il comportamento al mio modo di lavorare.
26. Come utente, voglio che una singola tab possa entrare in un gruppo che esiste già, così che la mia organizzazione resti completa.
27. Come utente, voglio che le tab rimaste sole dopo la classificazione vengano riconsiderate insieme alle altre tab incerte, così che possano formare un gruppo nuovo sensato.
28. Come utente, voglio che il raggruppamento per dominio segua le stesse regole, così da avere un comportamento coerente.

### Funzionamento senza configurazione e fallback

29. Come nuovo utente senza alcuna configurazione, voglio che l'estensione raggruppi subito le tab per dominio, così da vederla funzionare appena installata.
30. Come utente con un Chrome che supporta Gemini Nano, voglio che venga usato in automatico come Generatore, così da avere gruppi intelligenti senza chiavi API né costi.
31. Come utente, voglio ricevere sempre una proposta anche quando un provider fallisce, così che l'estensione non mi lasci mai a mani vuote.
32. Come utente, voglio un avviso chiaro nell'anteprima quando un provider non è raggiungibile, con un link alle impostazioni, così da capire perché la proposta è meno precisa.
33. Come utente, voglio un messaggio esplicito quando la mia chiave API non è valida, così da sapere subito cosa correggere.
34. Come utente che paga a consumo, voglio che l'estensione ritenti al massimo una volta e solo per errori temporanei, così da non spendere soldi in tentativi infiniti.
35. Come utente, voglio che le risposte malformate dell'AI vengano scartate invece di produrre gruppi sbagliati, così che nessuna tab finisca in un posto assurdo o sparisca.
36. Come utente, voglio un tempo massimo di attesa per ogni provider, così che un server bloccato non blocchi l'estensione.

### Classificatore

37. Come utente con una chiave TypeSafe, voglio usare Jev come Classificatore, così da avere una classificazione veloce, economica e con confidenza calibrata.
38. Come utente che preferisce lavorare in locale, voglio usare Kev o Rizzo Flow sul mio Mac cambiando solo l'URL, così che nessun dato esca dal computer.
39. Come utente, voglio scegliere un preset (Jev, Kev, Rizzo Flow) che compili URL e modello, così da non doverli cercare.
40. Come utente, voglio impostare la soglia di confidenza, così da decidere quanto l'estensione deve essere sicura prima di assegnare una tab.
41. Come utente, voglio che le tab su cui il Classificatore è incerto non vengano forzate in un gruppo, così da evitare classificazioni sbagliate.
42. Come utente, voglio provare la connessione al Classificatore dalle impostazioni, così da sapere subito se la configurazione è corretta.

### Generatore

43. Come utente con una chiave OpenRouter, voglio scegliere un modello economico come Generatore, così da avere nuove categorie a costi minimi.
44. Come utente con Ollama o LM Studio, voglio usarli come Generatore, così da inventare categorie senza servizi cloud.
45. Come utente, voglio che i nomi inventati abbiano al massimo due parole e siano nella lingua del browser, così da stare bene nelle etichette dei gruppi di Chrome.
46. Come utente, voglio che i gruppi nuovi ricevano un colore non ancora usato nella finestra, così da distinguerli facilmente.
47. Come utente senza Classificatore, voglio che il Generatore da solo scelga tra le categorie note o ne inventi di nuove in un'unica chiamata, così da avere un'esperienza simile a Edge.
48. Come utente, voglio provare la connessione al Generatore dalle impostazioni, così da sapere subito se la configurazione è corretta.

### Categorie

49. Come utente, voglio partire con una lista di categorie predefinita (Lavoro, Sviluppo, AI, Social, Notizie, Video, Shopping, Viaggi, Finanza, Studio), così da avere buoni risultati senza configurare nulla.
50. Come utente, voglio aggiungere, modificare, eliminare e riordinare le categorie in una pagina di impostazioni, così da adattarle alla mia vita.
51. Come utente, voglio scrivere una descrizione per ogni categoria, così che l'AI capisca cosa ci rientra e classifichi meglio.
52. Come utente, voglio assegnare a ogni categoria un colore fisso, così che lo stesso tipo di gruppo abbia sempre lo stesso aspetto.
53. Come utente, voglio ripristinare le categorie predefinite, così da rimediare se ho fatto un pasticcio.
54. Come utente, voglio che un gruppo creato a mano con lo stesso nome di una categoria ne usi descrizione e colore, così che i miei gruppi manuali vengano classificati bene.
55. Come utente con più computer, voglio che categorie e preferenze si sincronizzino tra i miei Chrome, così da non doverle reimpostare.

### Privacy e permessi

56. Come utente attento alla privacy, voglio che all'AI vengano inviati di default solo il titolo e l'URL senza parametri né frammento, così che token ed email negli URL non finiscano nei log di un servizio esterno.
57. Come utente, voglio una lista di domini esclusi le cui tab non vengono mai inviate all'AI, così da proteggere banca, posta e dati sanitari.
58. Come utente che vuole più precisione, voglio attivare la lettura della descrizione delle pagine concedendo un permesso solo quando lo scelgo, così da decidere io il compromesso tra privacy e precisione.
59. Come utente che rifiuta quel permesso, voglio che l'estensione continui a funzionare con titolo e URL, così da non essere penalizzato.
60. Come utente, voglio che le tab sospese da Risparmio memoria non vengano mai risvegliate per leggerne il contenuto, così da non ritrovarmi decine di pagine ricaricate.
61. Come utente, voglio che le mie chiavi API restino solo su questo computer e non vengano sincronizzate, così da limitare dove sono salvate.
62. Come utente che usa solo provider locali, voglio la garanzia che nessun dato delle tab esca dal computer.
63. Come utente, voglio che l'estensione chieda i permessi di rete solo per i provider che configuro, così da non concedere accessi inutili.

### Lingua e manutenzione

64. Come utente italiano o inglese, voglio l'interfaccia nella mia lingua, così da usarla senza fatica.
65. Come manutentore, voglio che permessi e testi siano già pronti per il Chrome Web Store, così da poter pubblicare in futuro senza riscrivere l'estensione.
66. Come manutentore, voglio aggiungere un nuovo provider compatibile con uno dei due protocolli tramite un preset, senza toccare la pipeline, così da seguire l'evoluzione dei modelli.
67. Come manutentore, voglio poter aggiungere più avanti l'API TypeSafe con funzioni avanzate senza cambiare il resto, così che l'architettura regga nel tempo.

## Implementation Decisions

### Architettura generale

- Estensione Manifest V3 costruita con **WXT** e **TypeScript**, con **React** per popup e impostazioni.
- Tutta la logica gira nel **service worker**. Il popup è solo un'interfaccia: chiede di organizzare, mostra la proposta, invia le modifiche, "Applica" e "Annulla", e comunica con il service worker tramite messaggi.
- Lo stato della sessione (calcolo in corso, proposta corrente, foto per l'annulla) sta in `chrome.storage.session`, così sopravvive alla chiusura del popup ma non alla chiusura di Chrome.
- Testi dell'interfaccia in `chrome.i18n` fin dall'inizio, in italiano e inglese.

### Moduli

- **Organizzatore**: il modulo principale, con un'interfaccia piccola: *proponi* (per una finestra: restituisce una proposta), *applica* (una proposta, eventualmente modificata), *annulla* (l'ultima operazione) e *stato* (calcolo in corso, proposta, annulla disponibile). Al suo interno coordina tutti gli altri moduli. È l'unico punto chiamato dal popup.
- **Selezione tab**: dalla finestra corrente estrae le tab candidate, escludendo fissate, già raggruppate, pagine interne, tab senza titolo e domini esclusi. Elenca anche i gruppi già aperti nella finestra.
- **Preparazione dati**: per ogni tab produce le informazioni da inviare all'AI: ID breve (`t1`, `t2`, …), titolo, URL ripulito (dominio e percorso, senza query né frammento) e descrizione della pagina se disponibile. Gli ID di Chrome non vengono mai inviati all'AI.
- **Lettore descrizioni**: attivo solo se l'opzione è accesa e il permesso opzionale `<all_urls>` è stato concesso. Legge la meta description tramite `chrome.scripting`, in parallelo, con un timeout di circa 500 ms per tab. Salta le tab sospese senza risvegliarle e salta le pagine non leggibili; per quelle tab si usano solo titolo e URL.
- **Catalogo categorie**: legge la lista fissa (nome, descrizione, colore) e costruisce le opzioni per la classificazione: categorie della lista più gruppi già aperti. Se un gruppo aperto ha lo stesso nome di una categoria (maiuscole e minuscole non contano), ne prende descrizione e colore; altrimenti la descrizione è "Gruppo creato dall'utente: «nome»".
- **Adattatore Classificatore (System One)**: interfaccia *classifica(tab, opzioni) → per ogni tab: categoria e confidenza*. Contratto: `POST {URL base}/v1/systemone` con autenticazione `Bearer` (opzionale per i server locali). Il corpo contiene `state`, `model` e `questions`, con domande di tipo `choice` i cui `criteria` mappano nome e descrizione di ogni opzione (massimo 255). La risposta contiene `answers` con `choice`, `confidence` e `probabilities`. Preset: Jev (`https://api.typesafe.ai`, modello `jev-latest`), Kev (`http://127.0.0.1:8009`), Rizzo Flow (`http://127.0.0.1:8017`).
- **Adattatore Generatore**: interfaccia *genera(tab, categorie note, modalità) → elenco di gruppi {nome, ID brevi delle tab}* e *descrivi(nome categoria, tab di esempio) → descrizione*, usato da "Salva nella lista". Due modalità:
  - *solo nuovi*: passo 2 della pipeline, inventa gruppi per le tab rimaste;
  - *completo*: usato quando manca il Classificatore; sceglie tra le categorie note oppure ne inventa di nuove.

  Due implementazioni con la stessa interfaccia:
  - **compatibile OpenAI** (`/chat/completions` con structured output tramite schema JSON dove supportato, altrimenti JSON con validazione). Preset: OpenRouter (`https://openrouter.ai/api/v1`), Ollama (`http://localhost:11434/v1`), LM Studio (`http://localhost:1234/v1`);
  - **Gemini Nano** tramite la Prompt API di Chrome (`LanguageModel`), con vincolo di risposta tramite schema JSON.
- **Raggruppamento per dominio**: raggruppa le tab per dominio quando non c'è nessuna AI disponibile.
- **Pipeline**: sceglie il livello in base a cosa è configurato e disponibile, secondo la tabella seguente, poi applica le regole sui gruppi.

  | Classificatore | Generatore | Comportamento |
  |---|---|---|
  | sì | sì | passo 1 (Classificatore), poi il passo 2 (Generatore, modalità *solo nuovi*) sulle tab rimaste |
  | sì | no | solo passo 1, le tab rimaste restano libere |
  | no | sì | Generatore in modalità *completo* |
  | no | no | raggruppamento per dominio |

  Generatore usato, in ordine: quello configurato dall'utente, altrimenti Gemini Nano se `LanguageModel.availability()` lo dà disponibile, altrimenti nessuno.
- **Regole sui gruppi** (dentro la pipeline):
  - un gruppo nuovo richiede almeno N tab (default 2, configurabile);
  - una tab può entrare da sola in un gruppo esistente;
  - nel passo 1 diventano "rimaste" le tab sotto soglia (default 0,7) e quelle assegnate a una categoria della lista che resterebbe con meno di N tab;
  - dopo il passo 2 i gruppi nuovi con meno di N tab vengono sciolti.
- **Validatore**: controlla la risposta del Generatore. Scarta ID inesistenti, tab assegnate a più gruppi e nomi vuoti; tronca i nomi oltre le due parole o li rifiuta. Le tab scartate restano libere.
- **Assegnatore colori**: le categorie della lista usano il loro colore fisso, i gruppi esistenti mantengono il proprio, i gruppi nuovi ricevono a rotazione i colori non ancora usati nella finestra.
- **Applicatore**: prima scatta la foto dello stato (per ogni tab coinvolta: ID, gruppo o nessuno, posizione), poi crea o estende i gruppi con `chrome.tabs.group` e ne imposta nome e colore con `chrome.tabGroups.update`.
- **Annulla**: usa la foto per riportare ogni tab ancora aperta nel suo gruppo originale (o fuori da ogni gruppo) e nella sua posizione, e scioglie i gruppi creati. Ignora le tab chiuse e quelle nuove, e non rinomina all'indietro i gruppi.
- **Popup**: avvio, avanzamento con "Interrompi", anteprima modificabile (rinomina, colore, togli tab, sposta tab tramite menu, scarta gruppo, etichetta di provenienza, "Salva nella lista"), avvisi sui fallback, "Applica", "Annulla ultima organizzazione".
- **Impostazioni**: pagina opzioni in una tab intera, con sezioni Categorie, Classificatore, Generatore, Privacy e Comportamento. Ogni provider ha il pulsante "Prova connessione".

### Proposta (forma dei dati)

Una proposta è un elenco di gruppi più un elenco di avvisi. Ogni gruppo ha: nome, colore, provenienza (*lista*, *esistente*, *nuovo AI*, *dominio*), il riferimento al gruppo Chrome se è già esistente, le tab assegnate e, per i gruppi *nuovo AI*, la possibilità di essere salvato nella lista. Ogni avviso ha: livello saltato, provider coinvolto, causa (non raggiungibile, chiave non valida, limite di richieste, timeout, risposta non valida).

### Gestione errori

- Se un provider fallisce, la pipeline scende di un livello nella tabella e aggiunge un avviso alla proposta.
- Timeout: 5 s per il Classificatore, 30 s per il Generatore.
- Un solo nuovo tentativo, con una breve attesa, solo per 429, 529 e 5xx. Per 401 e 403 nessun tentativo, avviso "chiave non valida". Per 422 nessun tentativo, avviso "richiesta non valida".
- "Interrompi" annulla le richieste in corso e non produce nessuna proposta.

### Salvataggio e permessi

- `chrome.storage.sync`: categorie, soglia, numero minimo di tab, preset e URL dei provider, opzione descrizioni, domini esclusi.
- `chrome.storage.local`: chiavi API.
- `chrome.storage.session`: stato del calcolo, proposta corrente, foto per l'annulla.
- Permessi obbligatori: `tabs`, `tabGroups`, `storage`, `scripting`.
- Permessi opzionali, chiesti al momento con un gesto dell'utente: gli host dei provider configurati e `<all_urls>` per le descrizioni.
- Scorciatoia da tastiera: `Alt+Shift+G` per aprire il popup.

## Testing Decisions

### Cosa rende un buon test

- I test verificano il comportamento osservabile dall'esterno: date certe tab, gruppi e impostazioni, quale proposta esce; dopo "Applica", quali gruppi esistono nel browser; dopo "Annulla", com'è tornato lo stato.
- Non verificano come i moduli interni si chiamano tra loro, né la forma esatta delle richieste, salvo dove la richiesta *è* il contratto (es. che le categorie arrivino come `criteria` al Classificatore).
- Ogni test descrive uno scenario reale ("Kev spento e Nano disponibile → proposta dal Generatore con avviso"), non un dettaglio di implementazione.

### Seam di test

- **Un solo seam: l'interfaccia dell'Organizzatore** (*proponi*, *applica*, *annulla*, *stato*). È il punto più alto possibile sotto il popup e copre selezione tab, preparazione dati, catalogo categorie, pipeline, fallback, regole sui gruppi, validazione, colori, applicazione e annulla.
- Ai confini dell'Organizzatore si sostituiscono tre dipendenze esterne:
  - **API del browser** (`tabs`, `tabGroups`, `storage`, `scripting`, `permissions`): fake browser di WXT, completato con un piccolo fake per le API che non copre (es. `tabGroups`).
  - **Rete**: `fetch` sostituito da risposte registrate nei due formati (System One e compatibile OpenAI), compresi errori 401, 429, 529, timeout e JSON malformato.
  - **Gemini Nano**: stub dell'oggetto globale `LanguageModel` con i quattro stati di disponibilità.
- Popup e impostazioni non hanno test automatici nelle prime tappe: si verificano a mano caricando l'estensione non pacchettizzata in Chrome.

### Scenari da coprire

- Selezione tab: fissate, già raggruppate, pagine interne, senza titolo e domini esclusi vengono escluse; viene considerata solo la finestra corrente.
- Privacy: query e frammento non compaiono mai nei dati inviati; le tab dei domini esclusi non compaiono mai nelle richieste; con il permesso negato non si legge nessuna descrizione; le tab sospese non vengono lette.
- Le quattro righe della tabella dei fallback, più la discesa di livello per ogni tipo di errore, con l'avviso corretto.
- Soglia di confidenza: le tab sotto soglia passano al Generatore.
- Regole sui gruppi: minimo N tab, tab singola in un gruppo esistente, tab sole passate al passo 2, gruppi nuovi troppo piccoli sciolti.
- Corrispondenza per nome tra gruppi aperti e categorie, senza distinguere maiuscole e minuscole.
- Validazione: ID inventati, duplicati, nomi vuoti o troppo lunghi.
- Colori: fissi per le categorie, preservati per i gruppi esistenti, a rotazione tra quelli liberi per i nuovi.
- Applica: gruppi creati o estesi con nome e colore corretti, proposta modificata rispettata.
- Annulla: ripristino di gruppi e posizioni, tab chiuse ignorate, tab nuove non toccate.
- Nuovo tentativo: uno solo, solo per 429, 529 e 5xx.

### Prior art

Il progetto parte da zero, quindi non ci sono test esistenti da prendere come modello. Il primo test sull'Organizzatore, scritto nella tappa 1 per il raggruppamento per dominio, fa da modello per tutti i successivi.

## Out of Scope

- Raggruppamento automatico all'apertura di nuove tab.
- Pulsante "Riorganizza tutto", che rimetterebbe in gioco anche le tab già raggruppate.
- Raggruppamento su più finestre o spostamento di tab tra finestre.
- Drag & drop nell'anteprima.
- Uso di `typesafe/jev-router` su OpenRouter come Classificatore.
- Adattatori per protocolli diversi da System One e compatibile OpenAI.
- Pubblicazione sul Chrome Web Store: informativa privacy, pagina dello store e onboarding. Elencati come TODO nel README.
- Test automatici di popup e impostazioni.

## Further Notes

- **Ordine di sviluppo (tappe):**
  1. struttura di base, anteprima, Applica e Annulla, raggruppamento per dominio;
  2. impostazioni e categorie;
  3. Generatore (compatibile OpenAI e Gemini Nano);
  4. Classificatore (System One) e pipeline completa;
  5. descrizione delle pagine;
  6. traduzioni, scorciatoia e rifinitura.

  Ogni tappa produce un'estensione funzionante.
- **`jev-router` non è Jev.** Su OpenRouter l'unico modello TypeSafe è `typesafe/jev-router`, un router verso LLM scelti di volta in volta, senza confidenza calibrata e con prezzo variabile. Jev vero è disponibile solo tramite l'API TypeSafe diretta, che richiede l'accesso anticipato, oppure tramite Kev e Rizzo Flow, che ne replicano il protocollo.
- **Modelli locali su Mac:**
  - Kev: usare `kev-0.8b` (~4 GB), perché la 4B di default richiede ~17 GB.
  - Rizzo Flow: 1.7B (~1,8 GB) o 4B (~4,4 GB).
  - Gemini Nano: servono una GPU con più di 4 GB di VRAM oppure 16 GB di RAM, ~22 GB liberi su disco, e un download iniziale del modello.
- **Da verificare nella tappa 3:** se Ollama rifiuta le richieste con origine `chrome-extension://`, documentare l'impostazione `OLLAMA_ORIGINS`.
- **Da decidere nella tappa 3:** il modello OpenRouter di default per il Generatore (economico, con supporto allo structured output).
- **Da decidere nella tappa 4, misurando:** per il Classificatore, una richiesta per tab (con un limite di richieste in parallelo) oppure una sola richiesta con una domanda per tab.
- **Domanda aperta:** di quali provider dispone già l'utente (chiave OpenRouter, chiave TypeSafe, Kev, Rizzo, Ollama)? Non cambia l'ordine delle tappe, ma serve per i test manuali delle tappe 3 e 4.
- Non è configurato nessun issue tracker: questo PRD vive come file nel repository.
