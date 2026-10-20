// Aggiunge, cambia o toglie un testo dell'interfaccia in tutte le lingue di public/_locales, senza
// riformattare i file (il resto del JSON resta com'è, byte per byte).
// Uso: node scripts/add-message.mjs <chiave> --after <chiaveVicina> --it "…" --en "…" --es "…" --fr "…" --de "…"
//      [--placeholders '{"count":{"content":"$1"}}']
//      node scripts/add-message.mjs <chiave> --set --it "…" --en "…" --es "…" --fr "…" --de "…" [--placeholders '…']
//      node scripts/add-message.mjs <chiave> --remove
// Con --set gli altri campi della voce restano (i placeholders anche, salvo --placeholders).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const dir = new URL('../public/_locales/', import.meta.url);
const locales = readdirSync(dir).sort();
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    after: { type: 'string' },
    set: { type: 'boolean' },
    remove: { type: 'boolean' },
    placeholders: { type: 'string' },
    ...Object.fromEntries(locales.map((l) => [l, { type: 'string' }])),
  },
});

const fail = (message) => {
  console.error(`add-message: ${message}`);
  process.exit(1);
};
const [key] = positionals;
if (!key || !/^[A-Za-z0-9_]+$/.test(key)) fail('serve una chiave fatta solo di lettere, cifre e _');
const modes = [values.after !== undefined, values.set, values.remove].filter(Boolean).length;
if (modes !== 1) fail('serve una sola tra --after <chiave vicina> (aggiunge), --set (cambia) e --remove (toglie)');
if (!values.remove) {
  const missing = locales.filter((l) => values[l] === undefined);
  if (missing.length) fail(`manca il testo per: ${missing.map((l) => `--${l}`).join(' ')}`);
}
const placeholders = values.placeholders ? JSON.parse(values.placeholders) : undefined;

/** La voce `name` nel testo: da "\n  "name": {" fino alla sua riga "  }" (rientro di due spazi), virgola compresa. */
function entryOf(text, name) {
  const start = text.indexOf(`\n  ${JSON.stringify(name)}: {`);
  const end = text.slice(start).search(/\n  \},?\n/) + start;
  const close = text.slice(end).match(/^\n  \},?\n/)[0];
  return { start, end: end + close.length, comma: close.endsWith(',\n') };
}

/** La voce scritta come le altre: rientro di due spazi, virgola se non è l'ultima (senza il ritorno a capo finale). */
const entryText = (name, entry, comma) => `\n  ${JSON.stringify(name)}: ${JSON.stringify(entry, null, 2).replace(/\n/g, '\n  ')}${comma ? ',' : ''}`;

/** Sostituisce il testo tra `start` e `end` di una voce, tenendo il ritorno a capo con cui finisce. */
const replaceEntry = (text, { start, end }, replacement) => text.slice(0, start) + replacement + text.slice(end - 1);

const files = locales.map((locale) => {
  const url = new URL(`${locale}/messages.json`, dir);
  const text = readFileSync(url, 'utf8');
  const json = JSON.parse(text);
  let next;
  if (values.after !== undefined) {
    if (key in json) fail(`${locale}: la chiave ${key} esiste già`);
    if (!(values.after in json)) fail(`${locale}: la chiave ${values.after} non esiste`);
    const neighbour = entryOf(text, values.after);
    const entry = { message: values[locale], ...(placeholders ? { placeholders } : {}) };
    // La vicina prende la virgola; la nuova eredita la sua (nessuna se la vicina era l'ultima).
    const neighbourText = text.slice(neighbour.start, neighbour.end).replace(/\n  \},?\n$/, '\n  },');
    next = replaceEntry(text, neighbour, neighbourText + entryText(key, entry, neighbour.comma));
  } else {
    if (!(key in json)) fail(`${locale}: la chiave ${key} non esiste`);
    const current = entryOf(text, key);
    if (values.set) {
      // Gli altri campi della voce (es. placeholders, description) restano; --placeholders li sostituisce.
      const entry = { ...json[key], message: values[locale], ...(placeholders ? { placeholders } : {}) };
      next = replaceEntry(text, current, entryText(key, entry, current.comma));
    } else {
      next = replaceEntry(text, current, '');
      // Tolta l'ultima voce, la virgola della precedente non serve più.
      if (!current.comma) next = next.replace(/\n  \},(\n\}\s*)$/, '\n  }$1');
    }
  }
  JSON.parse(next);
  return { url, next };
});
for (const { url, next } of files) writeFileSync(url, next);
const done = values.after !== undefined ? `aggiunta dopo ${values.after}` : values.set ? 'cambiata' : 'tolta';
console.log(`add-message: ${key} ${done} in ${locales.join(', ')}`);
