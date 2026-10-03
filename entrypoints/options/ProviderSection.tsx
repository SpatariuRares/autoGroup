import { useEffect, useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { testOpenAiConnection } from '../../src/ai/openai-generator';
import { testSystemOneConnection } from '../../src/ai/systemone-classifier';
import { ProviderError } from '../../src/ai/types';
import {
  hasHostPermission,
  loadSettings,
  isProviderConfigured,
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

type Status = { kind: 'ok' | 'error' | 'info'; key: string; sub?: string } | null;

/** Testi che cambiano tra Classificatore e Generatore. */
const TEXT = {
  classifier: { title: 'optionsClassifier', hint: 'optionsClassifierHint', none: 'optionsClassifierNone', disabled: 'optionsClassifierDisabled', modelPlaceholder: 'optionsClassifierModelPlaceholder' },
  generator: { title: 'optionsGenerator', hint: 'optionsGeneratorHint', none: 'optionsPresetNone', disabled: 'optionsGeneratorDisabled', modelPlaceholder: 'optionsModelPlaceholder' },
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
  /** Contenuto mostrato quando non c'è un provider (es. lo stato di Gemini Nano). */
  whenNone?: ReactNode;
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
  const inUse = [classifier, generator].some((p) => p.preset !== 'none' && originPattern(p.baseUrl) === previous);
  if (!inUse) await browser.permissions.remove({ origins: [previous] }).catch(() => {});
}

/** Sezione impostazioni di un provider: preset, URL base, modello, chiave API, Salva e Prova connessione. */
export function ProviderSection({ role, saved, onSaved, whenNone, extra }: ProviderSectionProps) {
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
    const origin = draft.preset === 'none' ? null : originPattern(draft.baseUrl);
    if (draft.preset !== 'none' && !origin) return setStatus({ kind: 'error', key: 'optionsGeneratorBadUrl' });
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

  const none = draft.preset === 'none';
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  return (
    <section id={role}>
      <h2>{t(text.title)}</h2>
      <p className="hint">{t(text.hint)}</p>
      <label className="field">
        <span>{t('optionsPreset')}</span>
        <select value={draft.preset} onChange={(e) => choosePreset(e.target.value)}>
          <option value="none">{t(text.none)}</option>
          {Object.entries(presets).map(([id, p]) => (
            <option key={id} value={id}>
              {p.label}
            </option>
          ))}
          <option value="custom">{t('optionsPresetCustom')}</option>
        </select>
      </label>
      {none && whenNone}
      {!none && (
        <>
          <label className="field">
            <span>{t('optionsBaseUrl')}</span>
            <input type="text" className="wide" value={draft.baseUrl} placeholder="https://…" onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} />
          </label>
          <label className="field">
            <span>{t('optionsModel')}</span>
            <input type="text" className="wide" value={draft.model} placeholder={t(text.modelPlaceholder)} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
          </label>
          <label className="field">
            <span>{t('optionsApiKey')}</span>
            <input type="password" className="wide" value={apiKey} autoComplete="off" placeholder={t('optionsApiKeyPlaceholder')} onChange={(e) => setApiKey(e.target.value)} />
          </label>
          <p className="hint">{t('optionsApiKeyHint')}</p>
        </>
      )}
      <div className="row actions">
        <button onClick={save}>{t('optionsSaveProvider')}</button>
        {!none && (
          <button className="secondary" onClick={test} disabled={testing || !isProviderConfigured(role, draft)}>
            {testing ? t('optionsTesting') : t('optionsTestConnection')}
          </button>
        )}
      </div>
      {dirty && <p className="hint">{t('optionsUnsaved')}</p>}
      {status && <p className={`hint ${status.kind === 'error' ? 'error' : status.kind === 'ok' ? 'ok' : ''}`}>{t(status.key, status.sub)}</p>}
      {!status && permission === false && <p className="hint error">{t('warning_no_permission', providerLabel(role, saved))}</p>}
      {extra}
    </section>
  );
}
