import { t } from '../../src/shared/i18n';
import type { HeldReason, ProposedTab } from '../../src/shared/types';
import { Icon } from '../../src/ui/Icon';
import { useTabDrag } from './drag';
import { useLiveTabs } from './live-tabs';
import type { Reorder, Target } from './move-targets';
import { openTab, setMuted } from './tab-actions';

/** "1 tab" / "3 tabs": chrome.i18n has no plurals, so the singular has its own key. */
export const tabCount = (n: number) => (n === 1 ? t('popupTabCountOne') : t('popupTabCount', String(n)));
export const addedCount = (n: number) => (n === 1 ? t('panelAddedCountOne') : t('panelAddedCount', String(n)));

const REASON_KEY: Record<HeldReason, string> = {
  pinned: 'panelHeldPinned',
  internal: 'panelHeldInternal',
  excluded: 'panelHeldExcluded',
  loading: 'panelHeldLoading',
};

/**
 * A tab row, always with the button to go there (also Enter on the row or double click). With
 * `targets` it shows the menu to move it (see `moveTargets`); with `onRemove` the −; with `onClose` the ✕; with `reason` the
 * reason it is held. From the live data: the active tab is highlighted, a tab that plays sound or is muted has
 * its audio button, an inactive tab shows for how many days. With `drag` the row can be dragged
 * (tab of an open group or ungrouped, see `useTabDrag`); `reorder` puts Up and Down in the same
 * menu, for those who do not drag.
 */
export function TabRow({
  tab,
  targets = [],
  onRemove,
  onClose,
  reason,
  added,
  drag,
  reorder,
}: {
  tab: ProposedTab;
  targets?: Target[];
  onRemove?: () => void;
  onClose?: () => void;
  reason?: HeldReason;
  added?: boolean;
  drag?: { groupId: number | null; nextTabId: number | null };
  reorder?: Reorder;
}) {
  const chrome = useLiveTabs()[tab.tabId];
  const { className: dragClass, ...dragProps } = useTabDrag(tab.tabId, drag);
  const muted = chrome?.muted ?? false;
  const idleDays = chrome?.idleDays;
  // The accessible name of the controls also says which tab: among many "Close tab" you hear which one is closed.
  const named = (key: string) => `${t(key)}: ${tab.title}`;
  const moves = targets.length > 0;
  const positions = reorder && (reorder.up || reorder.down) ? reorder : undefined;
  const moveLabel = positions ? 'panelMoveTabAnywhere' : 'popupMoveTab';
  return (
    // tabIndex -1: the row receives focus from the arrows (row-navigation.ts) even if it has no controls.
    <li
      className={`tab${added ? ' added' : ''}${reason ? ' held' : ''}${chrome?.active ? ' current' : ''}${dragClass}`}
      aria-current={chrome?.active ? 'true' : undefined}
      title={tab.url}
      tabIndex={-1}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && openTab(tab.tabId)}
      onDoubleClick={(e) => !(e.target as HTMLElement).closest('button, label') && openTab(tab.tabId)}
      {...dragProps}
    >
      {tab.favIconUrl ? <img src={tab.favIconUrl} alt="" /> : <span className="no-icon" />}
      <span className="tab-title">{tab.title}</span>
      {(chrome?.audible || muted) && (
        <button
          className={`icon small audio${muted ? ' muted' : ''}`}
          data-tooltip={t(muted ? 'panelUnmute' : 'panelMute')}
          // No aria-pressed: with a label that changes ("Mute" / "Unmute") it would say the opposite.
          aria-label={named(muted ? 'panelUnmute' : 'panelMute')}
          onClick={() => setMuted(tab.tabId, !muted)}
        >
          <Icon name={muted ? 'volumeOff' : 'volumeUp'} size={18} />
        </button>
      )}
      {idleDays !== undefined && (
        <span className="tab-chip muted" title={t('panelInactiveHint', String(idleDays))}>
          {t('panelInactiveChip', String(idleDays))}
        </span>
      )}
      {added && <span className="tab-chip">{t('panelNewTab')}</span>}
      {tab.rule && (
        <span className="tab-chip muted" title={t('panelRuleHint', tab.rule)}>
          {t('panelRule')}
        </span>
      )}
      {reason && <span className="tab-chip muted">{t(REASON_KEY[reason])}</span>}
      {/* Out of the flow: "Move to…", −, go and ✕ appear over the end of the title, so in the narrow panel the title has all the space. */}
      <span className="tab-actions">
        {(moves || positions) && (
          <label className="move" data-tooltip={t(moveLabel)}>
            <Icon name="driveFileMove" size={18} />
            <select
              value=""
              aria-label={named(moveLabel)}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'up' || value === 'down') positions?.onMove(value);
                else targets.find((x) => x.value === value)?.move(tab);
              }}
            >
              <option value="">{t('popupMoveTo')}</option>
              {moves &&
                targets.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              {positions && (
                <optgroup label={t('panelPosition')}>
                  {positions.up && <option value="up">{t('panelMoveUp')}</option>}
                  {positions.down && <option value="down">{t('panelMoveDown')}</option>}
                </optgroup>
              )}
            </select>
          </label>
        )}
        {onRemove && (
          <button className="icon small" data-tooltip={t('popupRemoveTab')} aria-label={named('popupRemoveTab')} onClick={onRemove}>
            <Icon name="remove" size={16} />
          </button>
        )}
        <button className="icon small open-tab" data-tooltip={t('panelOpenTab')} aria-label={named('panelOpenTab')} onClick={() => openTab(tab.tabId)}>
          <Icon name="openInNew" size={16} />
        </button>
        {onClose && (
          <button className="icon small danger close-tab" data-tooltip={t('panelCloseTab')} aria-label={named('panelCloseTab')} onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        )}
      </span>
    </li>
  );
}
