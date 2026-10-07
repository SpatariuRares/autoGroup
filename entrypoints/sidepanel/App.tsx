import { useEffect, useMemo, useRef, useState } from 'react';
import { browser, type Browser } from 'wxt/browser';
import { buildWindowView, type ExistingGroupView, type HeldReason } from '../../src/organizer/window-view';
import { categoryKey, loadSettings, saveSettings, type GroupingMode, type Settings } from '../../src/settings';
import { siteToRemember } from '../../src/organizer/site-rules';
import { t, warningKey } from '../../src/shared/i18n';
import { callOrganizer, onOrganizerState } from '../../src/shared/organizer-client';
import { GROUP_COLORS, type OrganizerState, type ProposalEdit, type ProposedGroup, type ProposedTab } from '../../src/shared/types';
import { Icon } from '../../src/ui/Icon';
import { providerName } from '../../src/ui/provider-name';

/** "1 tab" / "3 tab": chrome.i18n non ha i plurali, quindi il singolare ha una chiave sua. */
const tabCount = (n: number) => (n === 1 ? t('popupTabCountOne') : t('popupTabCount', String(n)));
const addedCount = (n: number) => (n === 1 ? t('panelAddedCountOne') : t('panelAddedCount', String(n)));

/** Apre le impostazioni sulla sezione indicata. */
function openSettings(section: 'generator' | 'classifier' | 'categories' | 'mode') {
  browser.tabs.create({ url: browser.runtime.getURL(`/options.html#${section}`) });
}

/**
 * Tab e gruppi della finestra letti dal vivo, per mostrare tutta la finestra e non solo la proposta.
 * `onChange` scatta solo per i cambi che rendono vecchia una proposta (tab aperte, chiuse, spostate,
 * URL, fissaggio, gruppi), non per titoli o favicon che cambiano da soli.
 */
function useWindowSnapshot(windowId: number | null, onChange: (closedTabId?: number) => void) {
  const [snapshot, setSnapshot] = useState<{ tabs: Browser.tabs.Tab[]; groups: Browser.tabGroups.TabGroup[] }>({ tabs: [], groups: [] });
  const changed = useRef(onChange);
  changed.current = onChange;

  useEffect(() => {
    if (windowId === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const [tabs, groups] = await Promise.all([browser.tabs.query({ windowId }), browser.tabGroups.query({ windowId })]);
        setSnapshot({ tabs, groups });
      }, 100);
    };
    const structural = (closedTabId?: number) => {
      changed.current(closedTabId);
      refresh();
    };
    const inWindow = (x?: { windowId?: number }) => x?.windowId === windowId;
    const onCreated = (tab: { windowId?: number }) => inWindow(tab) && structural();
    const onRemoved = (id: number, info: { windowId: number }) => info.windowId === windowId && structural(id);
    const onUpdated = (_id: number, change: { url?: string; pinned?: boolean; groupId?: number }, tab: { windowId?: number }) => {
      if (!inWindow(tab)) return;
      if (change.url !== undefined || change.pinned !== undefined || change.groupId !== undefined) structural();
      else refresh();
    };
    const onMovedBetween = (_id: number, info: { newWindowId?: number; oldWindowId?: number }) =>
      (info.newWindowId === windowId || info.oldWindowId === windowId) && structural();
    const onMoved = (_id: number, info: { windowId: number }) => info.windowId === windowId && refresh();
    const onGroup = (group: { windowId?: number }) => inWindow(group) && structural();

    refresh();
    browser.tabs.onCreated.addListener(onCreated);
    browser.tabs.onRemoved.addListener(onRemoved);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onMoved.addListener(onMoved);
    browser.tabs.onAttached.addListener(onMovedBetween);
    browser.tabs.onDetached.addListener(onMovedBetween);
    browser.tabGroups.onCreated.addListener(onGroup);
    browser.tabGroups.onUpdated.addListener(onGroup);
    browser.tabGroups.onRemoved.addListener(onGroup);
    return () => {
      clearTimeout(timer);
      browser.tabs.onCreated.removeListener(onCreated);
      browser.tabs.onRemoved.removeListener(onRemoved);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onMoved.removeListener(onMoved);
      browser.tabs.onAttached.removeListener(onMovedBetween);
      browser.tabs.onDetached.removeListener(onMovedBetween);
      browser.tabGroups.onCreated.removeListener(onGroup);
      browser.tabGroups.onUpdated.removeListener(onGroup);
      browser.tabGroups.onRemoved.removeListener(onGroup);
    };
  }, [windowId]);

  return snapshot;
}

/** Impostazioni lette dal vivo: il selettore della modalità e il riepilogo dei provider le seguono. */
function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    const reload = () => loadSettings().then(setSettings);
    reload();
    const onChanged = (_changes: unknown, area: string) => area === 'sync' && reload();
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);
  return settings;
}

/** Dove può andare una tab: un gruppo della proposta ("p:id") o un gruppo aperto non ancora toccato ("c:id"). */
interface Target {
  value: string;
  label: string;
  to: Extract<ProposalEdit, { kind: 'add-tab' }>['to'];
}

/** "Metti sempre qui" proposto dopo uno spostamento: la tab, il sito che verrebbe salvato e la categoria. */
interface RememberOffer {
  tabId: number;
  site: string;
  category: string;
}

/**
 * Dopo aver messo una tab in un gruppo che è una categoria (della lista o un gruppo aperto con lo
 * stesso nome), il sito che "Metti sempre qui" salverebbe. Nessuna offerta se ci va già.
 */
function rememberOffer(state: OrganizerState, tabId: number, settings: Settings | null): RememberOffer | null {
  const group = state.proposal?.groups.find((g) => g.tabs.some((t) => t.tabId === tabId));
  if (!settings || !group || (group.provenance !== 'list' && group.provenance !== 'existing')) return null;
  const category = settings.categories.find((c) => categoryKey(c.name) === categoryKey(group.name));
  const tab = group.tabs.find((t) => t.tabId === tabId)!;
  const site = siteToRemember(tab.url, settings.categories, settings.categorySites);
  if (!category || !site || settings.categorySites[category.id]?.includes(site)) return null;
  return { tabId, site, category: category.name };
}

/** Per quanto resta visibile l'offerta "Metti sempre qui". */
const OFFER_MS = 8000;

export function App() {
  const [state, setState] = useState<OrganizerState | null>(null);
  const [windowId, setWindowId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<'popupApplied' | 'popupUndone' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [offer, setOffer] = useState<RememberOffer | null>(null);
  useEffect(() => {
    if (!offer) return;
    const timer = setTimeout(() => setOffer(null), OFFER_MS);
    return () => clearTimeout(timer);
  }, [offer]);
  const settings = useSettings();
  // Letta dall'ascoltatore: l'annuncio dell'anteprima può arrivare prima che React aggiorni `windowId`.
  const currentWindow = useRef<number | null>(null);

  useEffect(() => {
    // Lo stato è unico per tutte le finestre: si mostrano solo gli aggiornamenti di questa.
    return onOrganizerState((next) => {
      if (currentWindow.current !== null && next.windowId === currentWindow.current) setState(next);
    });
  }, []);

  useEffect(() => {
    (async () => {
      const win = await browser.windows.getCurrent();
      currentWindow.current = win.id!;
      setWindowId(win.id!);
      setState(await callOrganizer({ type: 'organizer/propose', windowId: win.id! }));
    })().catch((err) => {
      console.error(err);
      setState({ phase: 'idle', error: 'errorPropose' });
    });
  }, []);

  const proposal = state?.phase === 'ready' && state.windowId === windowId ? state.proposal : undefined;
  const canUndo = state?.undo !== undefined && state.undo.windowId === windowId;
  const computing = !state || state.phase === 'computing';
  // Proposta per sito mostrata in sola lettura mentre l'AI calcola.
  const preview = state?.phase === 'computing' && state.windowId === windowId ? state.preview : undefined;
  const readOnly = !proposal && preview !== undefined;

  // "Applica" e "Annulla" cambiano le tab: in quel momento la proposta non c'è più, quindi nessun avviso.
  // Le tab chiuse dal pannello sono già tolte dalla proposta dall'Organizzatore: non la rendono vecchia.
  const closing = useRef(new Set<number>());
  const snapshot = useWindowSnapshot(windowId, (closedTabId) => {
    if (closedTabId !== undefined && closing.current.delete(closedTabId)) return;
    if (!busy) setStale(true);
  });
  const view = useMemo(
    () => buildWindowView(snapshot.tabs, snapshot.groups, proposal ?? preview, settings?.excludedDomains ?? []),
    [snapshot, proposal, preview, settings?.excludedDomains],
  );

  async function run(request: Parameters<typeof callOrganizer>[0], after?: () => void) {
    setBusy(true);
    setFailure(null);
    try {
      setState(await callOrganizer(request));
      after?.();
    } catch (err) {
      console.error('autoGroup:', err);
      setFailure('errorUnexpected');
    } finally {
      setBusy(false);
    }
  }

  async function edit(change: ProposalEdit): Promise<OrganizerState | null> {
    setFailure(null);
    try {
      const next = await callOrganizer({ type: 'organizer/edit', edit: change });
      setState(next);
      return next;
    } catch (err) {
      console.error('autoGroup:', err);
      setFailure('errorUnexpected');
      return null;
    }
  }

  function recompute() {
    if (windowId === null) return;
    setNotice(null);
    setOffer(null);
    setStale(false);
    run({ type: 'organizer/propose', windowId, force: true });
  }

  async function chooseMode(mode: GroupingMode) {
    if (!settings || settings.mode === mode) return;
    await saveSettings({ mode });
    recompute();
  }

  // Destinazioni per "Sposta in…": gruppi della proposta e gruppi aperti non ancora toccati.
  const targets: Target[] = proposal
    ? [
        ...proposal.groups.map((g) => ({ value: `p:${g.id}`, label: g.name || t('popupUnnamed'), to: { groupId: g.id } })),
        ...view.existing
          .filter((e) => !e.proposedGroupId)
          .map((e) => ({ value: `c:${e.group.id}`, label: e.group.name || t('popupUnnamed'), to: { existingGroup: e.group } })),
      ]
    : [];
  function closeTab(tabId: number) {
    closing.current.add(tabId);
    setFailure(null);
    callOrganizer({ type: 'organizer/close-tab', tabId })
      .then(setState)
      .catch((err) => {
        closing.current.delete(tabId);
        console.error('autoGroup:', err);
        setFailure('errorUnexpected');
      });
  }

  const moveTab = async (tab: ProposedTab, value: string) => {
    const target = targets.find((x) => x.value === value);
    if (!target) return;
    const next = await edit({ kind: 'add-tab', tab, to: target.to });
    setOffer(next ? rememberOffer(next, tab.tabId, settings) : null);
  };

  // Senza proposta (es. dopo "Applica") le tab libere vanno subito in un gruppo aperto. Non durante il calcolo.
  const directTargets: Target[] =
    !proposal && !computing ? view.existing.map((e) => ({ value: `c:${e.group.id}`, label: e.group.name || t('popupUnnamed'), to: { existingGroup: e.group } })) : [];
  const freeTargets = proposal ? targets : directTargets;
  const groupTab = (tab: ProposedTab, value: string) => {
    const target = directTargets.find((x) => x.value === value);
    if (!target || !('existingGroup' in target.to)) return;
    setFailure(null);
    callOrganizer({ type: 'organizer/group-tab', tabId: tab.tabId, groupId: target.to.existingGroup.id })
      .then(setState)
      .catch((err) => {
        console.error('autoGroup:', err);
        setFailure('errorUnexpected');
      });
  };

  const message = failure ?? state?.error;
  const touched = view.existing.filter((e) => e.added.length > 0);
  const untouched = view.existing.filter((e) => e.added.length === 0);

  return (
    <div className="panel">
      <header className="top-app-bar">
        <h1>{t('popupTitle')}</h1>
        <button className="icon" title={t('popupOpenSettings')} aria-label={t('popupOpenSettings')} onClick={() => browser.runtime.openOptionsPage()}>
          <Icon name="settings" />
        </button>
      </header>

      {settings && (
        <div className="mode-picker">
          <div className="segmented" role="radiogroup" aria-label={t('optionsMode')}>
            {(['domain', 'ai'] as const).map((mode) => (
              <button
                key={mode}
                role="radio"
                aria-checked={settings.mode === mode}
                className={settings.mode === mode ? 'selected' : ''}
                disabled={computing || busy}
                onClick={() => chooseMode(mode)}
              >
                {settings.mode === mode ? <Icon name="check" size={18} /> : <Icon name={mode === 'domain' ? 'language' : 'category'} size={18} />}
                {t(mode === 'domain' ? 'panelModeSite' : 'panelModeAi')}
              </button>
            ))}
          </div>
          <ProviderSummary settings={settings} />
        </div>
      )}

      {computing && (
        <div className="status computing" role="status">
          <div className="md-linear-progress" />
          <div className="status-row">
            <span>{t(preview ? 'panelPreviewComputing' : 'popupComputing')}</span>
            {state?.phase === 'computing' && (
              <span className="status-actions">
                {preview && preview.groups.length > 0 && (
                  <button className="text small accept-preview" onClick={() => callOrganizer({ type: 'organizer/accept-preview' }).then(setState).catch(console.error)}>
                    <Icon name="check" size={18} />
                    {t('panelUsePreview')}
                  </button>
                )}
                <button className="text small abort" onClick={() => callOrganizer({ type: 'organizer/abort' }).then(setState).catch(console.error)}>
                  <Icon name="stop" size={18} />
                  {t('popupAbort')}
                </button>
              </span>
            )}
          </div>
        </div>
      )}

      <div className="content">
        {message && (
          <p className="banner error" role="alert">
            <Icon name="warning" />
            <span>{t(message)}</span>
          </p>
        )}

        {proposal && stale && !computing && (
          <div className="banner stale" role="status">
            <Icon name="info" />
            <span>{t('panelStale')}</span>
            <button className="text small" onClick={recompute}>
              {t('popupRecompute')}
            </button>
          </div>
        )}

        {proposal && proposal.warnings.length > 0 && (
          <ul className="banner warnings" role="alert">
            {proposal.warnings.map((w, i) => (
              <li key={i}>
                <Icon name="warning" />
                <span>
                  {t('popupWarningFallback')} {t(warningKey(w.cause), w.provider)}{' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); openSettings(w.level); }}>
                    {t('popupWarningSettings')}
                  </a>
                </span>
              </li>
            ))}
          </ul>
        )}

        {!proposal && !computing && (state?.notice || notice) && (
          <p className="banner">
            <Icon name="info" />
            <span>{state?.notice ? t(state.notice.key, state.notice.arg) : t(notice!)}</span>
          </p>
        )}

        {proposal && view.created.length === 0 && touched.length === 0 && (
          <p className="banner">
            <Icon name="info" />
            <span>{t('popupNoGroups')}</span>
          </p>
        )}

        {view.created.length > 0 && (
          <Section title={t('panelSectionNew')} count={view.created.length}>
            <ul className="groups">
              {view.created.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  readOnly={readOnly}
                  targets={targets.filter((x) => x.value !== `p:${group.id}`)}
                  onMove={moveTab}
                  onEdit={edit}
                  onClose={closeTab}
                  onSave={() => run({ type: 'organizer/save-to-list', groupId: group.id })}
                  saving={busy}
                />
              ))}
            </ul>
          </Section>
        )}

        {view.existing.length > 0 && (
          <Section title={t('panelSectionExisting')} count={view.existing.length}>
            <ul className="groups">
              {[...touched, ...untouched].map((existing) => (
                <ExistingCard
                  key={existing.group.id}
                  existing={existing}
                  readOnly={readOnly}
                  targets={targets.filter((x) => x.value !== `p:${existing.proposedGroupId}` && x.value !== `c:${existing.group.id}`)}
                  onMove={moveTab}
                  onEdit={edit}
                  onClose={closeTab}
                />
              ))}
            </ul>
          </Section>
        )}

        {view.free.length > 0 && (
          <Section title={t('panelSectionFree')} count={view.free.length} hint={freeTargets.length > 0 ? t('panelFreeHint') : undefined}>
            <ul className="tabs card-list">
              {view.free.map((tab) => (
                <TabRow
                  key={tab.tabId}
                  tab={tab}
                  targets={freeTargets}
                  onMove={proposal ? moveTab : groupTab}
                  onClose={() => closeTab(tab.tabId)}
                />
              ))}
            </ul>
          </Section>
        )}

        {view.held.length > 0 && (
          <details className="section held">
            <summary>
              <span className="section-title">{t('panelSectionHeld')}</span>
              <span className="section-count">{view.held.length}</span>
            </summary>
            <ul className="tabs card-list">
              {view.held.map(({ tab, reason }) => (
                <TabRow key={tab.tabId} tab={tab} reason={reason} onClose={() => closeTab(tab.tabId)} />
              ))}
            </ul>
          </details>
        )}
      </div>

      {proposal && offer ? (
        <div className="snackbar" role="status">
          <span>{t('panelRememberSite', [offer.site, offer.category])}</span>
          <button
            className="text small inverse"
            onClick={() => {
              setOffer(null);
              run({ type: 'organizer/remember-site', tabId: offer.tabId });
            }}
          >
            {t('panelRememberSiteYes')}
          </button>
        </div>
      ) : (
        proposal &&
        state?.notice && (
          <div className="snackbar" role="status">
            <span>{t(state.notice.key, state.notice.arg)}</span>
            {state.notice.key === 'saveToListNoDescription' && (
              <button className="text small inverse" onClick={() => openSettings('categories')}>
                {t('popupWarningSettings')}
              </button>
            )}
          </div>
        )
      )}

      <footer className="bottom-bar">
        {canUndo && (
          <button className="text undo" disabled={busy} onClick={() => run({ type: 'organizer/undo' }, () => setNotice('popupUndone'))}>
            <Icon name="undo" size={18} />
            {t('popupUndo')}
          </button>
        )}
        <span className="spacer" />
        {windowId !== null && !computing && (
          <button className="secondary" disabled={busy} onClick={recompute}>
            <Icon name="refresh" size={18} />
            {t('popupRecompute')}
          </button>
        )}
        {proposal && proposal.groups.length > 0 && (
          <button
            className="apply"
            disabled={busy}
            onClick={() =>
              run({ type: 'organizer/apply' }, () => {
                setStale(false);
                setOffer(null);
                setNotice('popupApplied');
              })
            }
          >
            <Icon name="check" size={18} />
            {t('popupApply')}
          </button>
        )}
      </footer>
    </div>
  );
}

/** Riepilogo dei provider sotto il selettore: cosa verrà usato con la modalità scelta. */
function ProviderSummary({ settings }: { settings: Settings }) {
  if (settings.mode === 'domain') return <p className="mode-summary">{t('panelModeSiteSummary')}</p>;
  const names = [providerName('classifier', settings.classifier), providerName('generator', settings.generator)].filter((n): n is string => n !== null);
  return (
    <p className="mode-summary">
      {names.length > 0 ? names.join(' → ') : t('panelNoProvider')}{' '}
      <a href="#" onClick={(e) => { e.preventDefault(); openSettings(names.length > 0 ? 'classifier' : 'generator'); }}>
        {t('panelChangeProviders')}
      </a>
    </p>
  );
}

function Section({ title, count, hint, children }: { title: string; count: number; hint?: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <h2>
        <span className="section-title">{title}</span>
        <span className="section-count">{count}</span>
      </h2>
      {hint && <p className="section-hint">{hint}</p>}
      {children}
    </section>
  );
}

const REASON_KEY: Record<HeldReason, string> = {
  pinned: 'panelHeldPinned',
  internal: 'panelHeldInternal',
  excluded: 'panelHeldExcluded',
  loading: 'panelHeldLoading',
};

/** Una riga di tab. Con `targets` mostra il menu per spostarla; con `onRemove` la ✕; con `reason` il motivo per cui è ferma. */
function TabRow({
  tab,
  targets = [],
  onMove,
  onRemove,
  onClose,
  reason,
  added,
}: {
  tab: ProposedTab;
  targets?: Target[];
  onMove?: (tab: ProposedTab, value: string) => void;
  onRemove?: () => void;
  onClose?: () => void;
  reason?: HeldReason;
  added?: boolean;
}) {
  return (
    <li className={`tab${added ? ' added' : ''}${reason ? ' held' : ''}`} title={tab.url}>
      {tab.favIconUrl ? <img src={tab.favIconUrl} alt="" /> : <span className="no-icon" />}
      <span className="tab-title">{tab.title}</span>
      {added && <span className="tab-chip">{t('panelNewTab')}</span>}
      {tab.rule && (
        <span className="tab-chip muted" title={t('panelRuleHint', tab.rule)}>
          {t('panelRule')}
        </span>
      )}
      {reason && <span className="tab-chip muted">{t(REASON_KEY[reason])}</span>}
      {onMove && targets.length > 0 && (
        <label className="move" title={t('popupMoveTab')}>
          <Icon name="driveFileMove" size={18} />
          <select value="" aria-label={t('popupMoveTab')} onChange={(e) => e.target.value && onMove(tab, e.target.value)}>
            <option value="">{t('popupMoveTo')}</option>
            {targets.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {onRemove && (
        <button className="icon small" title={t('popupRemoveTab')} aria-label={t('popupRemoveTab')} onClick={onRemove}>
          <Icon name="remove" size={16} />
        </button>
      )}
      {onClose && (
        <button className="icon small danger close-tab" title={t('panelCloseTab')} aria-label={t('panelCloseTab')} onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      )}
    </li>
  );
}

interface GroupCardProps {
  group: ProposedGroup;
  targets: Target[];
  onMove: (tab: ProposedTab, value: string) => void;
  onEdit: (edit: ProposalEdit) => void;
  onClose: (tabId: number) => void;
  onSave: () => void;
  saving: boolean;
  /** Anteprima per sito durante il calcolo: si guarda soltanto. */
  readOnly?: boolean;
}

/** Un gruppo nuovo della proposta: nome e colore modificabili, tab spostabili. */
function GroupCard({ group, targets, onMove, onEdit, onClose, onSave, saving, readOnly = false }: GroupCardProps) {
  const [name, setName] = useState(group.name);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => setName(group.name), [group.name]);

  const commitName = () => {
    if (name.trim() !== group.name) onEdit({ kind: 'rename', groupId: group.id, name });
  };

  if (readOnly) {
    return (
      <li className="group preview">
        <div className="group-header">
          <span className={`swatch static color-${group.color}`} aria-label={t(`color_${group.color}`)} />
          <span className="group-name static">{group.name}</span>
        </div>
        <div className="group-meta">
          <span className={`badge provenance-${group.provenance}`}>{t(`provenance_${group.provenance}`)}</span>
          <span className="count">{tabCount(group.tabs.length)}</span>
        </div>
        <ul className="tabs">
          {group.tabs.map((tab) => (
            <TabRow key={tab.tabId} tab={tab} />
          ))}
        </ul>
      </li>
    );
  }

  return (
    <li className="group">
      <div className="group-header">
        <button
          className={`swatch color-${group.color}`}
          title={t('popupChangeColor')}
          aria-label={`${t('popupChangeColor')}: ${t(`color_${group.color}`)}`}
          aria-expanded={paletteOpen}
          onClick={() => setPaletteOpen(!paletteOpen)}
        />
        <input
          className="group-name"
          value={name}
          aria-label={t('popupGroupName')}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setName(group.name);
          }}
        />
        <button
          className="icon small danger"
          title={t('popupDiscardGroup')}
          aria-label={t('popupDiscardGroup')}
          onClick={() => onEdit({ kind: 'discard-group', groupId: group.id })}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="group-meta">
        <span className={`badge provenance-${group.provenance}`}>{t(`provenance_${group.provenance}`)}</span>
        <span className="count">{tabCount(group.tabs.length)}</span>
        {group.provenance === 'ai' && (
          <button className="text small save" disabled={saving} title={t('popupSaveToListHint')} onClick={onSave}>
            <Icon name="bookmarkAdd" size={18} />
            {t('popupSaveToList')}
          </button>
        )}
      </div>
      {paletteOpen && (
        <div className="palette" role="radiogroup" aria-label={t('popupChangeColor')}>
          {GROUP_COLORS.map((color) => (
            <button
              key={color}
              role="radio"
              aria-checked={color === group.color}
              className={`swatch color-${color}${color === group.color ? ' selected' : ''}`}
              title={t(`color_${color}`)}
              aria-label={t(`color_${color}`)}
              onClick={() => {
                setPaletteOpen(false);
                if (color !== group.color) onEdit({ kind: 'recolor', groupId: group.id, color });
              }}
            />
          ))}
        </div>
      )}
      <ul className="tabs">
        {group.tabs.map((tab) => (
          <TabRow
            key={tab.tabId}
            tab={tab}
            targets={targets}
            onMove={onMove}
            onRemove={() => onEdit({ kind: 'remove-tab', tabId: tab.tabId })}
            onClose={() => onClose(tab.tabId)}
          />
        ))}
      </ul>
    </li>
  );
}

/**
 * Un gruppo già aperto in Chrome: nome e colore restano quelli di Chrome. Le sue tab di adesso
 * sono solo da vedere; quelle che la proposta gli aggiunge sono segnate come nuove e si possono togliere.
 * Un gruppo senza aggiunte resta chiuso, per non allungare l'elenco.
 */
function ExistingCard({
  existing,
  targets,
  onMove,
  onEdit,
  onClose,
  readOnly = false,
}: {
  existing: ExistingGroupView;
  targets: Target[];
  onMove: GroupCardProps['onMove'];
  onEdit: GroupCardProps['onEdit'];
  onClose: GroupCardProps['onClose'];
  readOnly?: boolean;
}) {
  const { group, current, added } = existing;
  return (
    <li className={`group existing${added.length > 0 ? ' extended' : ''}`}>
      <details open={added.length > 0}>
        <summary className="group-header">
          <span className={`swatch static color-${group.color}`} aria-label={t(`color_${group.color}`)} />
          <span className="group-name static">{group.name || t('popupUnnamed')}</span>
          <span className="count">
            {tabCount(current.length)}
            {added.length > 0 && <strong> {addedCount(added.length)}</strong>}
          </span>
          <Icon name="lock" size={16} />
        </summary>
        <ul className="tabs">
          {added.map((tab) => (
            readOnly ? (
              <TabRow key={tab.tabId} tab={tab} added />
            ) : (
              <TabRow
                key={tab.tabId}
                tab={tab}
                added
                targets={targets}
                onMove={onMove}
                onRemove={() => onEdit({ kind: 'remove-tab', tabId: tab.tabId })}
                onClose={() => onClose(tab.tabId)}
              />
            )
          ))}
          {current.map((tab) => (
            <TabRow key={tab.tabId} tab={tab} onClose={() => onClose(tab.tabId)} />
          ))}
        </ul>
      </details>
    </li>
  );
}
