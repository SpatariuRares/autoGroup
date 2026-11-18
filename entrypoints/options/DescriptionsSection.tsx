import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { ALL_URLS, hasDescriptionPermission, removeDescriptionPermission } from '../../src/settings';
import { t } from '../../src/shared/i18n';
import { Card } from '../../src/ui/settings/Card';

/** "Read page descriptions": only the AI needs it, so it lives on its page. */
export function DescriptionsSection({ enabled, onChange }: { enabled: boolean; onChange: (value: boolean) => unknown }) {
  const [permitted, setPermitted] = useState<boolean | null>(null);
  const [denied, setDenied] = useState(false);
  const [providerLost, setProviderLost] = useState(false);

  useEffect(() => {
    hasDescriptionPermission().then(setPermitted);
  }, []);

  /** The switch is on only if the option is saved and the permission is really granted. */
  const on = enabled && permitted === true;

  function toggle(next: boolean) {
    setDenied(false);
    setProviderLost(false);
    if (next) {
      // permissions.request must be called right away, inside the user's gesture, before any await.
      browser.permissions
        .request({ origins: [ALL_URLS] })
        .then(async (granted) => {
          setPermitted(granted);
          setDenied(!granted);
          await onChange(granted);
        })
        .catch((err) => console.error('autoGroup:', err));
    } else {
      // No await before it: if a provider loses access, the new request still goes out inside the click.
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
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={permitted === null}
          aria-describedby={denied || providerLost ? 'descriptions-error' : undefined}
          onChange={(e) => toggle(e.target.checked)}
        />
      </label>
      {(denied || providerLost) && (
        <p id="descriptions-error" className="hint error" role="alert">
          {t(denied ? 'optionsReadDescriptionsDenied' : 'optionsReadDescriptionsProviderLost')}
        </p>
      )}
    </Card>
  );
}
