import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { ALL_URLS, hasDescriptionPermission, removeDescriptionPermission } from '../../src/settings';
import { t } from '../../src/shared/i18n';
import { Card } from './Card';

/** "Leggi la descrizione delle pagine": serve solo all'AI, quindi sta nella sua pagina. */
export function DescriptionsSection({ enabled, onChange }: { enabled: boolean; onChange: (value: boolean) => unknown }) {
  const [permitted, setPermitted] = useState<boolean | null>(null);
  const [denied, setDenied] = useState(false);
  const [providerLost, setProviderLost] = useState(false);

  useEffect(() => {
    hasDescriptionPermission().then(setPermitted);
  }, []);

  /** L'interruttore è acceso solo se l'opzione è salvata e il permesso c'è davvero. */
  const on = enabled && permitted === true;

  function toggle(next: boolean) {
    setDenied(false);
    setProviderLost(false);
    if (next) {
      // permissions.request va chiamato subito, dentro il gesto dell'utente, prima di ogni await.
      browser.permissions
        .request({ origins: [ALL_URLS] })
        .then(async (granted) => {
          setPermitted(granted);
          setDenied(!granted);
          await onChange(granted);
        })
        .catch((err) => console.error('autoGroup:', err));
    } else {
      // Senza await prima: se un provider perde l'accesso, la nuova richiesta parte ancora dentro il clic.
      removeDescriptionPermission()
        .then((missing) => setProviderLost(missing.length > 0))
        .catch((err) => console.error('autoGroup:', err))
        .then(async () => {
          setPermitted(await hasDescriptionPermission());
          await onChange(false);
        });
    }
  }

  return (
    <Card id="descriptions" title={t('optionsDescriptions')}>
      <label className="toggle">
        <span className="setting-text">
          <strong>{t('optionsReadDescriptions')}</strong>
          <span className="hint">{t('optionsReadDescriptionsHint')}</span>
        </span>
        <input type="checkbox" role="switch" checked={on} disabled={permitted === null} onChange={(e) => toggle(e.target.checked)} />
      </label>
      {denied && <p className="hint error">{t('optionsReadDescriptionsDenied')}</p>}
      {providerLost && <p className="hint error">{t('optionsReadDescriptionsProviderLost')}</p>}
    </Card>
  );
}
