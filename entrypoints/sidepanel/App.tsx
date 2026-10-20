import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { saveSettings, type GroupingMode } from '../../src/settings';
import { t } from '../../src/shared/i18n';
import { remoteOrganizer as organizer } from '../../src/shared/organizer-remote';
import type { OrganizerState, ProposedTab, RememberOffer } from '../../src/shared/types';
import { useFocusRecovery } from '../../src/ui/focus-recovery';
import { Icon } from '../../src/ui/Icon';
import { CloseTabsBanner, ComputingStatus, ErrorBanner, InfoBanner, StaleBanner, WarningsBanner } from './Banners';
import { ExistingCard, GroupCard } from './GroupCards';
import { useSettings } from '../../src/ui/use-settings';
import { DragContext, useDragState, useFreeDrop, useNewGroupDrop, type DragItem, type DropTarget } from './drag';
import { useExpiring, useOrganizer, useWindowView } from './hooks';
import { LiveTabsContext } from './live-tabs';
import { ModePicker } from './ModePicker';
import { openSettings } from './open-settings';
import { moveBetweenRows } from './row-navigation';
import { TabRow, type Target } from './TabRow';

/** Per quanto resta visibile l'offerta "Metti sempre qui". */
const OFFER_MS = 8000;

/** "Nuovo gruppo", in fondo a ogni menu "Sposta in…": un gruppo tutto suo per la tab. */
const NEW_GROUP: Target = { value: 'n', label: t('panelNewGroup'), to: { newGroup: true } };

export function App() {
  const { state, windowId, busy, failure, run, send, edit } = useOrganizer();
  const [settings] = useSettings();
  const [notice, setNotice] = useState<'popupApplied' | 'popupUndone' | null>(null);
  const [offer, setOffer, pauseOffer] = useExpiring<RememberOffer>(OFFER_MS);
  // "Aggiungi alle categorie" in corso: il gruppo ("p:id" o "c:id") mostra subito il segno di categoria e
  // la snackbar lo dice. Finito il salvataggio (`done`) si aspetta la vista nuova, così l'icona non torna indietro.
  const [adding, setAdding] = useState<{ key: string; name: string; done: boolean } | null>(null);
  // L'esito, nella snackbar per qualche secondo, con o senza proposta.
  const [saved, setSaved, pauseSaved] = useExpiring<NonNullable<OrganizerState['notice']>>(OFFER_MS);

  const proposal = state?.phase === 'ready' && state.windowId === windowId ? state.proposal : undefined;
  const canUndo = state?.undo !== undefined && state.undo.windowId === windowId;
  const computing = !state || state.phase === 'computing';
  // Proposta per sito mostrata in sola lettura mentre l'AI calcola.
  const preview = state?.phase === 'computing' && state.windowId === windowId ? state.preview : undefined;
  const readOnly = !proposal && preview !== undefined;

  const view = useWindowView(windowId, state, settings);
  useEffect(() => {
    if (adding?.done) setAdding(null);
  }, [view]);

  const addToCategories = async (key: string, name: string, request: () => Promise<OrganizerState>) => {
    setAdding({ key, name, done: false });
    setSaved(null);
    await run(async () => {
      const next = await request();
      // Anche un errore delle impostazioni (es. troppe categorie) arriva come avviso.
      if (next.notice) setSaved(next.notice);
      return next;
    });
    setAdding((a) => a && { ...a, done: true });
    // Se la vista non cambia (es. categoria già esistente) il segno sparisce comunque.
    setTimeout(() => setAdding((a) => (a?.done ? null : a)), 1500);
  };

  function recompute() {
    if (windowId === null) return;
    setNotice(null);
    setOffer(null);
    run(() => organizer.propose(windowId, { force: true }));
  }

  async function chooseMode(mode: GroupingMode) {
    if (!settings || settings.mode === mode) return;
    await saveSettings({ mode });
    // Si ricalcola solo una proposta già mostrata, che con la modalità nuova sarebbe superata.
    if (proposal) recompute();
  }

  // Destinazioni per "Sposta in…": gruppi della proposta, gruppi aperti non ancora toccati e un gruppo nuovo.
  const targets: Target[] = proposal
    ? [
        ...proposal.groups.map((g) => ({ value: `p:${g.id}`, label: g.name || t('popupUnnamed'), to: { groupId: g.id } })),
        ...view.existing
          .filter((e) => !e.proposedGroupId)
          .map((e) => ({ value: `c:${e.group.id}`, label: e.group.name || t('popupUnnamed'), to: { existingGroup: e.group } })),
        NEW_GROUP,
      ]
    : [];

  // L'Organizzatore toglie le tab chiuse dalla proposta e la tiene attuale: nessun avviso di proposta vecchia.
  const closeTab = (tabId: number) => send(() => organizer.closeTab(tabId));
  const closeDuplicates = (tabIds: number[]) => windowId !== null && send(() => organizer.closeDuplicates(windowId, tabIds));
  const closeInactive = (tabIds: number[]) => windowId !== null && send(() => organizer.closeInactive(windowId, tabIds));
  const closeGroup = (groupId: number) => send(() => organizer.closeGroup(groupId));

  // Riordinano la barra di Chrome; il pannello segue da solo (vedi `useWindowView`).
  const sortButtons = (which: ('groups' | 'tabs')[]) =>
    windowId !== null &&
    which.map((kind) => (
      <button
        key={kind}
        className="icon small"
        disabled={busy || computing}
        data-tooltip={t(kind === 'groups' ? 'panelSortGroups' : 'panelSortTabs')}
        aria-label={t(kind === 'groups' ? 'panelSortGroups' : 'panelSortTabs')}
        onClick={() => run(() => (kind === 'groups' ? organizer.sortGroups(windowId) : organizer.sortTabs(windowId)))}
      >
        <Icon name={kind === 'groups' ? 'sortByAlpha' : 'sort'} size={18} />
      </button>
    ));

  // Drag and drop sui gruppi aperti e sulle tab senza gruppo: sposta davvero tab e gruppi nella barra.
  const moveByDrag = (item: DragItem, target: DropTarget) => {
    if (item.kind === 'tab' && target.kind === 'tab') send(() => organizer.moveTab(item.tabId, target.groupId, target.beforeTabId));
    if (item.kind === 'tab' && target.kind === 'new-group') send(() => organizer.newGroup(item.tabId));
    if (item.kind === 'group' && target.kind === 'group') send(() => organizer.moveGroup(item.groupId, target.beforeGroupId));
  };
  const drag = useDragState(!computing && !busy && !readOnly, moveByDrag);
  // Il gruppo che segue ciascuno nella barra (`view.existing` è nell'ordine della barra).
  const nextGroup = new Map(view.existing.map((e, i) => [e.group.id, view.existing[i + 1]?.group.id ?? null]));

  const duplicateTabs = view.duplicates;
  const inactiveTabs = view.inactive;

  const moveTab = async (tab: ProposedTab, value: string) => {
    const target = targets.find((x) => x.value === value);
    if (!target || 'free' in target.to) return;
    const next = await edit({ kind: 'add-tab', tab, to: target.to });
    setOffer(next?.offer ?? null);
  };

  // Senza proposta (es. dopo "Applica") le tab libere vanno subito in un gruppo aperto o in uno nuovo. Non durante il calcolo.
  const directTargets: Target[] =
    !proposal && !computing
      ? [...view.existing.map((e) => ({ value: `c:${e.group.id}`, label: e.group.name || t('popupUnnamed'), to: { existingGroup: e.group } })), NEW_GROUP]
      : [];
  const freeTargets = proposal ? targets : directTargets;
  const groupTab = (tab: ProposedTab, value: string) => {
    const target = directTargets.find((x) => x.value === value);
    if (!target) return;
    if ('newGroup' in target.to) send(() => organizer.newGroup(tab.tabId));
    else if ('existingGroup' in target.to) {
      const groupId = target.to.existingGroup.id;
      send(() => organizer.groupTab(tab.tabId, groupId));
    }
  };

  // Le alternative al trascinamento valgono quando vale il trascinamento: spostano davvero tab e gruppi.
  // Una tab di un gruppo aperto va in un altro gruppo aperto, in uno nuovo o fuori dal gruppo.
  const liveTargets = (groupId: number): Target[] =>
    drag.enabled
      ? [
          ...view.existing
            .filter((e) => e.group.id !== groupId)
            .map((e) => ({ value: `c:${e.group.id}`, label: e.group.name || t('popupUnnamed'), to: { existingGroup: e.group } })),
          NEW_GROUP,
          { value: 'f', label: t('panelUngroupTab'), to: { free: true } },
        ]
      : [];
  const moveLive = (groupId: number) => (tab: ProposedTab, value: string) => {
    const target = liveTargets(groupId).find((x) => x.value === value);
    if (!target) return;
    if ('newGroup' in target.to) send(() => organizer.newGroup(tab.tabId));
    else if ('existingGroup' in target.to) {
      const to = target.to.existingGroup.id;
      send(() => organizer.moveTab(tab.tabId, to, null));
    } else if ('free' in target.to) send(() => organizer.moveTab(tab.tabId, null, null));
  };
  // Su e Giù di un gruppo nella barra (`view.existing` è nell'ordine della barra).
  const groupReorder = (groupId: number) => {
    const i = view.existing.findIndex((e) => e.group.id === groupId);
    if (!drag.enabled || i < 0) return undefined;
    return {
      up: i > 0,
      down: i < view.existing.length - 1,
      onMove: (direction: 'up' | 'down') => {
        const before = direction === 'up' ? view.existing[i - 1]!.group.id : (view.existing[i + 2]?.group.id ?? null);
        send(() => organizer.moveGroup(groupId, before));
      },
    };
  };

  const message = failure ?? state?.error;
  const touched = view.existing.filter((e) => e.added.length > 0);
  const untouched = view.existing.filter((e) => e.added.length === 0);
  const rememberFocus = useFocusRecovery('.tab, .group');

  // "Applica" e "Annulla" tolgono la proposta: nessun avviso nemmeno se le tab cambiano.
  const showStale = proposal !== undefined && state?.stale === true && !computing;
  const duplicatesText = duplicateTabs.length === 1 ? t('panelDuplicatesOne') : t('panelDuplicates', String(duplicateTabs.length));
  const inactiveText =
    inactiveTabs.length === 1 ? t('panelInactiveOne', String(view.inactiveDays)) : t('panelInactive', [String(inactiveTabs.length), String(view.inactiveDays)]);
  // L'esito di "Aggiungi alle categorie" sta nella sua snackbar (`saved`), non nel pannello.
  const panelNotice = state?.notice?.key.startsWith('saveToList') || state?.notice?.key === saved?.key ? undefined : state?.notice;
  const info = !proposal && !computing && (panelNotice || notice) ? (panelNotice ? t(panelNotice.key, panelNotice.arg) : t(notice!)) : null;
  const noGroups = proposal !== undefined && view.created.length === 0 && touched.length === 0;
  // Banner e stato del calcolo compaiono già pieni, e una regione live nuova di solito non viene letta:
  // i loro testi passano da questa, sempre presente.
  const announcement = [
    computing && t(preview ? 'panelPreviewComputing' : 'popupComputing'),
    showStale && t('panelStale'),
    duplicateTabs.length > 0 && !computing && duplicatesText,
    inactiveTabs.length > 0 && !computing && inactiveText,
    info,
    noGroups && t('popupNoGroups'),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="panel" onClickCapture={rememberFocus} onChangeCapture={rememberFocus}>
      <p className="visually-hidden" role="status">
        {announcement}
      </p>
      <header className="top-app-bar">
        <h1>{t('popupTitle')}</h1>
        <button className="icon" data-tooltip={t('popupOpenSettings')} aria-label={t('popupOpenSettings')} onClick={() => browser.runtime.openOptionsPage()}>
          <Icon name="settings" />
        </button>
      </header>

      {settings && <ModePicker settings={settings} disabled={computing || busy} onChoose={chooseMode} />}

      {computing && (
        <ComputingStatus
          preview={preview}
          started={state?.phase === 'computing'}
          onAccept={() => send(() => organizer.acceptPreview())}
          onAbort={() => send(() => organizer.abort())}
        />
      )}

      <DragContext.Provider value={drag}>
      <LiveTabsContext.Provider value={view.live}>
        <div className="content" onKeyDown={moveBetweenRows}>
          {message && <ErrorBanner messageKey={message} />}

          {showStale && <StaleBanner onRecompute={recompute} />}

          {proposal && proposal.warnings.length > 0 && <WarningsBanner warnings={proposal.warnings} />}

          {duplicateTabs.length > 0 && !computing && (
            <CloseTabsBanner
              icon="tab"
              text={duplicatesText}
              tabs={duplicateTabs}
              disabled={busy}
              onClose={closeDuplicates}
            />
          )}

          {inactiveTabs.length > 0 && !computing && (
            <CloseTabsBanner
              icon="schedule"
              text={inactiveText}
              tabs={inactiveTabs}
              disabled={busy}
              onClose={closeInactive}
            />
          )}

          {info && <InfoBanner text={info} />}

          {noGroups && <InfoBanner text={t('popupNoGroups')} />}

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
                    onSave={() => addToCategories(`p:${group.id}`, group.name, () => organizer.saveToList(group.id))}
                    saving={busy}
                    adding={adding?.key === `p:${group.id}`}
                  />
                ))}
              </ul>
            </Section>
          )}

          {view.existing.length > 0 && (
            <Section title={t('panelSectionExisting')} count={view.existing.length} actions={sortButtons(view.existing.length > 1 ? ['groups', 'tabs'] : ['tabs'])}>
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
                    onCloseGroup={() => closeGroup(existing.group.id)}
                    onRename={(name) => send(() => organizer.renameGroup(existing.group.id, name))}
                    onSave={() => addToCategories(`c:${existing.group.id}`, existing.group.name, () => organizer.saveOpenGroupToList(existing.group.id))}
                    saving={busy}
                    adding={adding?.key === `c:${existing.group.id}`}
                    nextGroupId={nextGroup.get(existing.group.id) ?? null}
                    reorder={groupReorder(existing.group.id)}
                    liveTargets={liveTargets(existing.group.id)}
                    onMoveLive={moveLive(existing.group.id)}
                    onMoveTab={drag.enabled ? (tabId, before) => send(() => organizer.moveTab(tabId, existing.group.id, before)) : undefined}
                  />
                ))}
              </ul>
            </Section>
          )}

          {/* Trascinando una tab la sezione c'è anche vuota: lasciandola qui esce dal suo gruppo. */}
          {(view.free.length > 0 || drag.item?.kind === 'tab') && (
            <Section
              title={t('panelSectionFree')}
              count={view.free.length}
              hint={freeTargets.length > 0 ? t('panelFreeHint') : undefined}
              // Con gruppi aperti "Tab A-Z" sta già nella loro intestazione e ordina anche queste.
              actions={view.existing.length === 0 && view.free.length > 1 && sortButtons(['tabs'])}
            >
              <FreeTabs>
                {view.free.map((tab, i) => (
                  <TabRow
                    key={tab.tabId}
                    tab={tab}
                    targets={freeTargets}
                    onMove={proposal ? moveTab : groupTab}
                    onClose={() => closeTab(tab.tabId)}
                    drag={{ groupId: null, nextTabId: view.free[i + 1]?.tabId ?? null }}
                    reorder={
                      drag.enabled
                        ? {
                            up: i > 0,
                            down: i < view.free.length - 1,
                            onMove: (direction) => {
                              const before = direction === 'up' ? view.free[i - 1]!.tabId : (view.free[i + 2]?.tabId ?? null);
                              send(() => organizer.moveTab(tab.tabId, null, before));
                            },
                          }
                        : undefined
                    }
                  />
                ))}
              </FreeTabs>
            </Section>
          )}

          {/* In fondo, sotto ogni riga trascinabile: comparendo sopra la riga trascinata la sposterebbe, e Chrome annullerebbe il trascinamento. */}
          {drag.item?.kind === 'tab' && <NewGroupDrop />}

          {view.held.length > 0 && (
            <details className="section held">
              <summary>
                <Icon name="chevronRight" size={18} />
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
      </LiveTabsContext.Provider>
      </DragContext.Provider>

      {/* Regione live sempre presente: la snackbar che ci compare dentro viene letta. */}
      <div role="status">
      {proposal && offer ? (
        <div className="snackbar" {...pauseOffer}>
          <span>{t('panelRememberSite', [offer.site, offer.category])}</span>
          <button
            className="text small inverse"
            onClick={() => {
              setOffer(null);
              run(() => organizer.rememberSite(offer.tabId));
            }}
          >
            {t('panelRememberSiteYes')}
          </button>
        </div>
      ) : adding && !adding.done ? (
        <div className="snackbar">
          <span>{t('panelSavingToList', adding.name)}</span>
        </div>
      ) : saved ? (
        <div className="snackbar" {...pauseSaved}>
          <span>{t(saved.key, saved.arg)}</span>
          {saved.key === 'saveToListNoDescription' && (
            <button className="text small inverse" onClick={() => openSettings('categories')}>
              {t('popupWarningSettings')}
            </button>
          )}
        </div>
      ) : (
        proposal &&
        panelNotice && (
          <div className="snackbar">
            <span>{t(panelNotice.key, panelNotice.arg)}</span>
          </div>
        )
      )}
      </div>

      <footer className="bottom-bar">
        {canUndo && (
          <button className="text undo" disabled={busy} onClick={() => run(() => organizer.undo(), () => setNotice('popupUndone'))}>
            <Icon name="undo" size={18} />
            {t('popupUndo')}
          </button>
        )}
        <span className="spacer" />
        {windowId !== null && !computing && (
          // Il calcolo parte solo da qui: senza proposta è l'azione principale, "Organizza".
          <button className={`recompute${proposal ? ' secondary' : ''}`} disabled={busy} onClick={recompute}>
            <Icon name={proposal ? 'refresh' : 'category'} size={18} />
            {t(proposal ? 'popupRecompute' : 'panelOrganize')}
          </button>
        )}
        {proposal && proposal.groups.length > 0 && (
          <button
            className="apply"
            disabled={busy}
            onClick={() =>
              run(() => organizer.apply(), () => {
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

/** L'elenco delle tab senza gruppo, che accoglie una tab trascinata fuori dal suo gruppo. */
function FreeTabs({ children }: { children: React.ReactNode }) {
  const { className, ...drop } = useFreeDrop();
  return (
    <ul className={`tabs card-list${className}`} {...drop}>
      {children}
    </ul>
  );
}

/** Compare trascinando una tab: lasciandola qui finisce in un gruppo nuovo. */
function NewGroupDrop() {
  const { className, ...drop } = useNewGroupDrop();
  return (
    <div className={`card-list new-group-drop${className}`} {...drop}>
      <Icon name="add" size={18} />
      {t('panelNewGroupDrop')}
    </div>
  );
}

function Section({ title, count, hint, actions, children }: { title: string; count: number; hint?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-header">
        <h2>
          <span className="section-title">{title}</span>
          <span className="section-count">{count}</span>
        </h2>
        {actions}
      </div>
      {hint && <p className="section-hint">{hint}</p>}
      {children}
    </section>
  );
}
