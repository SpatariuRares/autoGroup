# autoGroup privacy policy (Informativa privacy)

*The Italian version follows the English one. Last updated: 5 October 2026.*

## English

autoGroup is a Chrome extension that suggests groups for the tabs in your window. This policy explains which data it handles, where it goes and what it never does.

### Summary

- autoGroup has **no servers of its own**. The developer receives no data, no statistics and no crash reports.
- In **"By site"** mode no data leaves your computer.
- In **"With AI"** mode, the title and a cleaned address of your tabs go **only to the AI provider you choose** in the settings, directly from your browser. With **Gemini Nano**, the model built into Chrome, nothing leaves your computer.
- No data is sold, shared for advertising or used for anything other than grouping your tabs.

### Data sent to the AI provider you choose

This only happens in "With AI" mode, when you have configured a provider that runs on a server (for example OpenRouter, Ollama, LM Studio, Unsloth Studio, or a System One classifier such as Jev, Kev or Rizzo Flow), and only when a proposal is computed. For each ungrouped tab that can be organized:

- the **title**;
- the **address reduced to host and path**: no query string, no fragment, no username or password (for example `www.google.com/search` instead of `https://www.google.com/search?q=…`);
- the **page description** (the `meta description`, at most 300 characters) **only if** you turn on "Read page descriptions" and grant Chrome's permission;
- a short identifier (`t1`, `t2`, …), never Chrome's internal tab IDs.

The request also contains the names and descriptions of your categories and the names of your open tab groups. When you use "Save to list", up to 8 example tabs (title and cleaned address) of that group are sent to describe the new category.

The extension never sends: pinned tabs, tabs already in a group, browser pages (`chrome://`, the new tab page, extension pages), or tabs from the **excluded domains** you list in the settings, including their subdomains.

What the provider does with this data is governed by **its own** privacy policy. Local providers (Ollama, LM Studio, Unsloth Studio, a local System One server) run on your computer.

### Data stored on your device

- **Settings** (mode, categories, excluded domains, provider address and model, threshold, minimum tabs): in `chrome.storage.sync`, synced by Chrome across your browsers if you use Chrome sync.
- **API keys** of the providers: in `chrome.storage.local`, only on this computer, never synced. They are sent only to the provider they belong to, as an `Authorization` header.
- **Current proposal, "Undo" snapshot and caches** (classifier answers and page descriptions already read, to avoid asking again): in `chrome.storage.session`, deleted when Chrome is closed.

### Page descriptions

Only if you turn the option on, autoGroup asks Chrome for permission to read the sites you visit. It then reads **only** the `meta description` (or `og:description`) of the tabs it is about to organize, never the content of the page. Sleeping tabs, excluded domains, Chrome pages, the Chrome Web Store and PDFs are never read. Turning the option off removes the permission.

### Other network requests

- The panel shows the icon of each tab, loaded from the address Chrome provides for that tab, as Chrome's own tab strip does.
- "Test connection" sends a minimal request to the provider you are configuring.
- The "Buy me a coffee" button opens buymeacoffee.com only when you click it.

### Permissions

- `tabs`, `tabGroups`: read titles and addresses of the tabs in the window, create groups, move and close tabs when you ask.
- `storage`: save settings, keys and the current proposal as described above.
- `scripting`: read the page description, only with the optional permission below.
- `sidePanel`: show autoGroup in Chrome's side panel.
- Optional host permissions, requested only when needed: the address of the provider you save (to contact it), and access to all sites only if you turn on page descriptions.

### Changes and contact

Changes to this policy will be published on this page with a new date. Questions: leave a comment at the bottom of this page.

---

## Italiano

autoGroup è un'estensione di Chrome che propone dei gruppi per le tab della finestra. Questa informativa spiega quali dati tratta, dove vanno e cosa non fa mai.

### In breve

- autoGroup **non ha server propri**. Lo sviluppatore non riceve dati, statistiche o segnalazioni di errore.
- In modalità **"Per sito"** nessun dato esce dal computer.
- In modalità **"Con l'AI"** il titolo e l'indirizzo ripulito delle tab vanno **solo al provider AI che scegli** nelle impostazioni, direttamente dal browser. Con **Gemini Nano**, il modello integrato in Chrome, nulla esce dal computer.
- Nessun dato viene venduto, condiviso per pubblicità o usato per altro che raggruppare le tab.

### Dati inviati al provider AI che scegli

Succede solo in modalità "Con l'AI", se hai configurato un provider che gira su un server (per esempio OpenRouter, Ollama, LM Studio, Unsloth Studio, o un classificatore System One come Jev, Kev o Rizzo Flow), e solo quando si calcola una proposta. Per ogni tab libera che si può organizzare:

- il **titolo**;
- l'**indirizzo ridotto a host e percorso**: senza parametri, frammento, nome utente o password (per esempio `www.google.com/search` invece di `https://www.google.com/search?q=…`);
- la **descrizione della pagina** (la `meta description`, al massimo 300 caratteri) **solo se** accendi "Leggi la descrizione delle pagine" e concedi il permesso di Chrome;
- un identificativo breve (`t1`, `t2`, …), mai gli ID interni delle tab di Chrome.

La richiesta contiene anche nomi e descrizioni delle tue categorie e i nomi dei gruppi di tab aperti. Con "Salva nella lista" vengono inviate fino a 8 tab di esempio (titolo e indirizzo ripulito) del gruppo, per descrivere la categoria nuova.

L'estensione non invia mai: tab fissate, tab già in un gruppo, pagine del browser (`chrome://`, nuova scheda, pagine di estensioni) e tab dei **domini esclusi** che indichi nelle impostazioni, compresi i sottodomini.

Cosa fa il provider con questi dati dipende dalla **sua** informativa privacy. I provider locali (Ollama, LM Studio, Unsloth Studio, un server System One locale) girano sul tuo computer.

### Dati salvati sul dispositivo

- **Impostazioni** (modalità, categorie, domini esclusi, indirizzo e modello dei provider, soglia, numero minimo di tab): in `chrome.storage.sync`, sincronizzate da Chrome tra i tuoi browser se usi la sincronizzazione di Chrome.
- **Chiavi API** dei provider: in `chrome.storage.local`, solo su questo computer, mai sincronizzate. Vengono inviate solo al provider a cui appartengono, nell'intestazione `Authorization`.
- **Proposta corrente, foto per "Annulla" e cache** (risposte del classificatore e descrizioni già lette, per non chiederle di nuovo): in `chrome.storage.session`, cancellate alla chiusura di Chrome.

### Descrizione delle pagine

Solo se accendi l'opzione, autoGroup chiede a Chrome il permesso di leggere i siti che visiti. Legge poi **soltanto** la `meta description` (o `og:description`) delle tab che sta per organizzare, mai il contenuto della pagina. Tab sospese, domini esclusi, pagine di Chrome, Chrome Web Store e PDF non vengono mai letti. Spegnendo l'opzione il permesso viene tolto.

### Altre richieste di rete

- Il pannello mostra l'icona di ogni tab, caricata dall'indirizzo che Chrome fornisce per quella tab, come fa la barra delle schede di Chrome.
- "Prova connessione" invia una richiesta minima al provider che stai configurando.
- Il pulsante "Offrimi un caffè" apre buymeacoffee.com solo quando lo clicchi.

### Permessi

- `tabs`, `tabGroups`: leggere titoli e indirizzi delle tab della finestra, creare gruppi, spostare e chiudere tab quando lo chiedi.
- `storage`: salvare impostazioni, chiavi e proposta corrente come descritto sopra.
- `scripting`: leggere la descrizione delle pagine, solo con il permesso facoltativo qui sotto.
- `sidePanel`: mostrare autoGroup nel pannello laterale di Chrome.
- Permessi host facoltativi, chiesti solo quando servono: l'indirizzo del provider che salvi (per contattarlo) e l'accesso a tutti i siti solo se accendi la descrizione delle pagine.

### Modifiche e contatti

Le modifiche a questa informativa saranno pubblicate in questa pagina con una nuova data. Domande: lascia un commento in fondo a questa pagina.
