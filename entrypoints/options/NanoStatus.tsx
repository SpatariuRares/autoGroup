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
      {/* Live: lo stato cambia da solo durante il download; dà anche il nome alla barra. */}
      <p id="nano-status" className={`hint ${status === 'available' ? 'ok' : status === 'unavailable' ? 'error' : ''}`} aria-live="polite">
        {t(`nanoStatus_${status}`)}
        {/* La percentuale la dice la barra: qui, dentro la regione live, verrebbe ripetuta a ogni passo. */}
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
