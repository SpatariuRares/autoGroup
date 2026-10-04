import { useState } from 'react';
import { t } from '../../src/shared/i18n';

/** Soglia di confidenza del Classificatore, da 0 a 1, mostrata in percentuale. */
export function ThresholdField({ threshold, onChange }: { threshold: number; onChange: (value: number) => unknown }) {
  const [value, setValue] = useState(threshold);
  return (
    <div className="form-row">
      <span className="form-label">{t('optionsThreshold')}</span>
      <div className="form-control">
        <div className="threshold">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={value}
            aria-label={t('optionsThreshold')}
            onChange={(e) => setValue(Number(e.target.value))}
            onPointerUp={() => value !== threshold && onChange(value)}
            onKeyUp={() => value !== threshold && onChange(value)}
          />
          <output>{Math.round(value * 100)}%</output>
        </div>
        <p className="hint">{t('optionsThresholdHint')}</p>
      </div>
    </div>
  );
}
