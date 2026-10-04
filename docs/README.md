# Documentazione di autoGroup

Documentazione tecnica dell'estensione, aggiornata dopo ogni issue di `issues.json`.

- [Architettura](architettura.md): moduli, flusso dei dati, stato e messaggi.
- [Test](test.md): come si testa l'Organizzatore e il simulatore della barra delle tab.
- [Lavoro svolto](lavoro-svolto.md): registro delle issue completate, con decisioni e verifiche.
- Review: [AG-R1](review/AG-R1.md), [AG-R2](review/AG-R2.md), [AG-R3](review/AG-R3.md).

Per i requisiti vedi [PRD.md](../PRD.md); per l'uso vedi il [README](../README.md).

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm install` | Installa le dipendenze e genera i tipi di WXT (`wxt prepare`). |
| `npm run dev` | Avvia WXT in modalità sviluppo con ricaricamento automatico. |
| `npm run build` | Compila l'estensione in `.output/chrome-mv3`. |
| `npm test` | Esegue i test Vitest. |
| `npm run compile` | Typecheck con `tsc --noEmit`. |
| `npm run check` | Typecheck, test e build in sequenza. |
| `npm run smoke` | Build, poi prova automatica in Chrome for Testing (Puppeteer). |
| `node scripts/permissions-check.mjs` | Dopo `npm run build`: controlla che i permessi opzionali siano chiesti dentro il gesto dell'utente. |

Per caricare l'estensione a mano: `npm run build`, poi `chrome://extensions` → "Modalità sviluppatore" → "Carica estensione non pacchettizzata" → cartella `.output/chrome-mv3`.
