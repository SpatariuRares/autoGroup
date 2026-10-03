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
- Le modifiche restano nello stato e un nuovo Organizzatore (popup riaperto) le ritrova.
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
- Riaprendo il popup la proposta viene ricalcolata se le tab libere sono cambiate, e mantenuta (con le modifiche) se non lo sono.
- Lo stato indica sempre la finestra.

## Prova in Chrome

`npm run smoke` compila e lancia `scripts/smoke.mjs`: apre Chrome for Testing con l'estensione caricata, apre pagine servite da un server locale su `localhost` e `127.0.0.1` (due domini diversi), apre il popup come pagina, ricarica il popup per verificare che la proposta resti, rinomina un gruppo, ne cambia il colore e sposta una tab (salvando uno screenshot in `scripts/smoke-popup.png`), ricarica di nuovo per verificare che le modifiche restino, preme "Applica", poi "Annulla ultima organizzazione" e controlla che ordine delle tab e gruppi tornino come prima; infine apre la pagina opzioni, imposta il minimo a 3 ed esclude `127.0.0.1` (screenshot in `scripts/smoke-options.png`), controlla `storage.sync` e ricalcola la proposta. Stampa i gruppi creati e gli eventuali errori in console del service worker e del popup.

Chrome stabile dalla 137 ignora `--load-extension`, quindi lo script usa Chrome for Testing scaricato da Puppeteer.
