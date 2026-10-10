import type { HeldReason } from '../../src/organizer/window-view';
import { t } from '../../src/shared/i18n';
import type { ProposalEdit, ProposedTab } from '../../src/shared/types';
import { Icon } from '../../src/ui/Icon';

/** Dove può andare una tab: un gruppo della proposta ("p:id") o un gruppo aperto non ancora toccato ("c:id"). */
export interface Target {
  value: string;
  label: string;
  to: Extract<ProposalEdit, { kind: 'add-tab' }>['to'];
}

/** "1 tab" / "3 tab": chrome.i18n non ha i plurali, quindi il singolare ha una chiave sua. */
export const tabCount = (n: number) => (n === 1 ? t('popupTabCountOne') : t('popupTabCount', String(n)));
export const addedCount = (n: number) => (n === 1 ? t('panelAddedCountOne') : t('panelAddedCount', String(n)));

const REASON_KEY: Record<HeldReason, string> = {
  pinned: 'panelHeldPinned',
  internal: 'panelHeldInternal',
  excluded: 'panelHeldExcluded',
  loading: 'panelHeldLoading',
};

/** Una riga di tab. Con `targets` mostra il menu per spostarla; con `onRemove` la ✕; con `reason` il motivo per cui è ferma. */
export function TabRow({
  tab,
  targets = [],
  onMove,
  onRemove,
  onClose,
  reason,
  added,
}: {
  tab: ProposedTab;
  targets?: Target[];
  onMove?: (tab: ProposedTab, value: string) => void;
  onRemove?: () => void;
  onClose?: () => void;
  reason?: HeldReason;
  added?: boolean;
}) {
  return (
    <li className={`tab${added ? ' added' : ''}${reason ? ' held' : ''}`} title={tab.url}>
      {tab.favIconUrl ? <img src={tab.favIconUrl} alt="" /> : <span className="no-icon" />}
      <span className="tab-title">{tab.title}</span>
      {added && <span className="tab-chip">{t('panelNewTab')}</span>}
      {tab.rule && (
        <span className="tab-chip muted" title={t('panelRuleHint', tab.rule)}>
          {t('panelRule')}
        </span>
      )}
      {reason && <span className="tab-chip muted">{t(REASON_KEY[reason])}</span>}
      {onMove && targets.length > 0 && (
        <label className="move" title={t('popupMoveTab')}>
          <Icon name="driveFileMove" size={18} />
          <select value="" aria-label={t('popupMoveTab')} onChange={(e) => e.target.value && onMove(tab, e.target.value)}>
            <option value="">{t('popupMoveTo')}</option>
            {targets.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {onRemove && (
        <button className="icon small" title={t('popupRemoveTab')} aria-label={t('popupRemoveTab')} onClick={onRemove}>
          <Icon name="remove" size={16} />
        </button>
      )}
      {onClose && (
        <button className="icon small danger close-tab" title={t('panelCloseTab')} aria-label={t('panelCloseTab')} onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      )}
    </li>
  );
}
