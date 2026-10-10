import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { loadSettings, resetCategories, saveSettings, SettingsError, type Settings } from '../../src/settings';
import { importSettings } from '../../src/settings/backup';
import { t } from '../../src/shared/i18n';
import { Icon } from '../../src/ui/Icon';
import { Card } from './Card';
import { BackupSection } from './BackupSection';
import { AutoGroupSection, CategoriesSection } from './CategoriesSection';
import { DescriptionsSection } from './DescriptionsSection';
import { ModeSection } from './ModeSection';
import { NanoStatus } from './NanoStatus';
import { ProviderSection } from './ProviderSection';
import { TabsSection } from './TabsSection';
import { ThresholdField } from './ThresholdField';
import { resolveHash, VIEWS, type ViewId } from './views';

/** Pagina Buy Me a Coffee dell'autore. */
const COFFEE_URL = 'https://www.buymeacoffee.com/SpatariuRares';

/** Per quanto resta visibile "Annulla" dopo un'eliminazione o un ripristino delle categorie, o un import. */
const UNDO_MS = 8000;

/** Un'azione che si può annullare: il testo della snackbar e i valori di prima delle impostazioni che ha cambiato. */
interface Undoable {
  text: string;
  before: Partial<Settings>;
}

/** La pagina indicata dall'indirizzo (#general, #categories, … o una sezione come #generator), seguita al cambio. */
function useView() {
  const [route, setRoute] = useState(() => resolveHash(location.hash));
  useEffect(() => {
    const onHash = () => setRoute(resolveHash(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [undoable, setUndoable] = useState<Undoable | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { view, section } = useView();

  // Lette dal vivo: anche il pannello le cambia (es. "Metti sempre qui" aggiunge un sito), e "Annulla" deve ripartire da quelle vere.
  useEffect(() => {
    const reload = () => loadSettings().then(setSettings);
    reload();
    const onChanged = (_changes: unknown, area: string) => area === 'sync' && reload();
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  // Cambiando pagina si riparte dall'alto; se l'indirizzo nomina una sezione (es. #generator dal pannello) si scorre lì.
  useEffect(() => {
    if (!settings) return;
    if (section) document.getElementById(section)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [view, section, settings === null]);

  function confirmSaved() {
    setSaveError(null);
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1500);
  }

  /** Mostra "Annulla" per qualche secondo; `before` sono categorie e siti prima dell'azione. */
  function offerUndo(text: string, before: Undoable['before']) {
    setUndoable({ text, before });
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoable(null), UNDO_MS);
  }

  async function undo() {
    if (!undoable) return;
    clearTimeout(undoTimer.current);
    setUndoable(null);
    // Categorie e siti insieme: eliminando una categoria il salvataggio ha tolto anche i suoi siti.
    await update(undoable.before);
  }

  async function update(patch: Partial<Settings>) {
    try {
      await saveSettings(patch);
    } catch (err) {
      console.error('autoGroup:', err);
      setSaveError(err instanceof SettingsError ? err.messageKey : 'errorSaveSettings');
      return false;
    }
    setSettings(await loadSettings());
    confirmSaved();
    return true;
  }

  if (!settings) return null;
  const title = VIEWS.find((v) => v.id === view)!.title;

  return (
    <div className="layout">
      <nav className="sidebar" aria-label={t('optionsTitle')}>
        <div className="brand">
          <img src="/icon/32.png" alt="" width={24} height={24} />
          <span>autoGroup</span>
        </div>
        <ul>
          {VIEWS.map((v) => (
            <li key={v.id}>
              <a href={`#${v.id}`} aria-current={v.id === view ? 'page' : undefined}>
                <Icon name={v.icon} />
                <span>{t(v.title)}</span>
                {v.id === 'ai' && settings.mode !== 'ai' && <span className="nav-badge">{t('optionsNavAiOff')}</span>}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main>
        <header className="page-header">
          <h1>{t(title)}</h1>
        </header>
        {saveError && (
          <p className="banner error" role="alert">
            {t(saveError)}
          </p>
        )}

        {view === 'general' && (
          <GeneralView
            settings={settings}
            update={update}
            onImport={async (text) => {
              const patch = await importSettings(text);
              const before = Object.fromEntries(Object.keys(patch).map((key) => [key, settings[key as keyof Settings]])) as Partial<Settings>;
              setSettings(await loadSettings());
              offerUndo(t('optionsImported'), before);
            }}
          />
        )}
        {view === 'categories' && (
          <>
            <CategoriesSection
              categories={settings.categories}
              sites={settings.categorySites}
              onChange={(categories) => update({ categories })}
              onSitesChange={(categorySites) => update({ categorySites })}
              onReset={async () => {
                const before = { categories: settings.categories, categorySites: settings.categorySites };
                const categories = await resetCategories();
                setSettings((current) => (current ? { ...current, categories, categorySites: {} } : current));
                offerUndo(t('optionsCategoriesReset'), before);
              }}
              onDeleted={(category) =>
                offerUndo(t('optionsCategoryDeleted', category.name), { categories: settings.categories, categorySites: settings.categorySites })
              }
            />
            <AutoGroupSection enabled={settings.autoGroupSites} onChange={(autoGroupSites) => update({ autoGroupSites })} />
          </>
        )}
        {view === 'ai' && (
          <AiView
            settings={settings}
            update={update}
            onProviderSaved={(patch) => {
              setSettings((current) => (current ? { ...current, ...patch } : current));
              confirmSaved();
            }}
          />
        )}
        {view === 'about' && <AboutView />}
      </main>
      {/* Sempre visibili, anche lontano dalla cima della pagina. "Annulla" prende il posto di "Salvato". */}
      {undoable && (
        <div className="snackbar" role="status">
          <span>{undoable.text}</span>
          <button className="text small inverse" onClick={undo}>
            {t('optionsUndo')}
          </button>
        </div>
      )}
      <div className={`saved${saved && !undoable ? ' visible' : ''}`} role="status">
        {saved && !undoable && (
          <>
            <Icon name="check" size={18} />
            {t('optionsSaved')}
          </>
        )}
      </div>
    </div>
  );
}

type Update = (patch: Partial<Settings>) => Promise<boolean>;

/** Generale: come raggruppare e quali tab organizzare. */
function GeneralView({ settings, update, onImport }: { settings: Settings; update: Update; onImport: (text: string) => Promise<void> }) {
  return (
    <>
      <ModeSection mode={settings.mode} onChange={(mode) => update({ mode })} />
      <TabsSection
        minTabs={settings.minTabs}
        onMinTabs={(minTabs) => update({ minTabs })}
        excludedDomains={settings.excludedDomains}
        onExcludedDomains={(excludedDomains) => update({ excludedDomains })}
      />
      <BackupSection settings={settings} onImport={onImport} />
    </>
  );
}

/**
 * AI: prima il Generatore, che basta da solo, poi la lettura delle descrizioni e il Classificatore
 * facoltativo. Nella modalità per sito la pagina resta nel menu e spiega come accendere l'AI.
 */
function AiView({ settings, update, onProviderSaved }: { settings: Settings; update: Update; onProviderSaved: (patch: Partial<Settings>) => void }) {
  if (settings.mode !== 'ai') {
    return (
      <div className="banner">
        <Icon name="info" />
        <span>{t('optionsModeDomainNote')}</span>
        <button className="tonal" onClick={() => update({ mode: 'ai' })}>
          {t('optionsUseAi')}
        </button>
      </div>
    );
  }
  return (
    <>
      <ProviderSection role="generator" saved={settings.generator} nano={<NanoStatus />} onSaved={(generator) => onProviderSaved({ generator })} />
      <DescriptionsSection enabled={settings.readDescriptions} onChange={(readDescriptions) => update({ readDescriptions })} />
      <ProviderSection
        role="classifier"
        saved={settings.classifier}
        onSaved={(classifier) => onProviderSaved({ classifier })}
        extra={<ThresholdField threshold={settings.threshold} onChange={(threshold) => update({ threshold })} />}
      />
    </>
  );
}

/**
 * Informazioni: guida, versione e "Offrimi un caffè". Il pulsante è locale, nello stile di Buy Me a
 * Coffee: l'immagine ufficiale verrebbe scaricata dal loro sito a ogni apertura della pagina.
 */
function AboutView() {
  return (
    <Card id="about-card" title="autoGroup" hint={t('optionsVersion', browser.runtime.getManifest().version)}>
      <div className="extra-links">
        <a className="guide-link" href="/onboarding.html" target="_blank">
          {t('optionsOnboarding')}
        </a>
        <a className="coffee" href={COFFEE_URL} target="_blank" rel="noopener noreferrer">
          <span aria-hidden="true">✈️</span>
          {t('optionsCoffee')}
        </a>
      </div>
    </Card>
  );
}
