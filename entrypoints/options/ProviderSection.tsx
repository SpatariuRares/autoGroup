import { useEffect, useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { testOpenAiConnection } from '../../src/ai/openai-generator';
import { testSystemOneConnection } from '../../src/ai/systemone-classifier';
import { ProviderError } from '../../src/ai/types';
import { NANO_LABEL } from '../../src/ai/nano-generator';
import {
  hasHostPermission,
  isLocalOnly,
  loadSettings,
  isProviderConfigured,
  NANO_PRESET,
  loadApiKey,
  originPattern,
  presetsOf,
  providerLabel,
  saveApiKey,
  saveSettings,
  type ProviderRole,
  type ProviderSettings,
} from '../../src/settings';
import { t, warningKey } from '../../src/shared/i18n';
import { Card } from './Card';

type Status = { kind: 'ok' | 'error' | 'info'; key: string; sub?: string } | null;

/** Testi che cambiano tra Classificatore e Generatore. */
const TEXT = {
  classifier: { title: 'optionsClassifier', hint: 'optionsClassifierHint', none: 'optionsClassifierNone', disabled: 'optionsClassifierDisabled', modelPlaceholder: 'optionsClassifierModelPlaceholder' },
  generator: { title: 'optionsGenerator', hint: 'optionsGeneratorHint', none: 'optionsGeneratorNone', disabled: 'optionsGeneratorDisabled', modelPlaceholder: 'optionsModelPlaceholder' },
} as const;

/** "Prova connessione" per ruolo: protocollo System One o compatibile OpenAI. */
const TEST = {
  classifier: (s: ProviderSettings, apiKey: string) => testSystemOneConnection({ label: '', baseUrl: s.baseUrl, model: s.model, apiKey }),
  generator: (s: ProviderSettings, apiKey: string) => testOpenAiConnection({ label: '', baseUrl: s.baseUrl, model: s.model, apiKey }),
};

interface ProviderSectionProps {
  role: ProviderRole;
  saved: ProviderSettings;
  onSaved: (settings: ProviderSettings) => void;
  /** Solo per il Generatore: lo stato di Gemini Nano, mostrato quando è scelto Nano. */
  nano?: ReactNode;
  /** Campi in più sotto il modello (es. la soglia del Classificatore). */
  extra?: ReactNode;
}

/**
 * Toglie il permesso host di un URL base non più usato. Classificatore e Generatore possono
 * condividere un host (es. entrambi su 127.0.0.1): il permesso resta finché uno dei due lo usa.
 */
async function releaseUnusedPermission(previousBaseUrl: string) {
  const previous = originPattern(previousBaseUrl);
  if (!previous) return;
  const { classifier, generator } = await loadSettings();
  const inUse = [classifier, generator].some((p) => !isLocalOnly(p) && originPattern(p.baseUrl) === previous);
  if (!inUse) await browser.permissions.remove({ origins: [previous] }).catch(() => {});
}

/** Sezione impostazioni di un provider: preset, URL base, modello, chiave API, Salva e Prova connessione. */
/** Nome del provider salvato, per l'etichetta in alto a destra della sezione. */
function savedLabel(role: ProviderRole, saved: ProviderSettings): string | null {
  if (saved.preset === 'none') return null;
  if (saved.preset === NANO_PRESET) return NANO_LABEL;
  return presetsOf(role)[saved.preset]?.label ?? t('optionsPresetCustom');
}

export function ProviderSection({ role, saved, onSaved, nano, extra }: ProviderSectionProps) {
  const text = TEXT[role];
  const presets = presetsOf(role);
  const [draft, setDraft] = useState(saved);
  const [apiKey, setApiKey] = useState('');
  const [permission, setPermission] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadApiKey(role).then(setApiKey);
  }, [role]);
  useEffect(() => {
    if (isProviderConfigured(role, saved)) hasHostPermission(saved.baseUrl).then(setPermission);
    else setPermission(null);
  }, [role, saved]);

  function choosePreset(preset: string) {
    setStatus(null);
    const p = presets[preset];
    setDraft(p ? { preset, baseUrl: p.baseUrl, model: p.model } : { ...draft, preset });
  }

  function save() {
    const local = isLocalOnly(draft);
    const origin = local ? null : originPattern(draft.baseUrl);
    if (!local && !origin) return setStatus({ kind: 'error', key: 'optionsGeneratorBadUrl' });
    // permissions.request va chiamato subito, dentro il gesto dell'utente, prima di ogni await.
    const granted = origin ? browser.permissions.request({ origins: [origin] }) : Promise.resolve(false);
    (async () => {
      await saveSettings({ [role]: draft });
      await saveApiKey(role, apiKey.trim());
      await releaseUnusedPermission(saved.baseUrl);
      const ok = await granted;
      setPermission(origin ? ok : null);
      onSaved(draft);
      if (draft.preset === 'none') setStatus({ kind: 'info', key: text.disabled });
      else if (draft.preset === NANO_PRESET) setStatus({ kind: 'ok', key: 'optionsSaved' });
      else if (!isProviderConfigured(role, draft)) setStatus({ kind: 'error', key: 'optionsGeneratorIncomplete' });
      else setStatus(ok ? { kind: 'ok', key: 'optionsSavedProvider' } : { kind: 'error', key: 'warning_no_permission', sub: providerLabel(role, draft) });
    })().catch((err) => {
      console.error('autoGroup:', err);
      setStatus({ kind: 'error', key: 'errorSaveSettings' });
    });
  }

  async function test() {
    setTesting(true);
    setStatus(null);
    try {
      await TEST[role]({ ...draft, baseUrl: draft.baseUrl.trim().replace(/\/+$/, '') }, apiKey.trim());
      setStatus({ kind: 'ok', key: 'optionsTestOk' });
    } catch (err) {
      const reason = err instanceof ProviderError ? err.reason : 'unreachable';
      setStatus({ kind: 'error', key: warningKey(reason), sub: providerLabel(role, draft) });
    } finally {
      setTesting(false);
    }
  }

  const local = isLocalOnly(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const active = savedLabel(role, saved);

  return (
    <Card
      id={role}
      title={t(text.title)}
      hint={t(text.hint)}
      aside={<span className={`status-badge${active ? ' on' : ''}`}>{active ?? t('optionsStatusOff')}</span>}
    >
      <div className="form-row">
        <label className="form-label" htmlFor={`${role}-preset`}>
          {t('optionsPreset')}
        </label>
        <div className="form-control">
          <select id={`${role}-preset`} value={draft.preset} onChange={(e) => choosePreset(e.target.value)}>
            <option value="none">{t(text.none)}</option>
            {role === 'generator' && <option value={NANO_PRESET}>{t('optionsPresetNano')}</option>}
            {Object.entries(presets).map(([id, p]) => (
              <option key={id} value={id}>
                {p.label}
              </option>
            ))}
            <option value="custom">{t('optionsPresetCustom')}</option>
          </select>
          {draft.preset === NANO_PRESET && nano}
        </div>
      </div>
      {!local && (
        <>
          <div className="form-row">
            <label className="form-label" htmlFor={`${role}-url`}>
              {t('optionsBaseUrl')}
            </label>
            <div className="form-control">
              <input id={`${role}-url`} type="text" value={draft.baseUrl} placeholder="https://…" onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor={`${role}-model`}>
              {t('optionsModel')}
            </label>
            <div className="form-control">
              <input id={`${role}-model`} type="text" value={draft.model} placeholder={t(text.modelPlaceholder)} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor={`${role}-key`}>
              {t('optionsApiKey')}
            </label>
            <div className="form-control">
              <input
                id={`${role}-key`}
                type="password"
                value={apiKey}
                autoComplete="off"
                placeholder={t('optionsApiKeyPlaceholder')}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="hint">{t('optionsApiKeyHint')}</p>
            </div>
          </div>
        </>
      )}
      <div className="actions">
        <button onClick={save}>{t('optionsSaveProvider')}</button>
        {!local && (
          <button className="secondary" onClick={test} disabled={testing || !isProviderConfigured(role, draft)}>
            {testing ? t('optionsTesting') : t('optionsTestConnection')}
          </button>
        )}
        {dirty && <span className="hint unsaved">{t('optionsUnsaved')}</span>}
      </div>
      {status && <p className={`hint ${status.kind === 'error' ? 'error' : status.kind === 'ok' ? 'ok' : ''}`}>{t(status.key, status.sub)}</p>}
      {!status && permission === false && <p className="hint error">{t('warning_no_permission', providerLabel(role, saved))}</p>}
      {extra && <div className="extra">{extra}</div>}
    </Card>
  );
}
