import { useRef, useState } from 'react';
import type { Settings } from '../../src/settings';
import { exportSettings } from '../../src/settings/backup';
import { t } from '../../src/shared/i18n';
import { Icon } from '../../src/ui/Icon';
import { Card } from '../../src/ui/settings/Card';

/**
 * "Esporta" scarica un file JSON con le preferenze (senza provider né chiavi); "Importa" lo rilegge.
 * Il download passa da un link locale: non serve il permesso "downloads".
 */
export function BackupSection({
  settings,
  onImport,
}: {
  settings: Settings;
  /** Importa il testo del file; un file rifiutato chiama `onError` con la chiave del messaggio. */
  onImport: (text: string, onError: (messageKey: string) => void) => Promise<unknown>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function download() {
    const url = URL.createObjectURL(new Blob([exportSettings(settings)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `autogroup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function read(file: File) {
    setError(null);
    await onImport(await file.text(), setError);
  }

  return (
    <Card id="backup" title={t('optionsBackup')} hint={t('optionsBackupHint')}>
      <div className="actions">
        <button className="tonal" onClick={download}>
          <Icon name="download" size={18} />
          {t('optionsExport')}
        </button>
        <button className="secondary" onClick={() => input.current?.click()}>
          <Icon name="upload" size={18} />
          {t('optionsImport')}
        </button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) read(file);
          }}
        />
      </div>
      {error && (
        <p className="hint error" role="alert">
          {t(error)}
        </p>
      )}
    </Card>
  );
}
