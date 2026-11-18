# PRD: autoGroup, AI tab grouping for Chrome

Label: `ready-for-agent`

## Problem Statement

People who work with many open tabs quickly lose track of where things are: work tabs, research, social media, shopping and documentation get mixed together on the same tab strip. Chrome lets you create tab groups, but doing it by hand is slow and tedious, so in practice almost nobody does it.

Microsoft Edge has an "Organize tabs" feature that proposes groups automatically. Chrome, however, has no equivalent that lets you choose which AI to use. Chrome's built-in grouping is tied to Google's model and does not allow you to:

- use a fast, inexpensive classifier such as Jev, or its local alternatives (Kev, Rizzo Flow);
- use your own OpenRouter account or a local model (Ollama, LM Studio);
- define your own categories with descriptions that guide the classification;
- control which tab data leaves your computer.

## Solution

A Chrome extension that, when you click its icon (or use a keyboard shortcut), analyzes the ungrouped tabs of the current window and proposes groups. The proposal appears in an editable preview in the popup: you can rename groups, change their color, move or remove tabs, and discard groups. Tabs are grouped only when the user presses "Apply", and "Undo" puts everything back the way it was.

Classification uses two distinct AI roles:

- **Classifier** (System One protocol: Jev cloud, or Kev or Rizzo Flow locally). It assigns each tab to a known category (the user's fixed list or an already open group) with a calibrated confidence.
- **Generator** (OpenAI-compatible protocol: OpenRouter, Ollama, LM Studio, or Gemini Nano built into Chrome). It invents names for new categories for the tabs that the Classifier cannot place.

The extension works even without any configuration. If there is no AI, it groups by domain; if Chrome has Gemini Nano, it uses it automatically. If a provider fails, it falls back to the next level and a notice explains what happened.

The user decides which data is sent: by default, the title and the cleaned URL; additionally, with an optional permission, the description of the pages. The user can also exclude entire domains.

## User Stories

### Main flow

1. As a user with many tabs open, I want to click the extension's icon to get a proposal of groups, so that I can get things in order without dragging tabs by hand.
2. As a user, I want to start the organization with a keyboard shortcut, so that I don't have to use the mouse.
3. As a user, I want to see a preview of the proposed groups before they are created, so that I stay in control of my tabs.
4. As a user, I want no tab to be moved or grouped until I press "Apply", so that I can trust the extension.
5. As a user, I want only the current window to be considered, so that the tabs in other windows stay where I put them.
6. As a user, I want pinned tabs to never be touched, so that my permanent tabs stay in place.
7. As a user, I want tabs that are already in a group to stay where they are, so that the organization I did by hand is respected.
8. As a user, I want browser internal pages and tabs still without a title to be ignored, so that the proposal contains only real pages.
9. As a user, I want ungrouped tabs to be able to end up in groups I have already created, so that my organization is extended instead of duplicated.
10. As a user, I want the computation to continue even if the popup is closed by mistake, and to find the proposal again when I reopen it, so that I don't have to start over.
11. As a user, I want to see that the computation is in progress and to be able to stop it, so that I'm not stuck if the AI is slow.

### Preview

12. As a user, I want to rename a proposed group, so that the name reflects how I think about those tabs.
13. As a user, I want to change the color of a proposed group, so that I can recognize it at a glance.
14. As a user, I want to remove a single tab from a proposed group, so that it stays ungrouped if it was classified incorrectly.
15. As a user, I want to move a tab to another group of the proposal through a menu, so that I can correct mistakes without redoing everything.
16. As a user, I want to discard a whole proposed group, so that its tabs stay ungrouped.
17. As a user, I want to see the provenance of each group (list, existing, new AI, domain), so that I understand why it was proposed.
18. As a user, I want to see which tabs make up each proposed group, so that I can evaluate the proposal before applying it.
19. As a user, I want to save a group invented by the AI to the list of categories, with an "Add to categories" button, so that next time it is recognized directly.

### Undo

20. As a user, I want to undo the last applied organization, so that I can go back if I don't like the result.
21. As a user, I want "Undo" to put every tab back into its original group and position, so that I get the tab strip back the way it was.
22. As a user, I want "Undo" to ignore tabs that were closed in the meantime and to leave alone those opened afterwards, so that I don't lose the work I did after the organization.
23. As a user, I want "Undo" to remain available until the next organization, so that I have time to evaluate the result.

### Group rules

24. As a user, I want no new groups to be created with just one tab, so that the tab strip doesn't fill up with useless groups.
25. As a user, I want to configure the minimum number of tabs needed to create a new group, so that the behavior fits the way I work.
26. As a user, I want a single tab to be able to join a group that already exists, so that my organization stays complete.
27. As a user, I want tabs left alone after classification to be reconsidered together with the other uncertain tabs, so that they can form a sensible new group.
28. As a user, I want grouping by domain to follow the same rules, so that the behavior is consistent.

### Operation without configuration and fallback

29. As a new user with no configuration, I want the extension to group tabs by domain right away, so that I can see it working as soon as it is installed.
30. As a user with a Chrome that supports Gemini Nano, I want it to be used automatically as the Generator, so that I get smart groups without API keys or costs.
31. As a user, I want to always receive a proposal even when a provider fails, so that the extension never leaves me empty-handed.
32. As a user, I want a clear notice in the preview when a provider is unreachable, with a link to the settings, so that I understand why the proposal is less precise.
33. As a user, I want an explicit message when my API key is invalid, so that I immediately know what to fix.
34. As a user who pays per use, I want the extension to retry at most once and only for temporary errors, so that I don't spend money on endless attempts.
35. As a user, I want malformed AI responses to be discarded instead of producing wrong groups, so that no tab ends up in a nonsensical place or disappears.
36. As a user, I want a maximum waiting time for each provider, so that a blocked server doesn't block the extension.

### Classifier

37. As a user with a TypeSafe key, I want to use Jev as the Classifier, so that I get fast, inexpensive classification with calibrated confidence.
38. As a user who prefers to work locally, I want to use Kev or Rizzo Flow on my Mac by changing only the URL, so that no data leaves the computer.
39. As a user, I want to choose a preset (Jev, Kev, Rizzo Flow) that fills in the URL and model, so that I don't have to look them up.
40. As a user, I want to set the confidence threshold, so that I can decide how sure the extension must be before assigning a tab.
41. As a user, I want tabs on which the Classifier is uncertain not to be forced into a group, so that I avoid wrong classifications.
42. As a user, I want to test the connection to the Classifier from the settings, so that I immediately know whether the configuration is correct.

### Generator

43. As a user with an OpenRouter key, I want to choose an inexpensive model as the Generator, so that I get new categories at minimal cost.
44. As a user with Ollama or LM Studio, I want to use them as the Generator, so that I can invent categories without cloud services.
45. As a user, I want invented names to have at most two words and to be in the browser's language, so that they fit well in Chrome's group labels.
46. As a user, I want new groups to receive a color not yet used in the window, so that I can tell them apart easily.
47. As a user without a Classifier, I want the Generator alone to choose among the known categories or invent new ones in a single call, so that the experience is similar to Edge's.
48. As a user, I want to test the connection to the Generator from the settings, so that I immediately know whether the configuration is correct.

### Categories

49. As a user, I want to start with a default list of categories (Work, Dev, AI, Social, News, Video, Shopping, Travel, Finance, Study), so that I get good results without configuring anything.
50. As a user, I want to add, edit, delete and reorder categories on a settings page, so that I can adapt them to my life.
51. As a user, I want to write a description for each category, so that the AI understands what belongs in it and classifies better.
52. As a user, I want to assign each category a fixed color, so that the same type of group always looks the same.
53. As a user, I want to restore the default categories, so that I can fix things if I made a mess.
54. As a user, I want a group created by hand with the same name as a category to use that category's description and color, so that my manual groups are classified well.
55. As a user with multiple computers, I want categories and preferences to sync across my Chrome instances, so that I don't have to set them up again.

### Privacy and permissions

56. As a privacy-conscious user, I want only the title and the URL without parameters or fragment to be sent to the AI by default, so that tokens and emails in URLs don't end up in an external service's logs.
57. As a user, I want a list of excluded domains whose tabs are never sent to the AI, so that I can protect banking, mail and health data.
58. As a user who wants more precision, I want to enable reading of page descriptions by granting a permission only when I choose to, so that I decide the trade-off between privacy and precision.
59. As a user who refuses that permission, I want the extension to keep working with title and URL, so that I am not penalized.
60. As a user, I want tabs suspended by Memory Saver to never be woken up to read their content, so that I don't find dozens of pages reloaded.
61. As a user, I want my API keys to stay only on this computer and not be synced, so that I limit where they are stored.
62. As a user who uses only local providers, I want the guarantee that no tab data leaves the computer.
63. As a user, I want the extension to ask for network permissions only for the providers I configure, so that no unnecessary access is granted.

### Language and maintenance

64. As an Italian or English user, I want the interface in my language, so that I can use it without effort.
65. As a maintainer, I want permissions and texts to be ready for the Chrome Web Store, so that I can publish in the future without rewriting the extension.
66. As a maintainer, I want to add a new provider compatible with one of the two protocols through a preset, without touching the pipeline, so that I can keep up with the evolution of models.
67. As a maintainer, I want to be able to add the TypeSafe API later with advanced features without changing the rest, so that the architecture holds up over time.

## Implementation Decisions

### General architecture

- Manifest V3 extension built with **WXT** and **TypeScript**, with **React** for the side panel and the settings, in Material Design 3 style.
- All the logic runs in the **service worker**. The popup is only an interface: it asks to organize, shows the proposal, sends the edits, "Apply" and "Undo", and communicates with the service worker through messages.
- The session state (computation in progress, current proposal, snapshot for undo) lives in `chrome.storage.session`, so it survives closing the popup but not closing Chrome.
- Interface texts in `chrome.i18n` from the start, in Italian and English.

### Modules

- **Organizer**: the main module, with a small interface: *propose* (for a window: returns a proposal), *apply* (a proposal, possibly edited), *undo* (the last operation) and *state* (computation in progress, proposal, undo available). Internally it coordinates all the other modules. It is the only point called by the popup.
- **Tab selection**: from the current window, extracts the candidate tabs, excluding pinned tabs, tabs already grouped, browser pages, tabs without a title and excluded domains. It also lists the groups already open in the window.
- **Data preparation**: for each tab, produces the information to send to the AI: short ID (`t1`, `t2`, …), title, cleaned URL (domain and path, without query or fragment) and the page description if available. Chrome IDs are never sent to the AI.
- **Description reader**: active only if the option is on and the optional `<all_urls>` permission has been granted. Reads the meta description (or `og:description` if it is missing or empty) through `chrome.scripting`, in parallel, with a timeout of about 500 ms per tab. Skips suspended tabs without waking them and skips unreadable pages; for those tabs only title and URL are used.
- **Category catalog**: reads the fixed list (name, description, color) and builds the options for classification: categories from the list plus the open groups. If an open group has the same name as a category (case-insensitive), it takes that category's description and color; otherwise the description is "Group created by the user: «name»".
- **Classifier adapter (System One)**: interface *classify(tabs, options) → for each tab: category and confidence*. Contract: `POST {base URL}/v1/systemone` with `Bearer` authentication (optional for local servers). The body contains `state`, `model` and `questions`, with `choice` questions whose `criteria` map the name and description of each option (maximum 255). The response contains `answers` with `choice`, `confidence` and `probabilities`. Presets: Jev (`https://api.typesafe.ai`, model `jev-latest`), Kev (`http://127.0.0.1:8009`), Rizzo Flow (`http://127.0.0.1:8017`).
- **Generator adapter**: interface *generate(tabs, known categories, mode) → list of groups {name, short IDs of the tabs}* and *describe(category name, example tabs) → description*, used by "Add to categories". Two modes:
  - *new only*: step 2 of the pipeline, invents groups for the tabs left over;
  - *complete*: used when there is no Classifier; chooses among the known categories or invents new ones.

  Two implementations with the same interface:
  - **OpenAI-compatible** (`/chat/completions` with structured output via a JSON schema where supported, otherwise JSON with validation). Presets: OpenRouter (`https://openrouter.ai/api/v1`), Ollama (`http://localhost:11434/v1`), LM Studio (`http://localhost:1234/v1`);
  - **Gemini Nano** through Chrome's Prompt API (`LanguageModel`), with a response constraint via a JSON schema.
- **Grouping by domain**: groups tabs by domain when no AI is available.
- **Pipeline**: chooses the level based on what is configured and available, according to the table below, then applies the group rules.

  | Classifier | Generator | Behavior |
  |---|---|---|
  | yes | yes | step 1 (Classifier), then step 2 (Generator, *new only* mode) on the tabs left over |
  | yes | no | only step 1; the tabs left over stay ungrouped |
  | no | yes | Generator in *complete* mode |
  | no | no | grouping by domain |

  Generator used: the one chosen by the user in the settings, that is an OpenAI-compatible server, Gemini Nano (the default, used only if `LanguageModel.availability()` reports it as available) or **None**. A server without permission or that is unreachable is not replaced by Nano: the pipeline drops a level with a notice.

  Before the table there is the **mode**, chosen by the user: *By site* skips the whole AI pipeline and groups by domain; *By topic, with AI* (default) follows the table.
- **Group rules** (inside the pipeline):
  - a new group requires at least N tabs (default 2, configurable);
  - a tab can join an existing group on its own;
  - in step 1, the tabs below the threshold (default 0.7) become "leftover", as do those assigned to a category from the list that would be left with fewer than N tabs;
  - after step 2, new groups with fewer than N tabs are dissolved.
- **Validator**: checks the Generator's response. Discards non-existent IDs, tabs assigned to multiple groups and empty names; truncates names beyond two words or rejects them. Discarded tabs stay ungrouped.
- **Color assigner**: categories from the list use their fixed color, existing groups keep their own, and new groups receive, in rotation, the colors not yet used in the window.
- **Applier**: first takes a snapshot of the state (for each tab involved: ID, group or none, position), then creates or extends the groups with `chrome.tabs.group` and sets their name and color with `chrome.tabGroups.update`.
- **Undo**: uses the snapshot to put every tab still open back into its original group (or outside any group) and in its position, and dissolves the groups created. It ignores closed tabs and new ones, and does not rename groups back.
- **Popup**: start, progress with "Stop", editable preview (rename, color, remove tab, move tab through a menu, discard group, provenance label, "Add to categories"), notices about fallbacks, "Apply", "Undo last organization".
- **Settings**: options page in a full tab, with the sections Categories, Classifier, Generator, Privacy and Behavior. Each provider has a "Test connection" button.

### Proposal (data shape)

A proposal is a list of groups plus a list of notices. Each group has: name, color, provenance (*list*, *existing*, *new AI*, *domain*), the reference to the Chrome group if it already exists, the assigned tabs and, for *new AI* groups, the possibility of being saved to the list. Each notice has: skipped level, provider involved, cause (unreachable, invalid key, rate limit, timeout, invalid response, request rejected, unavailable, missing network permission, model to download or downloading).

### Error handling

- If a provider fails, the pipeline drops one level in the table and adds a notice to the proposal.
- Timeout per single request: 5 s for the Classifier, 30 s for the Generator (with Gemini Nano, for each block of tabs).
- A single retry, after a short wait, only for 429, 529 and 5xx. For 401 and 403 no retry, notice "invalid key". For 422 no retry, notice "invalid request".
- "Stop" cancels the requests in progress and produces no proposal.

### Storage and permissions

- `chrome.storage.sync`: categories, threshold, minimum number of tabs, presets and provider URLs, description option, excluded domains.
- `chrome.storage.local`: API keys.
- `chrome.storage.session`: computation state, current proposal, snapshot for undo.
- Required permissions: `tabs`, `tabGroups`, `storage`, `scripting`, `sidePanel`.
- Optional permissions, requested at the moment with a user gesture: the hosts of the configured providers and `<all_urls>` for descriptions.
- Keyboard shortcut: `Alt+Shift+G` to open the side panel.
- The interface is Chrome's **side panel** instead of a popup: it stays open while the AI computes and while the user switches tabs.

## Testing Decisions

### What makes a good test

- Tests verify the behavior observable from outside: given certain tabs, groups and settings, which proposal comes out; after "Apply", which groups exist in the browser; after "Undo", how the state has returned.
- They do not verify how the internal modules call each other, nor the exact shape of the requests, except where the request *is* the contract (e.g. that the categories arrive as `criteria` to the Classifier).
- Each test describes a real scenario ("Kev off and Nano available → proposal from the Generator with a notice"), not an implementation detail.

### Test seams

- **A single seam: the Organizer's interface** (*propose*, *apply*, *undo*, *state*). It is the highest point possible below the popup and covers tab selection, data preparation, the category catalog, the pipeline, fallbacks, group rules, validation, colors, applying and undo.
- At the boundaries of the Organizer, three external dependencies are replaced:
  - **Browser APIs** (`tabs`, `tabGroups`, `storage`, `scripting`, `permissions`): WXT's fake browser, completed with a small fake for the APIs it does not cover (e.g. `tabGroups`).
  - **Network**: `fetch` replaced with recorded responses in the two formats (System One and OpenAI-compatible), including 401, 429, 529 errors, timeouts and malformed JSON.
  - **Gemini Nano**: a stub of the global `LanguageModel` object with the four availability states.
- The popup and the settings have no automated tests in the first milestones: they are checked by hand by loading the unpacked extension in Chrome.

### Scenarios to cover

- Tab selection: pinned, already grouped, browser pages, untitled and excluded-domain tabs are excluded; only the current window is considered.
- Privacy: query and fragment never appear in the data sent; tabs from excluded domains never appear in the requests; with the permission denied no description is read; suspended tabs are not read.
- The four rows of the fallback table, plus the level drop for each type of error, with the correct notice.
- Confidence threshold: tabs below the threshold go to the Generator.
- Group rules: minimum of N tabs, single tab in an existing group, lone tabs passed to step 2, new groups that are too small dissolved.
- Name matching between open groups and categories, case-insensitive.
- Validation: invented IDs, duplicates, empty or overly long names.
- Colors: fixed for categories, preserved for existing groups, rotated among free ones for new groups.
- Apply: groups created or extended with the correct name and color, edited proposal respected.
- Undo: restoration of groups and positions, closed tabs ignored, new tabs untouched.
- Retry: only one, only for 429, 529 and 5xx.

### Prior art

The project starts from scratch, so there are no existing tests to use as a model. The first test of the Organizer, written in milestone 1 for grouping by domain, serves as the model for all the following ones.

## Out of Scope

- Automatic grouping when new tabs open.
- A "Regroup everything" button, which would bring already grouped tabs back into play.
- Grouping across multiple windows or moving tabs between windows.
- Drag & drop in the preview.
- Use of `typesafe/jev-router` on OpenRouter as the Classifier.
- Adapters for protocols other than System One and OpenAI-compatible.
- Publishing on the Chrome Web Store: privacy policy, store page and onboarding. Listed as TODOs in the README.
- Automated tests of the popup and settings.

## Further Notes

- **Development order (milestones):**
  1. basic structure, preview, Apply and Undo, grouping by domain;
  2. settings and categories;
  3. Generator (OpenAI-compatible and Gemini Nano);
  4. Classifier (System One) and the complete pipeline;
  5. page descriptions;
  6. translations, shortcut and polish.

  Each milestone produces a working extension.
- **`jev-router` is not Jev.** On OpenRouter the only TypeSafe model is `typesafe/jev-router`, a router to LLMs chosen case by case, without calibrated confidence and with variable pricing. The real Jev is available only through the direct TypeSafe API, which requires early access, or through Kev and Rizzo Flow, which replicate its protocol.
- **Local models on Mac:**
  - Kev: use `kev-0.8b` (~4 GB), because the default 4B requires ~17 GB.
  - Rizzo Flow: 1.7B (~1.8 GB) or 4B (~4.4 GB).
  - Gemini Nano: requires a GPU with more than 4 GB of VRAM or 16 GB of RAM, ~22 GB of free disk space, and an initial download of the model.
- **To verify in milestone 3:** if Ollama rejects requests with a `chrome-extension://` origin, document the `OLLAMA_ORIGINS` setting.
- **To decide in milestone 3:** the default OpenRouter model for the Generator (inexpensive, with structured output support).
- **To decide in milestone 4, by measuring:** for the Classifier, one request per tab (with a limit on parallel requests) or a single request with one question per tab.
- **Open question:** which providers does the user already have (OpenRouter key, TypeSafe key, Kev, Rizzo, Ollama)? It does not change the order of the milestones, but it is needed for the manual tests of milestones 3 and 4.
- No issue tracker is configured: this PRD lives as a file in the repository.
