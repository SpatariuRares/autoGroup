---
name: autoGroup
description: Material 3 tab-grouping companion that lives in Chrome's side panel.
colors:
  primary: "#435e91"
  on-primary: "#ffffff"
  primary-container: "#d8e2ff"
  on-primary-container: "#2a4678"
  secondary: "#565e71"
  secondary-container: "#dbe2f9"
  on-secondary-container: "#3f4759"
  tertiary: "#715574"
  tertiary-container: "#fbd7fc"
  on-tertiary-container: "#583e5b"
  error: "#ba1a1a"
  error-container: "#ffdad6"
  on-error-container: "#93000a"
  surface: "#f9f9ff"
  on-surface: "#1a1b20"
  on-surface-variant: "#44474f"
  surface-container-low: "#f3f3fa"
  surface-container: "#ededf4"
  surface-container-high: "#e8e7ee"
  surface-container-highest: "#e2e2e9"
  inverse-surface: "#2f3036"
  inverse-on-surface: "#f0f0f7"
  inverse-primary: "#adc7ff"
  outline: "#74777f"
  outline-variant: "#c4c6d0"
  chrome-grey: "#5f6368"
  chrome-blue: "#1a73e8"
  chrome-red: "#d93025"
  chrome-yellow: "#f9ab00"
  chrome-green: "#188038"
  chrome-pink: "#d01884"
  chrome-purple: "#a142f4"
  chrome-cyan: "#007b83"
  chrome-orange: "#fa903e"
typography:
  headline-medium:
    fontFamily: "'Roboto Flex', Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "28px"
    fontWeight: 400
    lineHeight: "36px"
  title-large:
    fontFamily: "'Roboto Flex', Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: "28px"
  title-medium:
    fontFamily: "'Roboto Flex', Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: "24px"
  title-small:
    fontFamily: "'Roboto Flex', Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  body-large:
    fontFamily: "'Roboto Flex', Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  body-medium:
    fontFamily: "'Roboto Flex', Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  body-small:
    fontFamily: "'Roboto Flex', Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  label-large:
    fontFamily: "'Roboto Flex', Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  label-medium:
    fontFamily: "'Roboto Flex', Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
  label-small:
    fontFamily: "'Roboto Flex', Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: "16px"
rounded:
  extra-small: "4px"
  small: "8px"
  medium: "12px"
  large: "16px"
  extra-large: "28px"
  full: "9999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-filled:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-large}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "40px"
  button-tonal:
    backgroundColor: "{colors.secondary-container}"
    textColor: "{colors.on-secondary-container}"
    typography: "{typography.label-large}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "40px"
  button-outlined:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.label-large}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "40px"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.label-large}"
    rounded: "{rounded.full}"
    padding: "0 12px"
    height: "40px"
  button-small:
    typography: "{typography.label-medium}"
    rounded: "{rounded.full}"
    padding: "0 12px"
    height: "32px"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.full}"
    size: "40px"
  text-field:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-large}"
    rounded: "{rounded.extra-small}"
    padding: "8px 14px"
    height: "48px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.label-large}"
    rounded: "{rounded.small}"
    padding: "0 4px 0 12px"
    height: "32px"
  badge:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.label-medium}"
    rounded: "{rounded.small}"
    padding: "0 8px"
    height: "24px"
  badge-ai:
    backgroundColor: "{colors.tertiary-container}"
    textColor: "{colors.on-tertiary-container}"
  badge-list:
    backgroundColor: "{colors.secondary-container}"
    textColor: "{colors.on-secondary-container}"
  group-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.medium}"
    padding: "8px 4px 8px 12px"
  tab-row:
    rounded: "{rounded.small}"
    padding: "0 0 0 26px"
    height: "36px"
  tab-row-current:
    backgroundColor: "{colors.secondary-container}"
    textColor: "{colors.on-secondary-container}"
  segmented-selected:
    backgroundColor: "{colors.secondary-container}"
    textColor: "{colors.on-secondary-container}"
    rounded: "{rounded.full}"
    height: "40px"
  banner:
    backgroundColor: "{colors.surface-container-highest}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.medium}"
    padding: "12px 16px"
  banner-error:
    backgroundColor: "{colors.error-container}"
    textColor: "{colors.on-error-container}"
  snackbar:
    backgroundColor: "{colors.inverse-surface}"
    textColor: "{colors.inverse-on-surface}"
    rounded: "{rounded.extra-small}"
    padding: "6px 8px 6px 16px"
    height: "48px"
  settings-card:
    backgroundColor: "{colors.surface-container-low}"
    rounded: "{rounded.large}"
    padding: "24px"
  nav-item-active:
    backgroundColor: "{colors.secondary-container}"
    textColor: "{colors.on-secondary-container}"
    typography: "{typography.label-large}"
    rounded: "{rounded.full}"
    height: "48px"
---

# Design System: autoGroup

## Overview

**Creative North Star: "Native Chrome Companion"**

autoGroup should read as a piece of Chrome itself: Google's Material 3, seeded from Chrome's own blue (`#1a73e8`) through a Tonal Spot scheme, sitting in the side panel next to the page. Nothing about it asks to be noticed as "a third-party extension". The only saturated colour on screen comes from Chrome's nine fixed tab-group colours, because those *are* the content: they show the user the groups that will appear in their tab strip.

The incumbent implementation is baseline Material 3: generated colour roles, the standard type scale, the standard shape scale and state layers made with `color-mix`. The intended character is bolder, in line with Google's latest Material 3 (Expressive) surfaces: confident filled actions, generous full-round shapes, clear selected states. That boldness must come from Material 3's own vocabulary (role colours, shape tokens, emphasized motion, the type scale), never from invented styles.

Density is tuned for a narrow panel (roughly 320–400px): 36px tab rows, 40px buttons, secondary actions that appear on hover or focus, one fixed action bar at the bottom. The options page and onboarding are roomier (760px column, 24px card padding) but use the same tokens and components.

**Key Characteristics:**

- Material 3 role colours only, generated by `npm run theme`; light and dark follow `prefers-color-scheme`.
- Chrome's nine group colours are the only off-scheme hues, and only for group swatches.
- Flat tonal surfaces; depth by surface-container steps, not shadows.
- Full-round buttons and segmented controls; medium-round cards.
- Compact rows, hover-revealed actions, visible keyboard focus everywhere.
- Material Symbols as inline SVG via `src/ui/Icon.tsx`.

## Colors

A cool, low-chroma blue-grey Tonal Spot scheme that recedes behind Chrome's vivid group colours.

### Primary


- **Chrome-Seeded Blue** (`primary`): filled buttons (Organize, Apply), focus-carrying selection like the switch track, links, drop indicators while dragging, the border of an existing group that the proposal extends, and the count of tabs added to it.
- **Pale Blue Container** (`primary-container`): tab chips that mark a state (e.g. "new" in a group).

### Secondary


- **Slate** (`secondary`): the global focus outline (3px, 2px offset).
- **Mist Container** (`secondary-container`): every "selected" state: the current tab, the chosen mode in the segmented control, the active navigation item, the stale-proposal banner, tonal buttons, list-provenance badges, the progress track.

### Tertiary


- **Dusk Mauve** (`tertiary`, `tertiary-container`): reserved for AI provenance (the "AI" badge) and warning icons. It marks *where a group came from*, not a decoration for AI.

### Neutral


- **Cool Paper** (`surface`): body of options/onboarding, group cards and lists inside the panel.
- **Panel Wash** (`surface-container-low`): side-panel background, settings cards.
- **Bar Grey** (`surface-container`): the bottom action bar.
- **Raised Tint** (`surface-container-high` / `-highest`): neutral badges, info banners, count pills, favicon placeholders.
- **Ink** (`on-surface`) and **Soft Ink** (`on-surface-variant`): primary and secondary text, icon buttons.
- **Rule** (`outline`, `outline-variant`): field strokes and outlined buttons; card borders and dividers.
- **Inverse** (`inverse-surface`, `inverse-on-surface`, `inverse-primary`): snackbar and tooltips.

### Chrome Group Colours

`chrome-grey` … `chrome-orange` are Chrome's fixed `tabGroups` colours. They appear only as 18px round swatches (with a 1px `outline` ring, because yellow and orange alone fall below 3:1 on light surfaces). They are not theme colours and never fill text, buttons or surfaces.

### Named Rules

**The Generated Palette Rule.** Every UI colour is a `--md-sys-color-*` role from `src/ui/md3-tokens.css`, which is generated (`npm run theme`) and never hand-edited. A new colour need is met by an existing role, or by a new seed for the whole scheme.

**The Group Colours Are Content Rule.** The nine Chrome colours represent real tab groups. Using one as an accent anywhere else breaks the mapping between panel and tab strip.

**The No AI Glow Rule.** AI is signalled by a tertiary badge and words, never by gradients, purple glows, sparkles or shimmer.

## Typography

**Body Font:** Roboto Flex (with Roboto, system-ui, -apple-system, Segoe UI)

**Character:** Google's neutral grotesque, used through the Material 3 type scale. No web font is bundled, so on most desktops it renders in the platform UI font, which keeps the panel feeling native to the OS and to Chrome.

### Hierarchy


- **Headline** (400, 28/36px; 24/32px small): onboarding step titles and options page titles.
- **Title Large** (400, 22/28px): the panel's top app bar title.
- **Title Medium** (500, 16/24px): group names (editable and static), settings brand.
- **Title Small** (500, 14/20px): panel section headings ("Ungrouped", "Open groups").
- **Body Large** (400, 16/24px): text fields, empty states, onboarding lead (max 65ch).
- **Body Medium** (400, 14/20px): default text, tab titles.
- **Body Small** (400, 12/16px): hints, hostnames, mode summary, tooltips.
- **Label Large / Medium / Small** (500; 14, 12, 11px): buttons, badges, counts, chips.

### Named Rules

**The Scale Only Rule.** Text is set with a `--md-sys-typescale-*` shorthand. No ad-hoc font sizes or weights; emphasis inside a line uses `<strong>` at 600 only for the added-tab count.

**The Ellipsis Rule.** Tab titles, hostnames and static group names truncate to one line with an ellipsis; the row never wraps. Translations must fit labels and buttons in German and French.

## Layout

- **Side panel** (min 280px, designed for 320–400px): vertical flex column. Top app bar (min 56px, 8/16px padding) → mode picker (segmented, 16px side padding) → status row → scrolling content (12px side padding) → optional snackbar → fixed bottom action bar (12/16px padding, `surface-container`).
- **Panel content** is a stack of sections (16px apart), each a heading plus a list of group cards (8px gap). Tab rows indent 26px to align titles under the group name.
- **Options page**: 240px sticky navigation + a content column up to 760px, 32px gap, 24px page padding. Below 900px the navigation becomes a top bar of four icon-over-label items. Form rows are a 200px label column + control, stacking below 600px.
- **Onboarding**: single centred 760px column, determinate progress bar, choice cards in a 3-column grid that stacks below 700px.
- **Spacing rhythm**: 4px base, steps of 4 / 8 / 12 / 16 / 24 / 32 / 48.

## Elevation & Depth

Flat and tonal. Depth comes from stepping through surface containers (panel wash `surface-container-low` → cards on `surface` → bar on `surface-container`) and from 1px `outline-variant` borders. Shadows exist only where a layer genuinely floats over content.

### Shadow Vocabulary


- **Floating layer** (`box-shadow: 0 2px 6px 2px color-mix(in srgb, var(--md-sys-color-shadow) 15%, transparent)`): the colour-picker popover and the options snackbar.
- **Drop indicator** (`box-shadow: inset 0 ±2px 0 var(--md-sys-color-primary)` on rows, `0 ±3px 0` on groups): a structural line showing where a dragged item will land, not depth.
- **Selected swatch ring** (`box-shadow: 0 0 0 2px surface, 0 0 0 4px on-surface`).

### Named Rules

**The Flat-By-Default Rule.** Cards, banners and bars have no shadow. A shadow means "this floats above the page and will go away".

## Shapes

Material 3 shape scale: 4px (fields, snackbar, tooltips, tab chips), 8px (chips, badges, tab rows, inline lists), 12px (group cards, banners, mode/choice cards), 16px (settings cards), full (buttons, segmented control, switches, navigation items, progress bars, count pills). Circles for colour swatches and the "Move to…" icon target. Favicons get a 2px corner.

**The Pill Action Rule.** Anything you press to act is full-round; anything that contains content is a rounded rectangle. Keep the two forms distinct.

## Components

### Buttons

Confident Material 3 pills; the filled primary is the one moment of full colour in the panel.

- **Shape:** full round, 40px tall (32px `small`), 24px side padding (16px left when led by an icon).
- **Filled (default):** `primary` / `on-primary` — Organize, Apply.
- **Tonal:** `secondary-container` — secondary actions that still matter.
- **Outlined (`.secondary`):** transparent, 1px `outline`, `primary` text.
- **Text:** transparent, `primary` text, 12px padding; the error variant (`close-group`, `danger`) uses `error`.
- **Icon:** 40px (32px small) transparent circle, `on-surface-variant`; `danger` turns `error` on hover. Icon-only buttons carry `aria-label` and a `data-tooltip`.
- **Link:** an inline underlined `primary` button for actions inside a sentence.
- **States:** hover mixes 8% of the foreground into the background, pressed 10%; disabled is `on-surface` at 12% / 38%. Transition: 150ms standard easing.

### Segmented Mode Picker

Full-round 1px `outline` container split into equal segments; the selected segment fills with `secondary-container`. Switches *By site* / *With AI* at the top of the panel.

### Group Card (signature)

The unit of the proposal. `surface` card, 1px `outline-variant`, 12px radius. Header row: colour swatch, group name as an inline text field (underlined so it reads as editable; borderless when read-only), then provenance badge and tab count that never shrink. Tab rows below. Existing Chrome groups use a full-width toggle header instead of an editable name; when the proposal adds tabs to one, its border turns `primary` and added rows get an 8% primary wash. The by-site preview shown while the AI works is the same card with its tab rows at 0.8 opacity (badges stay at full strength for contrast). Header actions follow the tab-row pattern at every width: save to categories, rename, move group, collapse and the close/discard ✕ sit out of the flow and fade in over the end of the header on hover or focus-within, on a 16px fade of the card surface, so at rest the header is swatch, name and count. They stay hidden while the name is being typed (they would cover the text) and stay visible while "Close N tabs" waits for confirmation. Only the controls take clicks: the fade and the gaps between icons pass the click through to the name below. An open group's header starts with a `chevronRight` that rotates 90° when its list is open (same as the "Not organized" section), since at rest the header is otherwise just swatch, name and count. Accepted trade-off, chosen by the owner: on a narrow open-group card the revealed icons cover much of the name, and a click that lands on an icon runs that action instead of toggling the group.

### Tab Row (signature)

36px row, 8px radius, favicon (16px) + one-line title + trailing actions. All row actions ("Move to…", remove, go-to, close) sit out of the flow and fade in over the end of the title on hover or focus-within, on a 16px fade of the row's own background (`--row-bg`), so at rest the title gets the full width. "Move to…" is an icon with a transparent native `<select>` over it (`on-secondary-container` on the current row); for rows that can be dragged the same menu also offers Move up / Move down, the single-pointer alternative to dragging. The current tab uses the `secondary-container` selected-list-item treatment. Rows are draggable (`cursor: grab`, 0.38 opacity while dragging) and keyboard-navigable with a 2px inset focus outline.

### Chips and Badges


- **Chip:** 32px, 8px radius, 1px `outline-variant`, label-large, optional trailing 24px icon button (site chips, domains).
- **Badge:** 24px, 8px radius, label-medium, `surface-container-high`; `tertiary-container` for AI provenance, `secondary-container` for list provenance.
- **Tab chip / count pill:** label-small, 4px or full radius, for row-level state and section counts.

### Inputs / Fields


- **Style:** outlined, transparent fill, 1px `outline`, 4px radius, min 48px, body-large.
- **Hover:** stroke to `on-surface`. **Focus:** stroke and 1px inset ring in `primary`, no outline. **Error:** same in `error` via `aria-invalid`.
- **Switch:** Material 3 switch, 52×32px, handle grows from 16px to 24px when on.

### Banners and Snackbar


- **Banner:** 12px radius, 12/16px padding, leading icon. Neutral `surface-container-highest`; error `error-container`; stale proposal `secondary-container`; duplicates banner expands into a checklist on `surface`.
- **Snackbar:** `inverse-surface`, 4px radius, min 48px, action in `inverse-primary`; slides up 8px with emphasized-decelerate over 300ms (no motion under reduced-motion).

### Navigation (options)

Navigation-drawer items: 48px, full round, label-large, `on-surface-variant`; hover adds an 8% state layer; the current page fills with `secondary-container`. Below 900px they become a four-item top bar.

### Cards (options and onboarding)

Filled cards: `surface-container-low`, 16px radius, 24px padding, no border, no shadow. Selectable mode/choice cards: `surface`, 1px `outline-variant`, 12px radius, become `secondary-container` with no border when selected; the hidden radio's focus draws the 3px `secondary` outline on the card.

### Progress and Tooltip


- **Linear progress:** 4px full-round, `secondary-container` track, `primary` indicator; indeterminate in the panel, determinate in onboarding.
- **Tooltip:** plain Material 3 tooltip from `data-tooltip`, `inverse-surface`, 4px radius, body-small, appears immediately on hover or keyboard focus, max 240px.

## Do's and Don'ts

### Do:


- **Do** reach for an existing `--md-sys-*` token and an existing class in `base.css` or the surface stylesheet before writing any new rule.
- **Do** get boldness from Material 3 itself: filled primary pills for the main action, `secondary-container` for selection, full-round shapes, the emphasized easing (`cubic-bezier(0.05, 0.7, 0.1, 1)`) for entering elements.
- **Do** keep a visible focus ring on every interactive element (3px `secondary`, 2px offset; inset 2px on list rows) and provide keyboard alternatives to drag and drop.
- **Do** check every panel change at 320px and 400px wide, in light and dark, and with the longest locale.
- **Do** dim with a role colour (`outline`, `on-surface-variant`) rather than opacity when the result must stay at 3:1 or more.

### Don't:


- **Don't** invent styles, colours or one-off values outside the Material 3 tokens and existing classes.
- **Don't** add hex values outside `md3-tokens.css`, except the nine Chrome group colours on swatches.
- **Don't** use shadows for decoration; only floating layers (popover, snackbar) get one.
- **Don't** signal AI with purple gradients, glows, sparkles or shimmer; use the tertiary provenance badge and plain words.
- **Don't** hand-edit `src/ui/md3-tokens.css`; change the seed and run `npm run theme`.
