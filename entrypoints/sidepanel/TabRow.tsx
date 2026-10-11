import { daysSinceAccess } from '../../src/organizer/inactive';
import type { HeldReason } from '../../src/organizer/window-view';
import { t } from '../../src/shared/i18n';
import type { ProposalEdit, ProposedTab } from '../../src/shared/types';
import { Icon } from '../../src/ui/Icon';
import { useLiveTabs } from './live-tabs';
import { openTab, setMuted } from './tab-actions';

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

/**
 * Una riga di tab, sempre con il pulsante per andarci (anche Invio sulla riga o doppio clic). Con
 * `targets` mostra il menu per spostarla; con `onRemove` la −; con `onClose` la ✕; con `reason` il
 * motivo per cui è ferma. Dai dati dal vivo: la tab attiva è evidenziata, una tab che suona o muta ha
 * il suo pulsante audio, una tab inattiva mostra da quanti giorni.
 */
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
  const live = useLiveTabs();
  const chrome = live.tabs.get(tab.tabId);
  const muted = chrome?.mutedInfo?.muted ?? false;
  const idleDays = live.inactive.has(tab.tabId) && chrome ? daysSinceAccess(chrome, live.now) : undefined;
  // Il nome accessibile dei controlli dice anche quale tab: tra tante "Chiudi la tab" si sente quale si chiude.
  const named = (key: string) => `${t(key)}: ${tab.title}`;
  return (
    // tabIndex -1: la riga riceve il focus dalle frecce (row-navigation.ts) anche se non ha controlli.
    <li
      className={`tab${added ? ' added' : ''}${reason ? ' held' : ''}${chrome?.active ? ' current' : ''}`}
      aria-current={chrome?.active ? 'true' : undefined}
      title={tab.url}
      tabIndex={-1}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && openTab(tab.tabId)}
      onDoubleClick={(e) => !(e.target as HTMLElement).closest('button, label') && openTab(tab.tabId)}
    >
      {tab.favIconUrl ? <img src={tab.favIconUrl} alt="" /> : <span className="no-icon" />}
      <span className="tab-title">{tab.title}</span>
      {(chrome?.audible || muted) && (
        <button
          className={`icon small audio${muted ? ' muted' : ''}`}
          title={t(muted ? 'panelUnmute' : 'panelMute')}
          // Niente aria-pressed: con un'etichetta che cambia ("Disattiva" / "Riattiva") direbbe il contrario.
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
      {onMove && targets.length > 0 && (
        <label className="move" title={t('popupMoveTab')}>
          <Icon name="driveFileMove" size={18} />
          <select value="" aria-label={named('popupMoveTab')} onChange={(e) => e.target.value && onMove(tab, e.target.value)}>
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
        <button className="icon small" title={t('popupRemoveTab')} aria-label={named('popupRemoveTab')} onClick={onRemove}>
          <Icon name="remove" size={16} />
        </button>
      )}
      <button className="icon small open-tab" title={t('panelOpenTab')} aria-label={named('panelOpenTab')} onClick={() => openTab(tab.tabId)}>
        <Icon name="openInNew" size={16} />
      </button>
      {onClose && (
        <button className="icon small danger close-tab" title={t('panelCloseTab')} aria-label={named('panelCloseTab')} onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      )}
    </li>
  );
}
