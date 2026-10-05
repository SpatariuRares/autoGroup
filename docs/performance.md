# How we made autoGroup faster

October 2026. The changes are in commit `0ae8bec` ("Prestazioni: anteprima per sito, cache, Generatore più leggero e Gemini Nano pronto prima"). Technical details in [architecture.md](architecture.md).

## In short

The time was not spent in the extension's code but in the calls to the AI models. So we worked on three fronts:
- **don't make the user wait**: a by-site proposal right away, while the AI works;
- **don't redo work already done**: per-tab cache of the Classifier's results and of the descriptions;
- **don't make the models work more than necessary**: a cap on the Generator's responses, lighter requests, Gemini Nano ready sooner.

The biggest result is measured on a real server (local Rizzo Flow, 30 tabs): after a tab is opened the recomputation goes from **14.3 s to 0.48 s**, and "Recompute" from **14.3 s to 3 ms**.

## The starting point

Before changing anything we looked at where the time went, with the code and with the measurements taken on the real providers.

| Phase | Cost | Notes |
|---|---|---|
| Reading the page descriptions | up to 0.5 s | In parallel, but it blocks everything that comes after |
| System One Classifier (local Rizzo Flow) | ~0.4 s per tab, **~12–14 s with 30 tabs** | The server answers one request at a time |
| Local Generator with reasoning (Unsloth Studio) | **11 s with 10 tabs**; with 30 tabs over the 30 s limit | After the timeout the user received the by-site proposal |
| Full pipeline, two local models, 10 tabs | **28.5 s** | The two models share the same GPU |
| Extension code (state, messages, interface) | milliseconds | Not the problem |

Two flaws made things worse:

1. **Every recomputation started from scratch.** Opening a tab was enough to change the proposal's signature: all 30 tabs went back to the Classifier, another 12 s for a single tab.
2. **The user stared at a progress bar.** If the Generator timed out, after 30 s the by-site grouping arrived, which could have been computed right away in a few milliseconds.

## First of all: measure

`src/organizer/stopwatch.ts` measures every computation by phase: reading the browser (`inputs`), preview, descriptions, Classifier, Generator, by-site fallback and total. The timings end up:

- in the service worker log: `autoGroup: tempi del calcolo (ms) {…}`;
- in `proposal.timings`, inside `chrome.storage.session`, so the smoke test and the measurement scripts read them without separate tools.

This way every later change can be verified with numbers, and a future regression shows up immediately.

## 1. A proposal right away, while the AI works

**Problem:** 11–30 s of waiting with nothing to look at.

**Change:** in AI mode, as soon as the inputs are read, the Organizer computes the by-site proposal (a few milliseconds) and puts it in the `computing` state as `preview`. The panel shows it read-only ("Meanwhile, the by-site proposal: AI is computing…"). When the AI proposal arrives it replaces it.

The new **"Use this"** button stops the AI and makes the by-site proposal the current one, editable and applicable. "Stop" stays as it was, as the PRD requires: no proposal.

**Effect:** the first useful proposal is on screen as soon as the inputs are read instead of after 11–30 s, and a Generator timeout no longer wastes time.

**Choices:**
- The preview cannot be edited. Otherwise, when the AI proposal arrived, we would have to either lose the edits or ignore the AI. Whoever wants to work on it presses "Use this".
- The preview appears only if the AI will actually be queried. In by-site mode, or without providers, the proposal is already immediate.

## 2. Don't redo work already done: the caches

**Problem:** every change, even a minimal one, reclassified all the tabs and reread all the pages.

**Change:** two caches in `chrome.storage.session`, which is cleared when Chrome closes, so titles and URLs do not stay on disk.

- **Classifier cache** (`classification-cache.ts`): one response per tab. The key is the signature of server, model, options (names and descriptions of the categories), title, cleaned URL and description of the tab. Only tabs never seen with those same options are sent to the server.
  - If you change a category or the model, the tabs are reclassified.
  - The threshold stays out of the key, because it is applied afterwards: changing it costs no requests.
  - Unreadable responses are not remembered, so the next computation retries.
  - The Classifier always answers the same way, so the cache also applies to "Recompute".
- **Description cache**: per URL, including "page without a description". Only new pages and those that did not answer in time the previous time are reread. A suspended tab with an already-read URL finds its description again without being woken up.

**Effect, measured with local Rizzo Flow and 30 tabs:**

| Case | Before | After |
|---|---|---|
| First computation (empty cache) | 14.3 s | 14.3 s |
| After a tab is opened | ~14 s | **0.48 s** |
| "Recompute" | ~14 s | **3 ms** |
| Threshold change | ~14 s | **3 ms** |

## 3. The Generator works less

**Problems:**
- a reasoning model could generate for minutes: with 30 tabs over 13 minutes in a direct test on the server;
- after the extension's timeout the local server kept working and kept the GPU busy for the next computation.

**Changes** (`openai-generator.ts`, `prompt.ts`):
- **Cap of 4096 tokens** per response, reasoning included. The useful response is small (names and short tab IDs); the cap is there to stop a runaway model on its own. A truncated response is not complete JSON and becomes "invalid response": the pipeline moves to the next level.
- **Minimal retry after a 400 error**: without JSON schema and without cap, so servers that do not support the schema and models that reject `max_tokens` also work.
- **Lighter requests in "new only" mode**: categories are sent by name only, without descriptions. They are only needed to avoid repeating existing names, and the descriptions were extra tokens to process. With Gemini Nano this also means more tabs per chunk.

**Choice:** reasoning cannot be turned off from the settings. Without reasoning the test model made one group per tab, which the validator discards, and every server turns it off with a different parameter. The token cap already limits the worst case.

## 4. Gemini Nano ready sooner

**Problem:** for every proposal Nano created a new session (loading the model and reading the system prompt), and only after the descriptions had been read.

**Changes** (`nano-generator.ts`):
- **Reused base session**: one per mode and language, kept in memory as long as the service worker stays alive. It never receives a prompt, it is only cloned for each chunk of tabs, so it stays clean. A failed or broken session leaves the cache and is recreated.
- **Preparation in advance**: the pipeline calls `generator.prepare()` before reading the pages, so Nano creates the session while the descriptions are being read and the Classifier is working.
- **Measurements in parallel**: to split the tabs into chunks, all the context measurements start together instead of one at a time.

**Effect:** session creation is no longer on the critical path. We have not measured it on a real Gemini Nano.

## How we know it works

- **Tests:** 32 new tests (13 for preview and timings, 19 for cache, Generator and Nano), with mutation tests. On 16 points of the new code we put back the old behavior, and each one makes at least one test fail. Three mutations that survived the first round led to two more tests and to removing a redundant check.
- **Smoke test in Chrome:** preview and "Use this" tested in the real panel; a "Ricalcola con la cache" step that fails if the Classifier receives even a single request.
- **Real measurement:** Classifier cache on local Rizzo Flow with 30 tabs (table above).

## What we did not do, and why

| Idea | Why not (for now) |
|---|---|
| Reduce the JavaScript bundle | Under 400 KB in total, loaded from the local disk: not noticeable. |
| Optimize React rendering | The view works on a few dozen elements. |
| Classifier in `batch` mode (one request for all the tabs) | Measured: only 14% faster, and a ~10 s request exceeds the 5 s timeout. |
| Turn off the Generator's reasoning | Worse quality in the test, different parameters for each server. |
| Remember domain → category (e.g. github.com → Dev) | It would remove calls even on the first computation, but it is a new feature, still to be decided. |

## Next steps

- Measure the real Generator (Unsloth Studio) with per-phase timings, and decide the maximum time for local providers.
- Measure Gemini Nano on a computer that supports it.
- Evaluate the domain → category memory.
