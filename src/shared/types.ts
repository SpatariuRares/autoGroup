/** The 9 colors of Chrome's tab groups, in the order used for rotation. */
export const GROUP_COLORS = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const;

export type GroupColor = (typeof GROUP_COLORS)[number];

/** A category of the user's fixed list. */
export interface Category {
  /** Stable ID, used by the interface for edits and reordering. */
  id: string;
  name: string;
  /** Explains to the AI what belongs in the category. */
  description: string;
  color: GroupColor;
}

/** Where a proposed group comes from. `manual`: created by the user with "+ New group". */
export type Provenance = 'list' | 'existing' | 'ai' | 'domain' | 'manual';

/** A tab inside the proposal. `tabId` is Chrome's ID: it stays in the extension, never sent to the AI. */
export interface ProposedTab {
  tabId: number;
  title: string;
  url: string;
  favIconUrl?: string;
  /** The site of the rule that put the tab in its group; disappears if the user moves it. */
  rule?: string;
}

export interface ProposedGroup {
  /** Stable ID within the proposal, used by the panel for edits. */
  id: string;
  name: string;
  color: GroupColor;
  provenance: Provenance;
  /** Present only for groups already open in Chrome that the proposal extends. */
  existingGroupId?: number;
  tabs: ProposedTab[];
}

/** Warning shown at the top of the preview when a level of the pipeline was skipped. */
export interface ProposalWarning {
  level: 'classifier' | 'generator';
  provider: string;
  cause:
    | 'unreachable'
    | 'invalid-key'
    | 'rate-limit'
    | 'timeout'
    | 'invalid-response'
    | 'invalid-request'
    | 'unavailable'
    | 'no-permission'
    | 'needs-download'
    | 'downloading'
    | 'not-supported';
}

/** Measured phases of a proposal computation. */
export type Phase = 'inputs' | 'preview' | 'descriptions' | 'classifier' | 'generator' | 'domain';

/** Duration in ms of each phase run and of the whole computation (`total`). Diagnostics only. */
export type Timings = Partial<Record<Phase | 'total', number>>;

export interface Proposal {
  windowId: number;
  createdAt: number;
  /** Fingerprint of the free tabs and of the settings used: it tells whether the proposal is still current. */
  signature: string;
  groups: ProposedGroup[];
  warnings: ProposalWarning[];
  /** Where the computation time went; absent in the per-site preview. */
  timings?: Timings;
}

/** An edit made by the user in the preview. */
export type ProposalEdit =
  | { kind: 'rename'; groupId: string; name: string }
  | { kind: 'recolor'; groupId: string; color: GroupColor }
  | { kind: 'discard-group'; groupId: string }
  | { kind: 'remove-tab'; tabId: number }
  | { kind: 'move-tab'; tabId: number; toGroupId: string }
  /**
   * Puts a tab (free, or already in a proposed group) into a group of the proposal, into a group
   * already open in Chrome that the proposal does not touch yet, or into a new group, all its own. The
   * panel sends the tab's data because a free tab is not in the proposal; the Organizer
   * checks that it really is free.
   */
  | { kind: 'add-tab'; tab: ProposedTab; to: { groupId: string } | { existingGroup: ExistingGroupRef } | { newGroup: true } };

/** A group already open in Chrome, as the panel sees it. */
export interface ExistingGroupRef {
  id: number;
  name: string;
  color: GroupColor;
}

/** Snapshot of the tabs involved in an organization, taken before applying it. */
export interface UndoSnapshot {
  windowId: number;
  tabs: { tabId: number; windowId: number; index: number; groupId: number }[];
  /** Groups created by the operation. */
  createdGroupIds: number[];
}

/** "Always put here" offered after a move: the tab, the site that would be saved, and the category. */
export interface RememberOffer {
  tabId: number;
  site: string;
  category: string;
}

/** Why a tab cannot go into a group: the extension never touches it. */
export type HeldReason = 'pinned' | 'internal' | 'excluded' | 'loading';

/** A group already open in Chrome, with its tabs right now and the ones the proposal adds to it. */
export interface ExistingGroupView {
  group: ExistingGroupRef;
  current: ProposedTab[];
  added: ProposedTab[];
  /** The proposed group that extends it, if any. */
  proposedGroupId?: string;
  collapsed: boolean;
  /** True if the name is that of a category (case-insensitive). */
  isCategory: boolean;
}

/** Live details of a tab that the proposal does not carry. */
export interface LiveTab {
  active: boolean;
  audible: boolean;
  muted: boolean;
  /** Days without being looked at, only for the tabs that "Close inactive" would close. */
  idleDays?: number;
}

/** The whole window as the panel shows it: nothing stays hidden. */
export interface WindowView {
  existing: ExistingGroupView[];
  /** New groups of the proposal (list, new AI, site). */
  created: ProposedGroup[];
  /** Free tabs that the proposal leaves out: the user can put them in a group. */
  free: ProposedTab[];
  /** Tabs that the extension never touches, with the reason. */
  held: { tab: ProposedTab; reason: HeldReason }[];
  /** Tabs that "Close duplicates" would close, in tab-strip order. */
  duplicates: ProposedTab[];
  /** Tabs that "Close inactive" would close, in tab-strip order. */
  inactive: ProposedTab[];
  /** After how many days a tab counts as inactive. */
  inactiveDays: number;
  /** Live details of every tab in the window, by ID. */
  live: Record<number, LiveTab>;
}

/** Outcome of the last operation to show in the panel (i18n key and argument), e.g. a rejected category name. */
export interface Notice {
  key: string;
  arg?: string | string[];
  /** Outcome of "Add to categories": the panel shows it only in the snackbar, right after the click. */
  snackbar?: true;
}

/** Fields valid in every phase. */
interface StateCommon {
  /** Present as long as "Undo last organization" is available. */
  undo?: UndoSnapshot;
  /** i18n key of the last error, if the computation or the application failed. */
  error?: string;
  /** Valid until the user's next operation. */
  notice?: Notice;
}

/** No proposal. `windowId` is the window of the last operation, if any. */
export interface IdleState extends StateCommon {
  phase: 'idle';
  windowId?: number;
  proposal?: never;
  preview?: never;
  stale?: never;
  offer?: never;
}

export interface ComputingState extends StateCommon {
  phase: 'computing';
  windowId: number;
  /**
   * AI mode only: the per-site proposal, ready right away. The panel shows it read-only
   * while the AI works; "Use this" stops the AI and makes it the current proposal.
   */
  preview?: Proposal;
  proposal?: never;
  stale?: never;
  offer?: never;
}

export interface ReadyState extends StateCommon {
  phase: 'ready';
  windowId: number;
  proposal: Proposal;
  /** True if the tabs, the open groups or the settings have changed since the proposal was computed. */
  stale?: boolean;
  /** Only in the state returned by "Move to…" towards a category: the "Always put here" offer. */
  offer?: RememberOffer;
  preview?: never;
}

/**
 * Organizer state, saved in chrome.storage.session. The `never` fields are there so that
 * `state.proposal` can be read without distinguishing the phase: it is `undefined` outside `ready`.
 */
export type OrganizerState = IdleState | ComputingState | ReadyState;

/** The proposal ready for this window, if any. */
export function proposalIn(state: OrganizerState | null | undefined, windowId: number | null | undefined): Proposal | undefined {
  return state?.phase === 'ready' && state.windowId === windowId ? state.proposal : undefined;
}

/** The per-site preview of the computation in progress for this window, if any. */
export function previewIn(state: OrganizerState | null | undefined, windowId: number | null | undefined): Proposal | undefined {
  return state?.phase === 'computing' && state.windowId === windowId ? state.preview : undefined;
}
