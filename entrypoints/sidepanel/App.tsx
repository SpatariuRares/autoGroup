import { useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { buildWindowView } from '../../src/organizer/window-view';
import { saveSettings, type GroupingMode } from '../../src/settings';
import { t } from '../../src/shared/i18n';
import { callOrganizer } from '../../src/shared/organizer-client';
import type { ProposedTab } from '../../src/shared/types';
import { Icon } from '../../src/ui/Icon';
import { ComputingStatus, DuplicatesBanner, ErrorBanner, InfoBanner, StaleBanner, WarningsBanner } from './Banners';
import { ExistingCard, GroupCard } from './GroupCards';
import { useExpiring, useOrganizer, useSettings, useWindowSnapshot } from './hooks';
import { ModePicker } from './ModePicker';
import { openSettings } from './open-settings';
import { OFFER_MS, rememberOffer, type RememberOffer } from './remember-offer';
import { moveBetweenRows } from './row-navigation';
import { TabRow, type Target } from './TabRow';

export function App() {
  const { state, setState, windowId, busy, failure, run, send, edit } = useOrganizer();
  const settings = useSettings();
  const [notice, setNotice] = useState<'popupApplied' | 'popupUndone' | null>(null);
  const [stale, setStale] = useState(false);
  const [offer, setOffer] = useExpiring<RememberOffer>(OFFER_MS);

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

  async function closeTab(tabId: number) {
    closing.current.add(tabId);
    if (!(await send({ type: 'organizer/close-tab', tabId }))) closing.current.delete(tabId);
  }

  async function closeDuplicates(tabIds: number[]) {
    if (windowId === null) return;
    // Come per "Chiudi la tab": l'Organizzatore le toglie dalla proposta, quindi non la rendono vecchia.
    for (const tabId of tabIds) closing.current.add(tabId);
    if (!(await send({ type: 'organizer/close-duplicates', windowId, tabIds }))) closing.current.clear();
  }

  // I doppioni con titolo, icona e URL letti dal vivo, per l'anteprima.
  const duplicateTabs = view.duplicates
    .map((id) => snapshot.tabs.find((tab) => tab.id === id))
    .filter((tab) => tab !== undefined)
    .map((tab) => ({ tabId: tab.id!, title: tab.title?.trim() || tab.url || '', url: tab.url ?? '', favIconUrl: tab.favIconUrl }));

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
    send({ type: 'organizer/group-tab', tabId: tab.tabId, groupId: target.to.existingGroup.id });
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

      {settings && <ModePicker settings={settings} disabled={computing || busy} onChoose={chooseMode} />}

      {computing && (
        <ComputingStatus
          preview={preview}
          started={state?.phase === 'computing'}
          onAccept={() => callOrganizer({ type: 'organizer/accept-preview' }).then(setState).catch(console.error)}
          onAbort={() => callOrganizer({ type: 'organizer/abort' }).then(setState).catch(console.error)}
        />
      )}

      <div className="content" onKeyDown={moveBetweenRows}>
        {message && <ErrorBanner messageKey={message} />}

        {proposal && stale && !computing && <StaleBanner onRecompute={recompute} />}

        {proposal && proposal.warnings.length > 0 && <WarningsBanner warnings={proposal.warnings} />}

        {duplicateTabs.length > 0 && !computing && (
          <DuplicatesBanner tabs={duplicateTabs} disabled={busy} onClose={closeDuplicates} />
        )}

        {!proposal && !computing && (state?.notice || notice) && (
          <InfoBanner text={state?.notice ? t(state.notice.key, state.notice.arg) : t(notice!)} />
        )}

        {proposal && view.created.length === 0 && touched.length === 0 && <InfoBanner text={t('popupNoGroups')} />}

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
