import { useEffect, useState } from 'react';
import { downloadNano, nanoAvailability, type NanoAvailability } from '../../ai/nano-generator';
import { t } from '../../shared/i18n';

/** Gemini Nano status, with the download started by a click and its progress. */
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
      {/* Live: the status changes on its own during the download; it also names the bar. */}
      <p id="nano-status" className={`hint ${status === 'available' ? 'ok' : status === 'unavailable' ? 'error' : ''}`} aria-live="polite">
        {t(`nanoStatus_${status}`)}
        {/* The bar already announces the percentage: here, inside the live region, it would be repeated at every step. */}
        {status === 'downloading' && progress !== null && <span aria-hidden="true"> {Math.round(progress * 100)}%</span>}
      </p>
      {status === 'downloading' && progress !== null && <progress max={1} value={progress} aria-labelledby="nano-status" />}
      {status === 'downloadable' && <button onClick={download}>{t('nanoDownload')}</button>}
      {failed && (
        <p className="hint error" role="alert">
          {t('nanoDownloadFailed')}
        </p>
      )}
    </div>
  );
}
