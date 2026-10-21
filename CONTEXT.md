# autoGroup

A Chrome extension that groups the tabs of a window by site or by topic and lets the user review the grouping before applying it.

## Language

**Side panel**:
The extension's page docked beside the browser window, where the user sees and edits the proposal and the current groups.
_Avoid_: sidebar, popup

**Open card**:
A group's card in the side panel showing its list of tabs; a closed card shows only the header. It lives only in the side panel and does not touch the browser.
_Avoid_: expanded group

**Collapsed group**:
A tab group folded in the browser's tab strip, so its tabs are hidden there.
_Avoid_: closed group, closed card
