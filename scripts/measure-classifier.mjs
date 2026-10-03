// Misura le due strategie di richiesta del Classificatore System One su un server reale.
//
//   SYSTEMONE_URL=http://127.0.0.1:8009 node scripts/measure-classifier.mjs
//   SYSTEMONE_URL=https://api.typesafe.ai SYSTEMONE_KEY=… SYSTEMONE_MODEL=jev-latest node scripts/measure-classifier.mjs
//
// Variabili facoltative: TABS (default 30), RUNS (default 3), CONCURRENCY (default 4).
// Stampa per ogni strategia il tempo totale (mediana), i token di input dichiarati dal server e
// quante tab ricevono la stessa scelta nelle due strategie. Le richieste sono costruite come in
// src/ai/systemone-classifier.ts.

const url = process.env.SYSTEMONE_URL;
if (!url) {
  console.error('Imposta SYSTEMONE_URL (es. http://127.0.0.1:8009).');
  process.exit(1);
}
const key = process.env.SYSTEMONE_KEY;
const model = process.env.SYSTEMONE_MODEL;
const TABS = Number(process.env.TABS ?? 30);
const RUNS = Number(process.env.RUNS ?? 3);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);

const criteria = {
  Work: 'Work tools and pages: company email, calendar, shared documents, project management.',
  Dev: 'Programming and developer tools: code repositories, technical documentation, issues, CI.',
  AI: 'Artificial intelligence assistants and services.',
  Social: 'Social networks and communities.',
  News: 'Newspapers, news sites and newsletters.',
  Video: 'Videos, streaming, music and podcasts.',
  Shopping: 'Online stores, product pages and carts.',
  Travel: 'Flights, hotels, maps and travel bookings.',
  Finance: 'Banking, payments, investments and taxes.',
  Study: 'Courses, papers, encyclopedias and study material.',
  none_of_the_above: 'The tab fits none of the other options.',
};
const SAMPLES = [
  ['Inbox (3) - Gmail', 'mail.google.com/mail/u/0'],
  ['Pull request #42 · acme/web', 'github.com/acme/web/pull/42'],
  ['ChatGPT', 'chatgpt.com'],
  ['Home / X', 'x.com/home'],
  ['BBC News - Home', 'bbc.com/news'],
  ['Lo-fi beats - YouTube', 'youtube.com/watch'],
  ['Amazon.com: headphones', 'amazon.com/s'],
  ['Flights to Rome - Skyscanner', 'skyscanner.net/transport/flights'],
  ['Online banking', 'bank.example.com/accounts'],
  ['Attention Is All You Need - arXiv', 'arxiv.org/abs/1706.03762'],
];
const tabs = Array.from({ length: TABS }, (_, i) => {
  const [title, u] = SAMPLES[i % SAMPLES.length];
  return { id: `t${i + 1}`, title, url: u };
});
const INSTRUCTIONS = 'Which group should this browser tab go into';

async function post(body) {
  const response = await fetch(`${url}/v1/systemone`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ ...(model ? { model } : {}), ...body }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

async function perTab() {
  const choices = {};
  let tokens = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, tabs.length) }, async () => {
      while (next < tabs.length) {
        const tab = tabs[next++];
        const json = await post({ state: { title: tab.title, url: tab.url }, questions: { group: { type: 'choice', instructions: INSTRUCTIONS, criteria } } });
        choices[tab.id] = json.answers.group.choice;
        tokens += json.usage?.input_tokens ?? 0;
      }
    }),
  );
  return { choices, tokens };
}

async function batch() {
  const questions = Object.fromEntries(tabs.map((t) => [t.id, { type: 'choice', instructions: `${INSTRUCTIONS}: the tab with id "${t.id}"`, criteria }]));
  const json = await post({ state: tabs, questions });
  return { choices: Object.fromEntries(tabs.map((t) => [t.id, json.answers[t.id]?.choice])), tokens: json.usage?.input_tokens ?? 0 };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const results = {};
for (const [name, run] of [['per-tab', perTab], ['batch', batch]]) {
  const times = [];
  let last;
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    last = await run();
    times.push(performance.now() - start);
  }
  results[name] = last;
  console.log(`${name.padEnd(8)} mediana ${Math.round(median(times))} ms su ${RUNS} prove, ${last.tokens} token di input`);
}
const same = tabs.filter((t) => results['per-tab'].choices[t.id] === results.batch.choices[t.id]).length;
console.log(`Stessa scelta nelle due strategie: ${same}/${tabs.length}`);
const expected = ['Work', 'Dev', 'AI', 'Social', 'News', 'Video', 'Shopping', 'Travel', 'Finance', 'Study'];
for (const name of ['per-tab', 'batch']) {
  const right = tabs.filter((t, i) => results[name].choices[t.id] === expected[i % expected.length]).length;
  console.log(`${name.padEnd(8)} scelte attese: ${right}/${tabs.length}`);
}
