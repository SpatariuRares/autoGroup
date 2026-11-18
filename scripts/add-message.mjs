// Adds, changes or removes a UI text in all the locales of public/_locales, without
// reformatting the files (the rest of the JSON stays as it is, byte for byte).
// Usage: node scripts/add-message.mjs <key> --after <nearbyKey> --it "…" --en "…" --es "…" --fr "…" --de "…"
//      [--placeholders '{"count":{"content":"$1"}}']
//      node scripts/add-message.mjs <key> --set --it "…" --en "…" --es "…" --fr "…" --de "…" [--placeholders '…']
//      node scripts/add-message.mjs <key> --remove
// With --set the other fields of the entry stay (placeholders too, unless --placeholders is given).
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
if (!key || !/^[A-Za-z0-9_]+$/.test(key)) fail('the key must be made only of letters, digits and _');
const modes = [values.after !== undefined, values.set, values.remove].filter(Boolean).length;
if (modes !== 1) fail('use exactly one of --after <nearby key> (adds), --set (changes) or --remove (removes)');
if (!values.remove) {
  const missing = locales.filter((l) => values[l] === undefined);
  if (missing.length) fail(`missing text for: ${missing.map((l) => `--${l}`).join(' ')}`);
}
const placeholders = values.placeholders ? JSON.parse(values.placeholders) : undefined;

/** The `name` entry in the text: from "\n  "name": {" up to its "  }" line (two-space indent), comma included. */
function entryOf(text, name) {
  const start = text.indexOf(`\n  ${JSON.stringify(name)}: {`);
  const end = text.slice(start).search(/\n  \},?\n/) + start;
  const close = text.slice(end).match(/^\n  \},?\n/)[0];
  return { start, end: end + close.length, comma: close.endsWith(',\n') };
}

/** The entry written like the others: two-space indent, comma unless it is the last one (without the final newline). */
const entryText = (name, entry, comma) => `\n  ${JSON.stringify(name)}: ${JSON.stringify(entry, null, 2).replace(/\n/g, '\n  ')}${comma ? ',' : ''}`;

/** Replaces the text between `start` and `end` of an entry, keeping the newline it ends with. */
const replaceEntry = (text, { start, end }, replacement) => text.slice(0, start) + replacement + text.slice(end - 1);

const files = locales.map((locale) => {
  const url = new URL(`${locale}/messages.json`, dir);
  const text = readFileSync(url, 'utf8');
  const json = JSON.parse(text);
  let next;
  if (values.after !== undefined) {
    if (key in json) fail(`${locale}: the key ${key} already exists`);
    if (!(values.after in json)) fail(`${locale}: the key ${values.after} does not exist`);
    const neighbour = entryOf(text, values.after);
    const entry = { message: values[locale], ...(placeholders ? { placeholders } : {}) };
    // The neighbour gets the comma; the new entry inherits its own (none if the neighbour was the last one).
    const neighbourText = text.slice(neighbour.start, neighbour.end).replace(/\n  \},?\n$/, '\n  },');
    next = replaceEntry(text, neighbour, neighbourText + entryText(key, entry, neighbour.comma));
  } else {
    if (!(key in json)) fail(`${locale}: the key ${key} does not exist`);
    const current = entryOf(text, key);
    if (values.set) {
      // The other fields of the entry (e.g. placeholders, description) stay; --placeholders replaces them.
      const entry = { ...json[key], message: values[locale], ...(placeholders ? { placeholders } : {}) };
      next = replaceEntry(text, current, entryText(key, entry, current.comma));
    } else {
      next = replaceEntry(text, current, '');
      // If the last entry was removed, the previous one no longer needs its comma.
      if (!current.comma) next = next.replace(/\n  \},(\n\}\s*)$/, '\n  }$1');
    }
  }
  JSON.parse(next);
  return { url, next };
});
for (const { url, next } of files) writeFileSync(url, next);
const done = values.after !== undefined ? `added after ${values.after}` : values.set ? 'changed' : 'removed';
console.log(`add-message: ${key} ${done} in ${locales.join(', ')}`);
