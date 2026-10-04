import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { NANO_LABEL, nanoAvailability, type NanoAvailability } from '../../src/ai/nano-generator';
import { loadSettings, NANO_PRESET, saveSettings, type GroupingMode, type Settings } from '../../src/settings';
import { t } from '../../src/shared/i18n';
import { onboardingSteps, type OnboardingStep } from '../../src/shared/onboarding';
import { Icon } from '../../src/ui/Icon';
import { providerName } from '../../src/ui/provider-name';
import { ModeSection } from '../options/ModeSection';
import { NanoStatus } from '../options/NanoStatus';
import { ProviderSection } from '../options/ProviderSection';
import { ThresholdField } from '../options/ThresholdField';

/**
 * Guida al primo avvio: cosa fa autoGroup, la modalità, il Generatore, il Classificatore facoltativo
 * e un riepilogo dei livelli di ripiego. Riusa le sezioni delle impostazioni, quindi ogni scelta è
 * salvata subito come lì, e i permessi host vengono chiesti dentro il clic su "Salva".
 */
export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  if (!settings) return null;
  const steps = onboardingSteps(settings.mode);
  // Passando a "Per sito" i passi diminuiscono: si resta comunque dentro l'elenco.
  const current = Math.min(index, steps.length - 1);
  const step = steps[current]!;
  const last = current === steps.length - 1;

  function go(next: number) {
    setIndex(next);
    window.scrollTo(0, 0);
  }

  async function chooseMode(mode: GroupingMode) {
    await saveSettings({ mode });
    setSettings((s) => (s ? { ...s, mode } : s));
  }

  const update = (patch: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  return (
    <div className="onboarding">
      <header className="onboarding-header">
        <div className="brand">
          <img src="/icon/32.png" alt="" width={24} height={24} />
          <span>autoGroup</span>
        </div>
        <span className="step-count">{t('onboardingStepCount', [String(current + 1), String(steps.length)])}</span>
      </header>
      <progress className="onboarding-progress" max={steps.length} value={current + 1} aria-hidden="true" />

      <main className={`step step-${step}`}>
        <StepContent
          step={step}
          settings={settings}
          onMode={chooseMode}
          onGenerator={(generator) => update({ generator })}
          onClassifier={(classifier) => update({ classifier })}
          onThreshold={async (threshold) => {
            await saveSettings({ threshold });
            update({ threshold });
          }}
        />
      </main>

      <footer className="onboarding-nav">
        {current > 0 && (
          <button className="text" onClick={() => go(current - 1)}>
            {t('onboardingBack')}
          </button>
        )}
        <span className="spacer" />
        {!last && current > 0 && (
          <button className="text" onClick={() => go(steps.length - 1)}>
            {t('onboardingSkip')}
          </button>
        )}
        {!last && (
          <button className="next" onClick={() => go(current + 1)}>
            {t(current === 0 ? 'onboardingStart' : 'onboardingNext')}
          </button>
        )}
      </footer>
    </div>
  );
}

interface StepProps {
  step: OnboardingStep;
  settings: Settings;
  onMode: (mode: GroupingMode) => unknown;
  onGenerator: (generator: Settings['generator']) => void;
  onClassifier: (classifier: Settings['classifier']) => void;
  onThreshold: (threshold: number) => unknown;
}

function StepContent({ step, settings, onMode, onGenerator, onClassifier, onThreshold }: StepProps) {
  switch (step) {
    case 'welcome':
      return <Welcome />;
    case 'mode':
      return (
        <>
          <h1>{t('onboardingModeTitle')}</h1>
          <p className="lead">{t('onboardingModeText')}</p>
          <ModeSection mode={settings.mode} onChange={onMode} />
        </>
      );
    case 'generator':
      return (
        <>
          <h1>{t('onboardingGeneratorTitle')}</h1>
          <p className="lead">{t('onboardingGeneratorText')}</p>
          <ul className="choices">
            <Choice icon="check" title={NANO_LABEL} text={t('onboardingGeneratorNanoText')} />
            <Choice icon="lock" title={t('onboardingGeneratorLocal')} text={t('onboardingGeneratorLocalText')} />
            <Choice icon="language" title={t('onboardingGeneratorCloud')} text={t('onboardingGeneratorCloudText')} />
          </ul>
          <p className="lead">{t('onboardingGeneratorDefault')}</p>
          <ProviderSection role="generator" saved={settings.generator} nano={<NanoStatus />} onSaved={onGenerator} />
        </>
      );
    case 'classifier':
      return (
        <>
          <h1>{t('onboardingClassifierTitle')}</h1>
          <p className="lead">{t('onboardingClassifierText')}</p>
          <ProviderSection
            role="classifier"
            saved={settings.classifier}
            onSaved={onClassifier}
            extra={<ThresholdField threshold={settings.threshold} onChange={onThreshold} />}
          />
        </>
      );
    case 'done':
      return <Done settings={settings} />;
  }
}

function Choice({ icon, title, text }: { icon: 'check' | 'lock' | 'language'; title: string; text: string }) {
  return (
    <li className="choice">
      <span className="mode-icon">
        <Icon name={icon} />
      </span>
      <span className="mode-text">
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
    </li>
  );
}

/** Primo passo: cosa fa l'estensione e come si apre, con la scorciatoia assegnata davvero da Chrome. */
function Welcome() {
  const [shortcut, setShortcut] = useState<string | null>(null);
  useEffect(() => {
    browser.commands
      .getAll()
      .then((commands) => setShortcut(commands.find((c) => c.name === '_execute_action')?.shortcut || ''))
      .catch(() => setShortcut(''));
  }, []);

  return (
    <>
      <h1>{t('onboardingWelcomeTitle')}</h1>
      <p className="lead">{t('onboardingWelcomeText')}</p>
      {shortcut !== null && <p className="lead">{shortcut ? t('onboardingWelcomeShortcut', shortcut) : t('onboardingWelcomeNoShortcut')}</p>}
      <p className="lead">{t('onboardingWelcomeSetup')}</p>
    </>
  );
}

/**
 * Ultimo passo: come verrà fatta la proposta, livello per livello, e dove cambiare le scelte.
 * "Apri il pannello" chiama `sidePanel.open` dentro il clic, come chiede Chrome.
 */
function Done({ settings }: { settings: Settings }) {
  const [windowId, setWindowId] = useState<number | null>(null);
  const [nano, setNano] = useState<NanoAvailability | null>(null);
  const usesNano = settings.mode === 'ai' && settings.generator.preset === NANO_PRESET;

  useEffect(() => {
    browser.windows.getCurrent().then((w) => setWindowId(w.id ?? null));
  }, []);
  useEffect(() => {
    if (usesNano) nanoAvailability().then(setNano);
  }, [usesNano]);

  const off = t('optionsStatusOff');
  return (
    <>
      <h1>{t('onboardingDoneTitle')}</h1>
      {settings.mode === 'domain' ? (
        <p className="lead">{t('onboardingDoneDomain')}</p>
      ) : (
        <>
          <p className="lead">{t('onboardingDonePlan')}</p>
          <ol className="levels">
            <li>
              <strong>{t('optionsClassifier')}</strong>
              <span>{providerName('classifier', settings.classifier) ?? off}</span>
            </li>
            <li>
              <strong>{t('optionsGenerator')}</strong>
              <span>
                {providerName('generator', settings.generator) ?? off}
                {usesNano && nano && nano !== 'available' && <em className="hint error"> {t(`nanoStatus_${nano}`)}</em>}
              </span>
            </li>
            <li>
              <strong>{t('optionsModeDomain')}</strong>
              <span>{t('onboardingDoneDomainLevel')}</span>
            </li>
          </ol>
          <p className="lead">{t('onboardingDoneFallback')}</p>
          <p className="lead">{t('onboardingDonePrivacy')}</p>
        </>
      )}
      <div className="actions">
        {windowId !== null && (
          <button onClick={() => browser.sidePanel.open({ windowId }).catch((err) => console.error('autoGroup:', err))}>
            <Icon name="tab" size={18} />
            {t('onboardingOpenPanel')}
          </button>
        )}
        <button className="secondary" onClick={() => browser.runtime.openOptionsPage()}>
          <Icon name="settings" size={18} />
          {t('onboardingOpenSettings')}
        </button>
      </div>
    </>
  );
}
