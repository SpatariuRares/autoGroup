import { t, warningKey } from '../../src/shared/i18n';
import type { Proposal } from '../../src/shared/types';
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

/** Pagine aperte più volte nella finestra: si offre di chiudere le copie libere. */
export function DuplicatesBanner({ count, disabled, onClose }: { count: number; disabled: boolean; onClose: () => void }) {
  return (
    <div className="banner duplicates" role="status">
      <Icon name="tab" />
      <span>{count === 1 ? t('panelDuplicatesOne') : t('panelDuplicates', String(count))}</span>
      <button className="text small" disabled={disabled} onClick={onClose}>
        {t('panelCloseDuplicates')}
      </button>
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
