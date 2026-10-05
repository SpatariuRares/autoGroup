# Pubblicazione sul Chrome Web Store

Materiale pronto per la scheda dello store e per la revisione. Quello che richiede l'account dello sviluppatore (pubblicare l'informativa, compilare la dashboard, caricare lo zip) resta da fare a mano: i passi sono in fondo.

| File | Contenuto |
|---|---|
| [scheda.md](scheda.md) | Nome, riepilogo, descrizione dettagliata e categoria, in italiano e in inglese |
| [privacy.md](privacy.md) | Informativa privacy pubblica, in inglese e in italiano |
| [revisione.md](revisione.md) | Scopo unico, motivazione di ogni permesso, codice remoto, uso dei dati e dichiarazioni |
| `it/`, `en/` | 4 screenshot 1280×800 e la tile promozionale 440×280 per lingua |
| `icon-128.png` | Icona dello store: disegno 96×96 con 16 px di margine trasparente |

## Rigenerare le immagini

`npm run store-assets` (macOS o Linux, serve `openssl`). Usa la build di prova, tab con titoli realistici servite in locale e un Generatore finto, quindi le immagini escono uguali a ogni esecuzione. Testi delle immagini in `COPY` di `scripts/store-assets.mjs`.

## Lo zip

`npm run zip` crea `.output/autogroup-<versione>-chrome.zip` dalla build normale (solo permessi host facoltativi). Prima di ogni nuova versione aumentare `version` in `package.json`.

## Passi a mano

1. **Pubblicare l'informativa** di [privacy.md](privacy.md) a un indirizzo pubblico (per esempio una pagina del repository su GitHub, GitHub Pages o Google Sites), dopo aver sostituito **[contact email] / [email di contatto]** con un indirizzo di contatto.
2. **Account sviluppatore** su <https://chrome.google.com/webstore/devconsole> (registrazione una tantum).
3. **Nuovo elemento**: caricare lo zip.
4. **Store listing**: testi di [scheda.md](scheda.md) per italiano e inglese, icona, screenshot e tile della lingua giusta.
5. **Privacy practices**: risposte di [revisione.md](revisione.md) e URL dell'informativa.
6. **Distribution**: visibilità (pubblica, non in elenco o privata) e paesi.
7. Inviare per la revisione.
