// Aggiunge un testo dell'interfaccia in tutte le lingue di public/_locales, subito dopo una chiave
// vicina, senza riformattare i file (il resto del JSON resta com'è).
// Uso: node scripts/add-message.mjs <chiave> --after <chiaveVicina> --it "…" --en "…" --es "…" --fr "…" --de "…"
//      [--placeholders '{"count":{"content":"$1"}}']
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const dir = new URL('../public/_locales/', import.meta.url);
const locales = readdirSync(dir).sort();
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    after: { type: 'string' },
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
if (!values.after) fail('serve --after <chiave vicina>, per tenere il testo accanto a quelli simili');
const missing = locales.filter((l) => values[l] === undefined);
if (missing.length) fail(`manca il testo per: ${missing.map((l) => `--${l}`).join(' ')}`);
const placeholders = values.placeholders ? JSON.parse(values.placeholders) : undefined;

const files = locales.map((locale) => {
  const url = new URL(`${locale}/messages.json`, dir);
  const text = readFileSync(url, 'utf8');
  const json = JSON.parse(text);
  if (key in json) fail(`${locale}: la chiave ${key} esiste già`);
  if (!(values.after in json)) fail(`${locale}: la chiave ${values.after} non esiste`);
  // La voce vicina finisce alla prima riga "  }" (rientro di due spazi) dopo il suo nome.
  const start = text.indexOf(`\n  ${JSON.stringify(values.after)}: {`);
  const end = text.slice(start).search(/\n  \},?\n/) + start;
  const close = text.slice(end).match(/^\n  \},?\n/)[0];
  const entry = { message: values[locale], ...(placeholders ? { placeholders } : {}) };
  const body = JSON.stringify(entry, null, 2).replace(/\n/g, '\n  ');
  const block = `\n  },\n  ${JSON.stringify(key)}: ${body}${close.endsWith(',\n') ? ',\n' : '\n'}`;
  const next = text.slice(0, end) + block + text.slice(end + close.length);
  JSON.parse(next);
  return { url, next };
});
for (const { url, next } of files) writeFileSync(url, next);
console.log(`add-message: ${key} aggiunta dopo ${values.after} in ${locales.join(', ')}`);
