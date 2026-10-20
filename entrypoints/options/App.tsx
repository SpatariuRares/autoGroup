import { useEffect, useRef, useState, type ComponentType } from 'react';
import { t } from '../../src/shared/i18n';
import { useFocusRecovery } from '../../src/ui/focus-recovery';
import { Icon } from '../../src/ui/Icon';
import { Snackbar } from '../../src/ui/Snackbar';
import { useSettings } from '../../src/ui/use-settings';
import { AboutView } from './AboutView';
import { AiView } from './AiView';
import { CategoriesView } from './CategoriesView';
import { GeneralView } from './GeneralView';
import { useSave, type PageProps } from './use-save';
import { resolveHash, VIEWS, type ViewId } from './views';

/** Il contenuto di ogni pagina del menu: una pagina nuova va aggiunta qui e in `VIEWS`. */
const PAGES: Record<ViewId, ComponentType<PageProps>> = {
  general: GeneralView,
  categories: CategoriesView,
  ai: AiView,
  about: AboutView,
};

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
  // Lette dal vivo: anche il pannello le cambia (es. "Metti sempre qui" aggiunge un sito), e "Annulla" deve ripartire da quelle vere.
  const [settings, setSettings] = useSettings();
  const saving = useSave(setSettings);
  const { view, section } = useView();
  const rememberFocus = useFocusRecovery('.chip, .category');

  const heading = useRef<HTMLHeadingElement>(null);
  const shownView = useRef<ViewId | null>(null);
  const title = VIEWS.find((v) => v.id === view)!.title;

  // Cambiando pagina si riparte dall'alto; se l'indirizzo nomina una sezione (es. #generator dal pannello) si scorre lì.
  // Il titolo della scheda nomina la pagina, e il focus va sul suo h1: lo screen reader annuncia dove si è arrivati.
  useEffect(() => {
    if (!settings) return;
    document.title = `${t(title)} – ${t('optionsTitle')}`;
    if (shownView.current !== null && shownView.current !== view) heading.current?.focus({ preventScroll: true });
    shownView.current = view;
    if (section) document.getElementById(section)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [view, section, settings === null]);

  if (!settings) return null;
  const Page = PAGES[view];

  return (
    <div className="layout" onClickCapture={rememberFocus} onChangeCapture={rememberFocus}>
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
          <h1 ref={heading} tabIndex={-1}>
            {t(title)}
          </h1>
        </header>
        {saving.error && (
          <p className="banner error" role="alert">
            {t(saving.error)}
          </p>
        )}
        <Page settings={settings} saving={saving} />
      </main>
      {/* Sempre visibili, anche lontano dalla cima della pagina. "Annulla" prende il posto di "Salvato". */}
      {/* Regione live sempre presente: la snackbar che ci compare dentro viene letta. */}
      <div role="status">
        {saving.undoable && <Snackbar text={saving.undoable.text} action={{ label: t('optionsUndo'), onClick: saving.undo }} hold={saving.holdUndo} />}
      </div>
      <div className={`saved${saving.saved ? ' visible' : ''}`} role="status">
        {saving.saved && (
          <>
            <Icon name="check" size={18} />
            {t('optionsSaved')}
          </>
        )}
      </div>
    </div>
  );
}
