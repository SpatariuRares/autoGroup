import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { t, warningKey } from '../../src/shared/i18n';
import { callOrganizer, onOrganizerState } from '../../src/shared/organizer-client';
import { GROUP_COLORS, type OrganizerState, type ProposalEdit, type ProposedGroup } from '../../src/shared/types';
import { Icon } from '../../src/ui/Icon';

/** Apre le impostazioni sulla sezione del provider coinvolto. */
function openSettings(section: 'generator' | 'classifier' | 'categories') {
  browser.tabs.create({ url: browser.runtime.getURL(`/options.html#${section}`) });
}

/**
 * Avvisa quando le tab della finestra cambiano: il pannello resta aperto mentre l'utente naviga,
 * quindi una proposta può diventare vecchia. Contano solo i cambi che toccano la proposta
 * (tab aperte, chiuse, spostate tra finestre, URL, gruppi), non titoli o favicon che cambiano da soli.
 */
function useTabChanges(windowId: number | null, onChange: () => void) {
  useEffect(() => {
    if (windowId === null) return;
    const inWindow = (tab?: { windowId?: number }) => tab?.windowId === windowId;
    const onCreated = (tab: { windowId?: number }) => inWindow(tab) && onChange();
    const onRemoved = (_id: number, info: { windowId: number }) => info.windowId === windowId && onChange();
    const onUpdated = (_id: number, change: { url?: string; pinned?: boolean; groupId?: number }, tab: { windowId?: number }) =>
      inWindow(tab) && (change.url !== undefined || change.pinned !== undefined || change.groupId !== undefined) && onChange();
    const onMoved = (_id: number, info: { newWindowId?: number; oldWindowId?: number }) =>
      (info.newWindowId === windowId || info.oldWindowId === windowId) && onChange();
    const onGroup = (group: { windowId?: number }) => inWindow(group) && onChange();

    browser.tabs.onCreated.addListener(onCreated);
    browser.tabs.onRemoved.addListener(onRemoved);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onAttached.addListener(onMoved);
    browser.tabs.onDetached.addListener(onMoved);
    browser.tabGroups.onCreated.addListener(onGroup);
    browser.tabGroups.onUpdated.addListener(onGroup);
    browser.tabGroups.onRemoved.addListener(onGroup);
    return () => {
      browser.tabs.onCreated.removeListener(onCreated);
      browser.tabs.onRemoved.removeListener(onRemoved);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onAttached.removeListener(onMoved);
      browser.tabs.onDetached.removeListener(onMoved);
      browser.tabGroups.onCreated.removeListener(onGroup);
      browser.tabGroups.onUpdated.removeListener(onGroup);
      browser.tabGroups.onRemoved.removeListener(onGroup);
    };
  }, [windowId]);
}

export function App() {
  const [state, setState] = useState<OrganizerState | null>(null);
  const [windowId, setWindowId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<'popupApplied' | 'popupUndone' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    // Lo stato è unico per tutte le finestre: si mostrano solo gli aggiornamenti di questa.
    const unsubscribe = onOrganizerState((next) => {
      if (windowId !== null && next.windowId === windowId) setState(next);
    });
    return unsubscribe;
  }, [windowId]);

  useEffect(() => {
    (async () => {
      const win = await browser.windows.getCurrent();
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

  // "Applica" e "Annulla" cambiano le tab: in quel momento la proposta non c'è più, quindi nessun avviso.
  useTabChanges(windowId, () => !busy && setStale(true));

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

  async function edit(change: ProposalEdit) {
    setFailure(null);
    try {
      setState(await callOrganizer({ type: 'organizer/edit', edit: change }));
    } catch (err) {
      console.error('autoGroup:', err);
      setFailure('errorUnexpected');
    }
  }

  function recompute() {
    if (windowId === null) return;
    setNotice(null);
    setStale(false);
    run({ type: 'organizer/propose', windowId, force: true });
  }

  const message = failure ?? state?.error;

  return (
    <div className="panel">
      <header className="top-app-bar">
        <h1>{t('popupTitle')}</h1>
        <button className="icon" title={t('popupOpenSettings')} aria-label={t('popupOpenSettings')} onClick={() => browser.runtime.openOptionsPage()}>
          <Icon name="settings" />
        </button>
      </header>

      {computing && (
        <div className="status computing" role="status">
          <div className="md-linear-progress" />
          <div className="status-row">
            <span>{t('popupComputing')}</span>
            {state?.phase === 'computing' && (
              <button className="text small" onClick={() => callOrganizer({ type: 'organizer/abort' }).then(setState).catch(console.error)}>
                <Icon name="stop" size={18} />
                {t('popupAbort')}
              </button>
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

        {!proposal && !computing && (
          <div className="empty-state">
            <Icon name="tab" size={40} />
            <p>{state?.notice ? t(state.notice.key, state.notice.arg) : notice ? t(notice) : t('panelIdle')}</p>
          </div>
        )}

        {proposal && proposal.groups.length === 0 && (
          <div className="empty-state">
            <Icon name="tab" size={40} />
            <p>{t('popupNoGroups')}</p>
          </div>
        )}

        {proposal && proposal.groups.length > 0 && (
          <ul className="groups">
            {proposal.groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                others={proposal.groups.filter((g) => g.id !== group.id)}
                onEdit={edit}
                onSave={() => run({ type: 'organizer/save-to-list', groupId: group.id })}
                saving={busy}
              />
            ))}
          </ul>
        )}
      </div>

      {proposal && state?.notice && (
        <div className="snackbar" role="status">
          <span>{t(state.notice.key, state.notice.arg)}</span>
          {state.notice.key === 'saveToListNoDescription' && (
            <button className="text small inverse" onClick={() => openSettings('categories')}>
              {t('popupWarningSettings')}
            </button>
          )}
        </div>
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

interface GroupCardProps {
  group: ProposedGroup;
  others: ProposedGroup[];
  onEdit: (edit: ProposalEdit) => void;
  onSave: () => void;
  saving: boolean;
}

function GroupCard({ group, others, onEdit, onSave, saving }: GroupCardProps) {
  const [name, setName] = useState(group.name);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => setName(group.name), [group.name]);

  const commitName = () => {
    if (name.trim() !== group.name) onEdit({ kind: 'rename', groupId: group.id, name });
  };

  // Un gruppo già aperto in Chrome mantiene nome e colore: "Applica" vi aggiunge solo le tab.
  const locked = group.provenance === 'existing';

  return (
    <li className={`group group-${group.color}`}>
      <div className="group-header">
        <button
          disabled={locked}
          className={`swatch color-${group.color}`}
          title={t('popupChangeColor')}
          aria-label={`${t('popupChangeColor')}: ${t(`color_${group.color}`)}`}
          aria-expanded={paletteOpen}
          onClick={() => setPaletteOpen(!paletteOpen)}
        />
        <input
          className="group-name"
          readOnly={locked}
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
        <span className={`badge provenance-${group.provenance}`}>
          {locked && <Icon name="lock" size={12} />}
          {t(`provenance_${group.provenance}`)}
        </span>
        <span className="count">{t('popupTabCount', String(group.tabs.length))}</span>
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
          <li key={tab.tabId} className="tab" title={tab.url}>
            {tab.favIconUrl ? <img src={tab.favIconUrl} alt="" /> : <span className="no-icon" />}
            <span className="tab-title">{tab.title}</span>
            {others.length > 0 && (
              <label className="move" title={t('popupMoveTab')}>
                <Icon name="driveFileMove" size={18} />
                <select
                  value=""
                  aria-label={t('popupMoveTab')}
                  onChange={(e) => e.target.value && onEdit({ kind: 'move-tab', tabId: tab.tabId, toGroupId: e.target.value })}
                >
                  <option value="">{t('popupMoveTo')}</option>
                  {others.map((other) => (
                    <option key={other.id} value={other.id}>
                      {other.name || t('popupUnnamed')}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="icon small danger"
              title={t('popupRemoveTab')}
              aria-label={t('popupRemoveTab')}
              onClick={() => onEdit({ kind: 'remove-tab', tabId: tab.tabId })}
            >
              <Icon name="close" size={16} />
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}
