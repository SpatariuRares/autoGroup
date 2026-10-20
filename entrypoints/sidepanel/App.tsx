import { Fragment, useState } from 'react';
import { browser } from 'wxt/browser';
import { saveSettings, type GroupingMode } from '../../src/settings';
import { t } from '../../src/shared/i18n';
import { remoteOrganizer as organizer } from '../../src/shared/organizer-remote';
import type { RememberOffer } from '../../src/shared/types';
import { useFocusRecovery } from '../../src/ui/focus-recovery';
import { Icon } from '../../src/ui/Icon';
import { CloseTabsBanner, ComputingStatus, ErrorBanner, InfoBanner, StaleBanner, WarningsBanner } from './Banners';
import { ExistingCard, GroupCard } from './GroupCards';
import { useSettings } from '../../src/ui/use-settings';
import { DragContext, useDragState, useFreeDrop, useNewGroupDrop, type DragItem, type DropTarget } from './drag';
import { SNACKBAR_MS, useExpiring, useOrganizer, useSaveToCategories, useWindowView } from './hooks';
import { LiveTabsContext } from './live-tabs';
import { ModePicker } from './ModePicker';
import { moveTargets, reorderAt } from './move-targets';
import { PanelActionsContext, type PanelActions } from './panel-actions';
import { moveBetweenRows } from './row-navigation';
import { Snackbar } from './Snackbar';
import { TabRow } from './TabRow';

export function App() {
  const { state, windowId, busy, failure, run, send, edit } = useOrganizer();
  const [settings] = useSettings();
  const [notice, setNotice] = useState<'popupApplied' | 'popupUndone' | null>(null);
  const [offer, setOffer, pauseOffer] = useExpiring<RememberOffer>(SNACKBAR_MS);

  const proposal = state?.phase === 'ready' && state.windowId === windowId ? state.proposal : undefined;
  const canUndo = state?.undo !== undefined && state.undo.windowId === windowId;
  const computing = !state || state.phase === 'computing';
  // Proposta per sito mostrata in sola lettura mentre l'AI calcola.
  const preview = state?.phase === 'computing' && state.windowId === windowId ? state.preview : undefined;
  const readOnly = !proposal && preview !== undefined;

  const view = useWindowView(windowId, state, settings);
  const categories = useSaveToCategories(run, view);

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

  // L'Organizzatore toglie le tab chiuse dalla proposta e la tiene attuale: nessun avviso di proposta vecchia.
  const actions: PanelActions = {
    busy,
    edit,
    closeTab: (tabId) => send(() => organizer.closeTab(tabId)),
    closeGroup: (groupId) => send(() => organizer.closeGroup(groupId)),
    renameGroup: (groupId, name) => send(() => organizer.renameGroup(groupId, name)),
    moveTab: (tabId, groupId, beforeTabId) => send(() => organizer.moveTab(tabId, groupId, beforeTabId)),
    saveProposedGroup: (group) => categories.save(group.id, group.name, () => organizer.saveToList(group.id)),
    saveOpenGroup: (group) => categories.save(group.id, group.name, () => organizer.saveOpenGroupToList(group.id)),
    adding: categories.adding?.id ?? null,
  };
  const closeDuplicates = (tabIds: number[]) => windowId !== null && send(() => organizer.closeDuplicates(windowId, tabIds));
  const closeInactive = (tabIds: number[]) => windowId !== null && send(() => organizer.closeInactive(windowId, tabIds));

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
    if (item.kind === 'tab' && target.kind === 'tab') actions.moveTab(item.tabId, target.groupId, target.beforeTabId);
    if (item.kind === 'tab' && target.kind === 'new-group') send(() => organizer.newGroup(item.tabId));
    if (item.kind === 'group' && target.kind === 'group') send(() => organizer.moveGroup(item.groupId, target.beforeGroupId));
  };
  const drag = useDragState(!computing && !busy && !readOnly, moveByDrag);
  // Il gruppo che segue ciascuno nella barra (`view.existing` è nell'ordine della barra).
  const nextGroup = new Map(view.existing.map((e, i) => [e.group.id, view.existing[i + 1]?.group.id ?? null]));

  // Le alternative al trascinamento ("Sposta in…" sulle tab di un gruppo aperto, Su e Giù) valgono quando vale il trascinamento.
  const targets = moveTargets({
    proposal,
    view,
    computing,
    live: drag.enabled,
    moves: {
      edit: async (change) => setOffer((await edit(change))?.offer ?? null),
      groupTab: (tabId, groupId) => send(() => organizer.groupTab(tabId, groupId)),
      newGroup: (tabId) => send(() => organizer.newGroup(tabId)),
      moveTab: actions.moveTab,
    },
  });
  const groupIds = view.existing.map((e) => e.group.id);
  const freeIds = view.free.map((tab) => tab.tabId);

  const message = failure ?? state?.error;
  const touched = view.existing.filter((e) => e.added.length > 0);
  const untouched = view.existing.filter((e) => e.added.length === 0);
  const rememberFocus = useFocusRecovery('.tab, .group');

  // "Applica" e "Annulla" tolgono la proposta: nessun avviso nemmeno se le tab cambiano.
  const showStale = proposal !== undefined && state?.stale === true && !computing;
  // L'esito di "Aggiungi alle categorie" sta nella sua snackbar, non nel pannello.
  const panelNotice = state?.notice?.snackbar ? undefined : state?.notice;
  const info = !proposal && !computing && (panelNotice || notice) ? (panelNotice ? t(panelNotice.key, panelNotice.arg) : t(notice!)) : null;
  const noGroups = proposal !== undefined && view.created.length === 0 && touched.length === 0;

  // I banner, nell'ordine in cui compaiono. Compaiono già pieni, e una regione live nuova di solito non
  // viene letta: il loro testo (`announce`) passa da `announcement`, sempre presente. Errori e avvisi
  // dell'AI hanno già role="alert".
  const banners: { key: string; announce?: string; node: React.ReactNode }[] = [];
  if (message) banners.push({ key: 'error', node: <ErrorBanner messageKey={message} /> });
  if (showStale) banners.push({ key: 'stale', announce: t('panelStale'), node: <StaleBanner onRecompute={recompute} /> });
  if (proposal && proposal.warnings.length > 0) banners.push({ key: 'warnings', node: <WarningsBanner warnings={proposal.warnings} /> });
  if (view.duplicates.length > 0 && !computing) {
    const text = view.duplicates.length === 1 ? t('panelDuplicatesOne') : t('panelDuplicates', String(view.duplicates.length));
    banners.push({ key: 'duplicates', announce: text, node: <CloseTabsBanner icon="tab" text={text} tabs={view.duplicates} disabled={busy} onClose={closeDuplicates} /> });
  }
  if (view.inactive.length > 0 && !computing) {
    const text =
      view.inactive.length === 1 ? t('panelInactiveOne', String(view.inactiveDays)) : t('panelInactive', [String(view.inactive.length), String(view.inactiveDays)]);
    banners.push({ key: 'inactive', announce: text, node: <CloseTabsBanner icon="schedule" text={text} tabs={view.inactive} disabled={busy} onClose={closeInactive} /> });
  }
  if (info) banners.push({ key: 'info', announce: info, node: <InfoBanner text={info} /> });
  if (noGroups) banners.push({ key: 'no-groups', announce: t('popupNoGroups'), node: <InfoBanner text={t('popupNoGroups')} /> });
  const announcement = [computing && t(preview ? 'panelPreviewComputing' : 'popupComputing'), ...banners.map((b) => b.announce)].filter(Boolean).join(' ');

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

      <PanelActionsContext.Provider value={actions}>
      <DragContext.Provider value={drag}>
      <LiveTabsContext.Provider value={view.live}>
        <div className="content" onKeyDown={moveBetweenRows}>
          {banners.map((b) => (
            <Fragment key={b.key}>{b.node}</Fragment>
          ))}

          {view.created.length > 0 && (
            <Section title={t('panelSectionNew')} count={view.created.length}>
              <ul className="groups">
                {view.created.map((group) => (
                  <GroupCard key={group.id} group={group} readOnly={readOnly} targets={targets.proposed({ proposedGroupId: group.id })} />
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
                    targets={targets.proposed({ proposedGroupId: existing.proposedGroupId, openGroupId: existing.group.id })}
                    nextGroupId={nextGroup.get(existing.group.id) ?? null}
                    reorder={
                      drag.enabled
                        ? reorderAt(groupIds, groupIds.indexOf(existing.group.id), (before) => send(() => organizer.moveGroup(existing.group.id, before)))
                        : undefined
                    }
                    liveTargets={targets.live(existing.group.id)}
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
              hint={targets.free.length > 0 ? t('panelFreeHint') : undefined}
              // Con gruppi aperti "Tab A-Z" sta già nella loro intestazione e ordina anche queste.
              actions={view.existing.length === 0 && view.free.length > 1 && sortButtons(['tabs'])}
            >
              <FreeTabs>
                {view.free.map((tab, i) => (
                  <TabRow
                    key={tab.tabId}
                    tab={tab}
                    targets={targets.free}
                    onClose={() => actions.closeTab(tab.tabId)}
                    drag={{ groupId: null, nextTabId: view.free[i + 1]?.tabId ?? null }}
                    reorder={drag.enabled ? reorderAt(freeIds, i, (before) => actions.moveTab(tab.tabId, null, before)) : undefined}
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
                  <TabRow key={tab.tabId} tab={tab} reason={reason} onClose={() => actions.closeTab(tab.tabId)} />
                ))}
              </ul>
            </details>
          )}
        </div>
      </LiveTabsContext.Provider>
      </DragContext.Provider>
      </PanelActionsContext.Provider>

      <Snackbar
        withProposal={proposal !== undefined}
        offer={offer}
        pauseOffer={pauseOffer}
        onRemember={(chosen) => {
          setOffer(null);
          run(() => organizer.rememberSite(chosen.tabId));
        }}
        savingName={categories.adding && !categories.adding.done ? categories.adding.name : null}
        saved={categories.saved}
        pauseSaved={categories.pauseSaved}
        notice={panelNotice}
      />

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
