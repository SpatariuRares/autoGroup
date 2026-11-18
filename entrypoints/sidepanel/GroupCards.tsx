import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../../src/shared/i18n';
import { GROUP_COLORS, type ExistingGroupView, type ProposedGroup } from '../../src/shared/types';
import { Icon } from '../../src/ui/Icon';
import { moveInRadioGroup } from '../../src/ui/radio-keys';
import { DragContext, useGroupDrag } from './drag';
import { useExpiring } from './hooks';
import { reorderAt, type Reorder, type Target } from './move-targets';
import { usePanelActions } from './panel-actions';
import { setCollapsed } from './tab-actions';
import { addedCount, tabCount, TabRow } from './TabRow';

/** How long "Close group" stays armed after the first click. */
const CONFIRM_MS = 4000;

/**
 * A new group of the proposal: name and color editable, tabs movable (`targets`). With
 * `readOnly` (per-site preview during computing) it is view-only.
 */
export function GroupCard({ group, targets, readOnly = false }: { group: ProposedGroup; targets: Target[]; readOnly?: boolean }) {
  const { edit, closeTab, saveProposedGroup, adding } = usePanelActions();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const swatch = useRef<HTMLButtonElement>(null);
  // Closing the palette returns focus to the dot: its buttons disappear and would leave it on the body.
  const closePalette = () => {
    swatch.current?.focus();
    setPaletteOpen(false);
  };

  if (readOnly) {
    return (
      <li className="group preview">
        <div className="group-header">
          <span className={`swatch static color-${group.color}`} />
          <span className="visually-hidden">{t(`color_${group.color}`)}</span>
          <span className="group-name static">{group.name}</span>
          <GroupMeta group={group} />
        </div>
        <ul className="tabs">
          {group.tabs.map((tab) => (
            <TabRow key={tab.tabId} tab={tab} />
          ))}
        </ul>
      </li>
    );
  }

  return (
    <li className="group">
      <div className="group-header">
        <button
          ref={swatch}
          className={`swatch color-${group.color}`}
          data-tooltip={t('popupChangeColor')}
          data-tooltip-align="start"
          aria-label={`${t('popupChangeColor')}: ${t(`color_${group.color}`)}`}
          aria-expanded={paletteOpen}
          onClick={() => setPaletteOpen(!paletteOpen)}
        />
        <GroupNameInput name={group.name} onRename={(name) => edit({ kind: 'rename', groupId: group.id, name })} />
        <GroupMeta group={group} />
        <span className="group-end">
          <span className="group-actions">
            <SaveToCategories
              inCategories={group.provenance === 'list' || adding === group.id}
              canSave={group.name.trim() !== ''}
              iconSize={18}
              onSave={() => saveProposedGroup(group)}
            />
          </span>
          <button
            className="icon small danger"
            data-tooltip={t('popupDiscardGroup')}
            aria-label={t('popupDiscardGroup')}
            onClick={() => edit({ kind: 'discard-group', groupId: group.id })}
          >
            <Icon name="close" size={18} />
          </button>
        </span>
      </div>
      {paletteOpen && (
        <div className="palette" role="radiogroup" aria-label={t('popupChangeColor')} onKeyDown={(e) => (e.key === 'Escape' ? closePalette() : moveInRadioGroup(e))}>
          {GROUP_COLORS.map((color) => (
            <button
              key={color}
              role="radio"
              aria-checked={color === group.color}
              // Opening the palette focuses the current color; the arrows move to the others.
              autoFocus={color === group.color}
              tabIndex={color === group.color ? 0 : -1}
              className={`swatch color-${color}${color === group.color ? ' selected' : ''}`}
              data-tooltip={t(`color_${color}`)}
              aria-label={t(`color_${color}`)}
              onClick={() => {
                closePalette();
                if (color !== group.color) edit({ kind: 'recolor', groupId: group.id, color });
              }}
            />
          ))}
        </div>
      )}
      <ul className="tabs">
        {group.tabs.map((tab) => (
          <TabRow
            key={tab.tabId}
            tab={tab}
            targets={targets}
            onRemove={() => edit({ kind: 'remove-tab', tabId: tab.tabId })}
            onClose={() => closeTab(tab.tabId)}
          />
        ))}
      </ul>
    </li>
  );
}

/**
 * The name of a group, to be edited. Enter or leaving the field saves the name if it changed; Esc
 * goes back to the current name. With `onDone` (the field appears only while editing) Esc also leaves
 * the field, without saving, and `onDone` is called on exit.
 */
function GroupNameInput({ name, onRename, onDone }: { name: string; onRename: (name: string) => void; onDone?: () => void }) {
  const [value, setValue] = useState(name);
  const cancelled = useRef(false);
  // A new group follows the proposal's name; the field of an open group, which exists only while
  // typing, does not lose what was typed if the name changes in Chrome.
  useEffect(() => {
    if (!onDone) setValue(name);
  }, [name]);
  return (
    <input
      className="group-name"
      value={value}
      autoFocus={onDone !== undefined}
      aria-label={t('popupGroupName')}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (!cancelled.current && value.trim() !== name) onRename(value);
        cancelled.current = false;
        onDone?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(name);
          if (onDone) {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }
      }}
    />
  );
}

/**
 * "Add to categories" (`canSave`: the group has a name). For a group that is already a category,
 * or that is becoming one (`inCategories`), only the mark is shown in place of the button.
 */
function SaveToCategories({ inCategories, canSave, iconSize, onSave }: { inCategories: boolean; canSave: boolean; iconSize: number; onSave: () => void }) {
  const { busy } = usePanelActions();
  // If the button had focus, the mark that replaces it takes it.
  const savedHere = useRef(false);
  if (inCategories) return <InCategories focus={savedHere.current} />;
  if (!canSave) return null;
  return (
    <button
      className="icon small save"
      disabled={busy}
      data-tooltip={t('popupSaveToListHint')}
      aria-label={t('popupSaveToList')}
      onClick={(e) => {
        savedHere.current = document.activeElement === e.currentTarget;
        onSave();
      }}
    >
      <Icon name="bookmarkAdd" size={iconSize} />
    </button>
  );
}

/**
 * In place of "Add to categories" for a group that is already a category: only a mark, no
 * action. It appears already on click of "Add", while saving is in progress. With `focus` (the button
 * being replaced had focus) it takes it: without it, focus recovery would send it to the neighboring group.
 */
function InCategories({ focus = false }: { focus?: boolean }) {
  const mark = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (focus) mark.current?.focus();
  }, []);
  return (
    <span ref={mark} className="in-categories" role="img" tabIndex={-1} data-tooltip={t('panelInCategories')} aria-label={t('panelInCategories')}>
      <Icon name="bookmarkAdded" size={18} />
    </span>
  );
}

/** "Move the group": Up and Down one place in the tab strip, the alternative to dragging the header. */
function MoveGroup({ name, reorder }: { name: string; reorder: Reorder }) {
  return (
    <label className="move" data-tooltip={t('panelMoveGroup')}>
      <Icon name="swapVert" size={18} />
      <select
        value=""
        aria-label={`${t('panelMoveGroup')}: ${name}`}
        onChange={(e) => (e.target.value === 'up' || e.target.value === 'down') && reorder.onMove(e.target.value)}
      >
        <option value="">{t('panelMoveGroup')}</option>
        {reorder.up && <option value="up">{t('panelMoveUp')}</option>}
        {reorder.down && <option value="down">{t('panelMoveDown')}</option>}
      </select>
    </label>
  );
}

/** Provenance and tab count, in the title row to keep the cards short. */
function GroupMeta({ group }: { group: ProposedGroup }) {
  return (
    <span className="group-meta">
      <span className={`badge provenance-${group.provenance}`}>{t(`provenance_${group.provenance}`)}</span>
      <span className="count">{tabCount(group.tabs.length)}</span>
    </span>
  );
}

/**
 * A group already open in Chrome: the color stays Chrome's, the name is changed with the pencil (for
 * a category it also changes the category). If it is not a category it is added to the categories; if it is,
 * only the mark is shown in place of the button. Its current tabs
 * are view-only; those the proposal adds to it are marked as new and can be removed.
 * A group with no additions stays closed, to keep the list short. From the header the group is collapsed or
 * expanded in Chrome and all its tabs are closed (on the second click, within a few seconds).
 * From the header the whole group is dragged; its current tabs are dragged one by one
 * (`nextGroupId`: the group that follows it in the tab strip, see `useGroupDrag`). Without dragging: "Move the
 * group" (`reorder`), and for its tabs "Move to…" (`liveTargets`) with Up and Down.
 */
export function ExistingCard({
  existing,
  targets,
  nextGroupId,
  reorder,
  liveTargets = [],
  readOnly = false,
}: {
  existing: ExistingGroupView;
  nextGroupId: number | null;
  /** For the tabs that the proposal adds to it. */
  targets: Target[];
  /** Absent while dragging is not possible (computing in progress, preview). */
  reorder?: Reorder;
  /** For its current tabs. */
  liveTargets?: Target[];
  readOnly?: boolean;
}) {
  const { group, current, added, collapsed, isCategory } = existing;
  const { edit, closeTab, closeGroup, renameGroup, moveTab, saveOpenGroup, adding } = usePanelActions();
  const { enabled: canDrag } = useContext(DragContext);
  const [armed, setArmed] = useExpiring<true>(CONFIRM_MS);
  // Leaving the field saves the name, Esc cancels (see `GroupNameInput`).
  const [editing, setEditing] = useState(false);
  const pencil = useRef<HTMLButtonElement>(null);
  const stopEditing = () => {
    setEditing(false);
    // The field disappears: focus returns to the pencil instead of ending up on the body.
    requestAnimationFrame(() => pencil.current?.focus());
  };
  // As <details open> used to: open if the proposal adds tabs to it, closed if no longer.
  const [open, setOpen] = useState(added.length > 0);
  useEffect(() => setOpen(added.length > 0), [added.length > 0]);
  const listId = `existing-group-${group.id}`;
  const { card, header } = useGroupDrag(group.id, nextGroupId);
  const { className: dropClass, ...cardProps } = card;
  return (
    <li className={`group existing${added.length > 0 ? ' extended' : ''}${dropClass}`} {...cardProps}>
      {/* The buttons sit next to the header, not inside it: a control inside another (as it was in the
          <summary>) is not valid, and many screen readers do not read or reach the inner one. */}
      {/* While the name is being typed the header is not dragged: dragging would select the text. */}
      <div className="group-header" {...(!editing ? header : {})}>
        {!editing ? (
          <button className="group-toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
            {/* The arrow says the group opens: at rest the header is only dot, name and count. */}
            <Icon name="chevronRight" size={18} />
            {/* An aria-label on a <span> with no role is ignored: the color is hidden text. */}
            <span className={`swatch static color-${group.color}`} />
            <span className="visually-hidden">{t(`color_${group.color}`)}</span>
            <span className="group-name static">{group.name || t('popupUnnamed')}</span>
            <span className="count">
              {tabCount(current.length)}
              {added.length > 0 && <strong> {addedCount(added.length)}</strong>}
            </span>
          </button>
        ) : (
          <>
            <span className={`swatch static color-${group.color}`} />
            <GroupNameInput name={group.name} onRename={(name) => renameGroup(group.id, name)} onDone={stopEditing} />
          </>
        )}
        <span className={`group-end${armed ? ' armed' : ''}`}>
          <span className="group-actions">
            {!readOnly && !editing && (
              <button
                ref={pencil}
                className="icon small"
                data-tooltip={t('panelRenameGroup')}
                aria-label={t('panelRenameGroup')}
                onClick={() => setEditing(true)}
              >
                <Icon name="edit" size={16} />
              </button>
            )}
            <SaveToCategories
              inCategories={isCategory || adding === group.id}
              canSave={!readOnly && group.name.trim() !== ''}
              iconSize={16}
              onSave={() => saveOpenGroup(group)}
            />
            {reorder && (reorder.up || reorder.down) && !editing && <MoveGroup name={group.name || t('popupUnnamed')} reorder={reorder} />}
            <button
              className="icon small"
              data-tooltip={t(collapsed ? 'panelExpandGroup' : 'panelCollapseGroup')}
              aria-label={t(collapsed ? 'panelExpandGroup' : 'panelCollapseGroup')}
              onClick={() => setCollapsed(group.id, !collapsed)}
            >
              <Icon name={collapsed ? 'unfoldMore' : 'unfoldLess'} size={16} />
            </button>
          </span>
          {!readOnly &&
            (armed ? (
              <button
                className="text small close-group"
                onClick={() => {
                  setArmed(null);
                  closeGroup(group.id);
                }}
              >
                {current.length === 1 ? t('panelCloseGroupConfirmOne') : t('panelCloseGroupConfirm', String(current.length))}
              </button>
            ) : (
              <button className="icon small danger" data-tooltip={t('panelCloseGroup')} aria-label={t('panelCloseGroup')} onClick={() => setArmed(true)}>
                <Icon name="close" size={16} />
              </button>
            ))}
        </span>
      </div>
      <ul id={listId} className="tabs" hidden={!open}>
        {added.map((tab) => (
          readOnly ? (
            <TabRow key={tab.tabId} tab={tab} added />
          ) : (
            <TabRow
              key={tab.tabId}
              tab={tab}
              added
              targets={targets}
              onRemove={() => edit({ kind: 'remove-tab', tabId: tab.tabId })}
              onClose={() => closeTab(tab.tabId)}
            />
          )
        ))}
        {current.map((tab, i) => (
          <TabRow
            key={tab.tabId}
            tab={tab}
            targets={liveTargets}
            onClose={() => closeTab(tab.tabId)}
            drag={{ groupId: group.id, nextTabId: current[i + 1]?.tabId ?? null }}
            reorder={canDrag ? reorderAt(current.map((x) => x.tabId), i, (before) => moveTab(tab.tabId, group.id, before)) : undefined}
          />
        ))}
      </ul>
    </li>
  );
}
