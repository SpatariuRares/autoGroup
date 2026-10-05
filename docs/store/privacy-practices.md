# Review: single purpose, permissions and privacy practices

Answers to paste into the **"Privacy practices"** tab of the developer dashboard. The dashboard asks for them in English. The answers on data collection are a proposal: the final choice is up to the publisher.

## Single purpose

> autoGroup organizes the tabs of the current window into Chrome tab groups. It suggests groups by site or by topic (optionally with an AI provider chosen by the user), shows an editable preview, and applies the groups only when the user confirms, with an undo.

## Permission justification

| Permission | Justification (to paste) |
|---|---|
| `tabs` | Reads the title and URL of the tabs in the current window to build the grouping proposal, and moves or closes tabs when the user asks (Apply, Undo, close a tab from the panel). |
| `tabGroups` | Creates the proposed tab groups with their name and color, adds tabs to groups the user already has, and reads open groups so they can be extended instead of duplicated. |
| `storage` | Saves the user's settings (categories, excluded domains, provider address and model), the provider API keys (local only, never synced) and the current proposal with its undo snapshot (session storage, cleared when Chrome closes). |
| `scripting` | Only when the user turns on the optional "Read page descriptions" setting and grants access to sites: reads the meta description of the tabs being organized, to classify them more accurately. It never reads page content and never runs on excluded domains. |
| `sidePanel` | Shows the proposal in Chrome's side panel, which stays open while the user switches tabs and while a local AI model computes the proposal (it can take tens of seconds). |
| Optional host permissions (`http://*/*`, `https://*/*`, `<all_urls>`) | Requested at runtime, never at install. When the user saves an AI provider, only that provider's host is requested, so the extension can send it the tab titles and cleaned URLs to classify. `<all_urls>` is requested only when the user turns on "Read page descriptions", and removed when it is turned off. |

## Remote code

> No. All JavaScript is included in the package. The extension does not load or evaluate remote code; it only sends HTTP requests with tab data to the AI provider configured by the user and reads JSON responses.

## Data usage

### Data types to declare

| Type in the dashboard | Proposal | Why |
|---|---|---|
| Web history | **Yes** | Titles and URLs (host and path) of open tabs are sent to the AI provider chosen by the user, in AI mode with a provider on a server. |
| Website content | **Yes** | Page titles and, if the user turns on the option, the meta description are sent to the same provider. |
| Authentication information | To be evaluated | The API keys entered by the user stay in `storage.local` and are sent only to the provider they belong to. The developer does not receive them. Declaring them is the most cautious choice. |
| Personally identifiable information, Health, Financial and payment, Personal communications, Location, User activity | No | The extension does not collect them. Tab titles may contain them by chance (e.g. the subject of an email), which is why the user can exclude domains and use Gemini Nano or a local provider. |

Note: the developer receives none of this data. It only goes from the browser to the provider the user configures (which may be on the user's own computer) to provide the grouping feature. With "By site" or with Gemini Nano nothing leaves the computer.

### Certifications, all to be checked

- I do not sell or transfer user data to third parties, outside of the approved use cases. *(The transfer to the AI provider is chosen by the user and is necessary for the feature.)*
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

### Privacy policy URL

The public URL of the page published from [privacy.md](privacy.md). It must be published before submitting for review (see [README](README.md)).
