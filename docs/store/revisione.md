# Revisione: scopo unico, permessi e pratiche sulla privacy

Risposte da incollare nella scheda **"Privacy practices"** della dashboard sviluppatore. La dashboard le chiede in inglese; la traduzione italiana è sotto ogni risposta, per controllo. Le risposte sulla raccolta dei dati sono una proposta: la scelta finale spetta a chi pubblica.

## Scopo unico (*Single purpose*)

> autoGroup organizes the tabs of the current window into Chrome tab groups. It suggests groups by site or by topic (optionally with an AI provider chosen by the user), shows an editable preview, and applies the groups only when the user confirms, with an undo.

*autoGroup organizza le tab della finestra corrente in gruppi di Chrome. Propone gruppi per sito o per argomento (facoltativamente con un provider AI scelto dall'utente), mostra un'anteprima modificabile e applica i gruppi solo quando l'utente conferma, con la possibilità di annullare.*

## Motivazione dei permessi (*Permission justification*)

| Permesso | Motivazione (inglese, da incollare) |
|---|---|
| `tabs` | Reads the title and URL of the tabs in the current window to build the grouping proposal, and moves or closes tabs when the user asks (Apply, Undo, close a tab from the panel). |
| `tabGroups` | Creates the proposed tab groups with their name and color, adds tabs to groups the user already has, and reads open groups so they can be extended instead of duplicated. |
| `storage` | Saves the user's settings (categories, excluded domains, provider address and model), the provider API keys (local only, never synced) and the current proposal with its undo snapshot (session storage, cleared when Chrome closes). |
| `scripting` | Only when the user turns on the optional "Read page descriptions" setting and grants access to sites: reads the meta description of the tabs being organized, to classify them more accurately. It never reads page content and never runs on excluded domains. |
| `sidePanel` | Shows the proposal in Chrome's side panel, which stays open while the user switches tabs and while a local AI model computes the proposal (it can take tens of seconds). |
| Permessi host facoltativi (`http://*/*`, `https://*/*`, `<all_urls>`) | Requested at runtime, never at install. When the user saves an AI provider, only that provider's host is requested, so the extension can send it the tab titles and cleaned URLs to classify. `<all_urls>` is requested only when the user turns on "Read page descriptions", and removed when it is turned off. |

Traduzione:

- **tabs**: legge titolo e URL delle tab della finestra per costruire la proposta; sposta o chiude tab quando l'utente lo chiede.
- **tabGroups**: crea i gruppi con nome e colore, aggiunge tab ai gruppi già aperti, legge i gruppi aperti per estenderli invece di duplicarli.
- **storage**: impostazioni, chiavi API (solo in locale), proposta corrente e foto per "Annulla" (in sessione).
- **scripting**: solo con l'opzione facoltativa "Leggi la descrizione delle pagine": legge la meta description delle tab da organizzare, mai il contenuto, mai sui domini esclusi.
- **sidePanel**: mostra la proposta nel pannello laterale, che resta aperto mentre l'AI calcola.
- **Permessi host facoltativi**: chiesti durante l'uso, mai all'installazione: l'host del provider salvato, e `<all_urls>` solo con le descrizioni accese (tolto quando si spengono).

## Codice remoto (*Remote code*)

> No. All JavaScript is included in the package. The extension does not load or evaluate remote code; it only sends HTTP requests with tab data to the AI provider configured by the user and reads JSON responses.

*No. Tutto il JavaScript è nel pacchetto. L'estensione non carica né esegue codice remoto: invia richieste HTTP con i dati delle tab al provider AI configurato dall'utente e legge risposte JSON.*

## Uso dei dati (*Data usage*)

### Tipi di dati da dichiarare

| Tipo nella dashboard | Proposta | Perché |
|---|---|---|
| Web history | **Sì** | Titoli e URL (host e percorso) delle tab aperte vengono inviati al provider AI scelto dall'utente, in modalità AI con un provider su un server. |
| Website content | **Sì** | Titoli delle pagine e, se l'utente accende l'opzione, la meta description vengono inviati allo stesso provider. |
| Authentication information | Da valutare | Le chiavi API inserite dall'utente restano in `storage.local` e vengono inviate solo al provider a cui appartengono. Lo sviluppatore non le riceve. Dichiararle è la scelta più prudente. |
| Personally identifiable information, Health, Financial and payment, Personal communications, Location, User activity | No | L'estensione non le raccoglie. Titoli di tab possono contenerne per caso (es. l'oggetto di una mail), per questo l'utente può escludere domini e usare Gemini Nano o un provider locale. |

Nota: lo sviluppatore non riceve nessuno di questi dati. Vanno solo dal browser al provider che l'utente configura (che può essere sul suo stesso computer) per fornire la funzione di raggruppamento. Con "Per sito" o con Gemini Nano non esce nulla.

### Dichiarazioni (*Certifications*), tutte da spuntare

- I do not sell or transfer user data to third parties, outside of the approved use cases. *(Il trasferimento al provider AI è scelto dall'utente ed è necessario alla funzione.)*
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

### URL dell'informativa privacy

L'URL pubblico della pagina pubblicata da [privacy.md](privacy.md). Va pubblicata prima di inviare la revisione (vedi [README](README.md)).
