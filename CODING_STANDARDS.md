# Coding standards (review)

Read during review, against the diff. Mechanical rules live in the checks (`npm run check`, `tests/locales.test.ts`, the pre-commit hook); what follows needs judgement. Each rule names what to look for in the diff.

## Docs follow behaviour

A change the user can see or feel (what a button does, when something is computed, what is grouped, a new control) updates every place that describes it, in the same change:

- `README.md`: "How to use it" and "What it doesn't do (yet)".
- `docs/store/listing.md`: the same sentence in **every** language block (it, en, es, fr, de).
- `docs/architecture.md`: every section that states the old behaviour. One behaviour is often described in several sections (Organizer table, signature, state, side panel, keyboard shortcut), so grep the old wording, not just the obvious section.
- `docs/test.md`: the scenarios of the test file the change touches.

Flag a diff that changes behaviour and leaves any of these describing the old one.

## Organizer surface

A new Organizer method comes with: a line in the Organizer table of `docs/architecture.md`, an entry in `METHODS` (`src/shared/organizer-remote.ts`; the compiler forces it), and tests through the Organizer interface on the fakes. A method that touches the strip goes through `exclusive` (the operation queue) unless it must run while a computation holds it (as `abort` does), and says why.

## Panel scripts select stable hooks

`scripts/smoke.mjs` and `scripts/store-assets.mjs` find controls by a class that names the control (`button.recompute`, `.close-tab`, `.group.existing`), not by a styling class (`secondary`, `small`) that changes with the look. A diff that restyles a control the scripts click checks their selectors.

## Real Chrome for new tab-strip APIs

Code that starts using a `chrome.tabs` / `chrome.tabGroups` behaviour the fake strip did not model is backed by the fake's new behaviour **and** a note in the PR (or work log) that the same scenario was confirmed in real Chrome (`docs/test.md`, "Checking a panel change by hand").
