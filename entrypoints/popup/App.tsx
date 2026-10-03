import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { t, warningKey } from '../../src/shared/i18n';
import { callOrganizer, onOrganizerState } from '../../src/shared/organizer-client';
import { GROUP_COLORS, type OrganizerState, type ProposalEdit, type ProposedGroup } from '../../src/shared/types';

/** Apre le impostazioni sulla sezione del provider coinvolto. */
function openSettings(section: 'generator' | 'classifier') {
  browser.tabs.create({ url: browser.runtime.getURL(`/options.html#${section}`) });
}

export function App() {
  const [state, setState] = useState<OrganizerState | null>(null);
  const [windowId, setWindowId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<'popupApplied' | 'popupUndone' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

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

  const proposal = state?.phase === 'ready' && state.windowId === windowId ? state.proposal : undefined;
  const canUndo = state?.undo !== undefined && state.undo.windowId === windowId;

  return (
    <main>
      <header>
        <h1>{t('popupTitle')}</h1>
        <button className="icon settings" title={t('popupOpenSettings')} onClick={() => browser.runtime.openOptionsPage()}>
          ⚙ {t('popupOpenSettings')}
        </button>
      </header>

      {(failure ?? state?.error) && <p className="notice error">{t((failure ?? state?.error)!)}</p>}
      {notice && !proposal && <p className="notice">{t(notice)}</p>}

      {(!state || state.phase === 'computing') && <p className="status">{t('popupComputing')}</p>}

      {proposal && proposal.warnings.length > 0 && (
        <ul className="warnings" role="alert">
          {proposal.warnings.map((w, i) => (
            <li key={i}>
              {t('popupWarningFallback')} {t(warningKey(w.cause), w.provider)}{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); openSettings(w.level); }}>
                {t('popupWarningSettings')}
              </a>
            </li>
          ))}
        </ul>
      )}

      {proposal && proposal.groups.length === 0 && <p className="status">{t('popupNoGroups')}</p>}

      {proposal && proposal.groups.length > 0 && (
        <ul className="groups">
          {proposal.groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              others={proposal.groups.filter((g) => g.id !== group.id)}
              onEdit={edit}
            />
          ))}
        </ul>
      )}

      <footer>
        {canUndo && (
          <button
            className="secondary undo"
            disabled={busy}
            onClick={() => run({ type: 'organizer/undo' }, () => setNotice('popupUndone'))}
          >
            {t('popupUndo')}
          </button>
        )}
        {windowId !== null && state?.phase !== 'computing' && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              setNotice(null);
              run({ type: 'organizer/propose', windowId, force: true });
            }}
          >
            {t('popupRecompute')}
          </button>
        )}
        {proposal && proposal.groups.length > 0 && (
          <button disabled={busy} onClick={() => run({ type: 'organizer/apply' }, () => setNotice('popupApplied'))}>
            {t('popupApply')}
          </button>
        )}
      </footer>
    </main>
  );
}

interface GroupCardProps {
  group: ProposedGroup;
  others: ProposedGroup[];
  onEdit: (edit: ProposalEdit) => void;
}

function GroupCard({ group, others, onEdit }: GroupCardProps) {
  const [name, setName] = useState(group.name);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => setName(group.name), [group.name]);

  const commitName = () => {
    if (name.trim() !== group.name) onEdit({ kind: 'rename', groupId: group.id, name });
  };

  // Un gruppo già aperto in Chrome mantiene nome e colore: "Applica" vi aggiunge solo le tab.
  const locked = group.provenance === 'existing';

  return (
    <li className="group">
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
        <span className="badge">{t(`provenance_${group.provenance}`)}</span>
        <span className="count">{t('popupTabCount', String(group.tabs.length))}</span>
        <button
          className="icon"
          title={t('popupDiscardGroup')}
          aria-label={t('popupDiscardGroup')}
          onClick={() => onEdit({ kind: 'discard-group', groupId: group.id })}
        >
          ✕
        </button>
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
              <select
                className="move"
                value=""
                aria-label={t('popupMoveTab')}
                title={t('popupMoveTab')}
                onChange={(e) => e.target.value && onEdit({ kind: 'move-tab', tabId: tab.tabId, toGroupId: e.target.value })}
              >
                <option value="">{t('popupMoveTo')}</option>
                {others.map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.name || t('popupUnnamed')}
                  </option>
                ))}
              </select>
            )}
            <button
              className="icon"
              title={t('popupRemoveTab')}
              aria-label={t('popupRemoveTab')}
              onClick={() => onEdit({ kind: 'remove-tab', tabId: tab.tabId })}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}
