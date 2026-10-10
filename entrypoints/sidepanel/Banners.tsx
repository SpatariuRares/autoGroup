import { useState } from 'react';
import { t, warningKey } from '../../src/shared/i18n';
import type { Proposal, ProposedTab } from '../../src/shared/types';
import { Icon } from '../../src/ui/Icon';
import { openSettings } from './open-settings';

/**
 * Calcolo in corso: barra di avanzamento, "Interrompi" e, con l'anteprima per sito, "Usa questa".
 * I pulsanti compaiono solo quando il service worker ha davvero iniziato (`started`).
 */
export function ComputingStatus({
  preview,
  started,
  onAccept,
  onAbort,
}: {
  preview?: Proposal;
  started: boolean;
  onAccept: () => void;
  onAbort: () => void;
}) {
  return (
    <div className="status computing" role="status">
      <div className="md-linear-progress" />
      <div className="status-row">
        <span>{t(preview ? 'panelPreviewComputing' : 'popupComputing')}</span>
        {started && (
          <span className="status-actions">
            {preview && preview.groups.length > 0 && (
              <button className="text small accept-preview" onClick={onAccept}>
                <Icon name="check" size={18} />
                {t('panelUsePreview')}
              </button>
            )}
            <button className="text small abort" onClick={onAbort}>
              <Icon name="stop" size={18} />
              {t('popupAbort')}
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

/** Banner informativo con l'icona "i". */
export function InfoBanner({ text }: { text: string }) {
  return (
    <p className="banner">
      <Icon name="info" />
      <span>{text}</span>
    </p>
  );
}

export function ErrorBanner({ messageKey }: { messageKey: string }) {
  return (
    <p className="banner error" role="alert">
      <Icon name="warning" />
      <span>{t(messageKey)}</span>
    </p>
  );
}

/** Le tab sono cambiate dopo la proposta: si offre di ricalcolare, senza farlo da soli. */
export function StaleBanner({ onRecompute }: { onRecompute: () => void }) {
  return (
    <div className="banner stale" role="status">
      <Icon name="info" />
      <span>{t('panelStale')}</span>
      <button className="text small" onClick={onRecompute}>
        {t('popupRecompute')}
      </button>
    </div>
  );
}

/** Host di un URL per distinguere due tab con lo stesso titolo; l'URL intero se non ne ha. */
const hostOf = (url: string) => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

/**
 * Pagine aperte più volte nella finestra. "Rivedi" apre l'anteprima: le copie che verrebbero chiuse,
 * tutte spuntate; si tolgono le spunte a quelle da tenere, poi "Chiudi" chiude solo le altre.
 */
export function DuplicatesBanner({ tabs, disabled, onClose }: { tabs: ProposedTab[]; disabled: boolean; onClose: (tabIds: number[]) => void }) {
  const [open, setOpen] = useState(false);
  // Le tab da tenere, non quelle da chiudere: un doppione nuovo comparso mentre l'anteprima è aperta parte spuntato.
  const [kept, setKept] = useState<Set<number>>(new Set());
  const chosen = tabs.filter((tab) => !kept.has(tab.tabId)).map((tab) => tab.tabId);
  const toggle = (tabId: number) =>
    setKept((current) => {
      const next = new Set(current);
      if (!next.delete(tabId)) next.add(tabId);
      return next;
    });

  return (
    <div className="banner duplicates" role="status">
      <div className="duplicates-row">
        <Icon name="tab" />
        <span>{tabs.length === 1 ? t('panelDuplicatesOne') : t('panelDuplicates', String(tabs.length))}</span>
        {!open && (
          <button className="text small" onClick={() => setOpen(true)}>
            {t('panelReviewDuplicates')}
          </button>
        )}
      </div>
      {open && (
        <>
          <ul className="duplicates-list">
            {tabs.map((tab) => (
              <li key={tab.tabId}>
                <label title={tab.url}>
                  <input type="checkbox" checked={!kept.has(tab.tabId)} onChange={() => toggle(tab.tabId)} />
                  {tab.favIconUrl ? <img src={tab.favIconUrl} alt="" /> : <span className="no-icon" />}
                  <span className="duplicate-title">{tab.title}</span>
                  <span className="duplicate-host">{hostOf(tab.url)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="duplicates-actions">
            <button
              className="text small"
              onClick={() => {
                setOpen(false);
                setKept(new Set());
              }}
            >
              {t('panelCancel')}
            </button>
            <button
              className="tonal small"
              disabled={disabled || chosen.length === 0}
              onClick={() => {
                onClose(chosen);
                setOpen(false);
                setKept(new Set());
              }}
            >
              {t('panelCloseSelected', String(chosen.length))}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Livelli dell'AI saltati, con la causa e il collegamento alla sezione giusta delle impostazioni. */
export function WarningsBanner({ warnings }: { warnings: Proposal['warnings'] }) {
  return (
    <ul className="banner warnings" role="alert">
      {warnings.map((w, i) => (
        <li key={i}>
          <Icon name="warning" />
          <span>
            {t('popupWarningFallback')} {t(warningKey(w.cause), w.provider)}{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); openSettings(w.level); }}>
              {t('popupWarningSettings')}
            </a>
          </span>
        </li>
      ))}
    </ul>
  );
}
