import { t } from '../../src/shared/i18n';
import type { HeldReason, ProposedTab } from '../../src/shared/types';
import { Icon } from '../../src/ui/Icon';
import { useTabDrag } from './drag';
import { useLiveTabs } from './live-tabs';
import type { Reorder, Target } from './move-targets';
import { motionKey } from './motion';
import { openTab, setMuted } from './tab-actions';

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
 * `targets` mostra il menu per spostarla (vedi `moveTargets`); con `onRemove` la −; con `onClose` la ✕; con `reason` il
 * motivo per cui è ferma. Dai dati dal vivo: la tab attiva è evidenziata, una tab che suona o muta ha
 * il suo pulsante audio, una tab inattiva mostra da quanti giorni. Con `drag` la riga si trascina
 * (tab di un gruppo aperto o senza gruppo, vedi `useTabDrag`); `reorder` mette Su e Giù nello stesso
 * menu, per chi non trascina.
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
  // Il nome accessibile dei controlli dice anche quale tab: tra tante "Chiudi la tab" si sente quale si chiude.
  const named = (key: string) => `${t(key)}: ${tab.title}`;
  const moves = targets.length > 0;
  const positions = reorder && (reorder.up || reorder.down) ? reorder : undefined;
  const moveLabel = positions ? 'panelMoveTabAnywhere' : 'popupMoveTab';
  return (
    // tabIndex -1: la riga riceve il focus dalle frecce (row-navigation.ts) anche se non ha controlli.
    <li
      className={`tab${added ? ' added' : ''}${reason ? ' held' : ''}${chrome?.active ? ' current' : ''}${dragClass}`}
      aria-current={chrome?.active ? 'true' : undefined}
      title={tab.url}
      {...motionKey('tab', tab.tabId)}
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
      {/* Fuori dal flusso: "Sposta in…", −, vai e ✕ compaiono sopra la fine del titolo, così nel pannello stretto il titolo ha tutto lo spazio. */}
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
