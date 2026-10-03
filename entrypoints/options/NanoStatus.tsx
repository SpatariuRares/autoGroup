import { useEffect, useState } from 'react';
import { downloadNano, nanoAvailability, type NanoAvailability } from '../../src/ai/nano-generator';
import { t } from '../../src/shared/i18n';

/** Stato di Gemini Nano, con il download avviato da un clic e il suo avanzamento. */
export function NanoStatus() {
  const [status, setStatus] = useState<NanoAvailability | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    nanoAvailability().then(setStatus);
  }, []);

  async function download() {
    setFailed(false);
    setStatus('downloading');
    setProgress(0);
    try {
      await downloadNano(setProgress);
    } catch (err) {
      console.error('autoGroup:', err);
      setFailed(true);
    }
    setProgress(null);
    setStatus(await nanoAvailability());
  }

  if (!status) return null;
  return (
    <div className="nano">
      <p className={`hint ${status === 'available' ? 'ok' : status === 'unavailable' ? 'error' : ''}`}>
        {t(`nanoStatus_${status}`)}
        {status === 'downloading' && progress !== null && ` ${Math.round(progress * 100)}%`}
      </p>
      {status === 'downloading' && progress !== null && <progress max={1} value={progress} />}
      {status === 'downloadable' && <button onClick={download}>{t('nanoDownload')}</button>}
      {failed && <p className="hint error">{t('nanoDownloadFailed')}</p>}
    </div>
  );
}
