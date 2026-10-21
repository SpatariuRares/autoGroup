import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../../src/shared/i18n';
import { GROUP_COLORS, type ExistingGroupView, type ProposedGroup } from '../../src/shared/types';
import { Icon } from '../../src/ui/Icon';
import { moveInRadioGroup } from '../../src/ui/radio-keys';
import { DragContext, useGroupDrag } from './drag';
import { useExpiring } from './hooks';
import { motionKey, withMotion } from './motion';
import { reorderAt, type Reorder, type Target } from './move-targets';
import { usePanelActions } from './panel-actions';
import { setCollapsed } from './tab-actions';
import { addedCount, tabCount, TabRow } from './TabRow';

/** Quanto resta armato "Chiudi gruppo" dopo il primo clic. */
const CONFIRM_MS = 4000;

/**
 * Un gruppo nuovo della proposta: nome e colore modificabili, tab spostabili (`targets`). Con
 * `readOnly` (anteprima per sito durante il calcolo) si guarda soltanto.
 */
export function GroupCard({ group, targets, readOnly = false }: { group: ProposedGroup; targets: Target[]; readOnly?: boolean }) {
  const { edit, closeTab, saveProposedGroup, adding } = usePanelActions();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const swatch = useRef<HTMLButtonElement>(null);
  // Chiudendo la tavolozza il focus torna sul pallino: i suoi pulsanti spariscono e lo lascerebbero sul body.
  const closePalette = () => {
    swatch.current?.focus();
    setPaletteOpen(false);
  };

  if (readOnly) {
    return (
      <li className="group preview" {...motionKey('group', group.id)}>
        <div className="group-header">
          <span className={`swatch static color-${group.color}`} />
          <span className="visually-hidden">{t(`color_${group.color}`)}</span>
          <span className="group-name static">{group.name}</span>
          <GroupMeta group={group} />
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
    <li className="group" {...motionKey('group', group.id)}>
      <div className="group-header">
        <button
          ref={swatch}
          className={`swatch color-${group.color}`}
          data-tooltip={t('popupChangeColor')}
          data-tooltip-align="start"
          aria-label={`${t('popupChangeColor')}: ${t(`color_${group.color}`)}`}
          aria-expanded={paletteOpen}
          onClick={() => setPaletteOpen(!paletteOpen)}
        />
        <GroupNameInput name={group.name} onRename={(name) => edit({ kind: 'rename', groupId: group.id, name })} />
        <GroupMeta group={group} />
        <span className="group-end">
          <span className="group-actions">
            <SaveToCategories
              inCategories={group.provenance === 'list' || adding === group.id}
              canSave={group.name.trim() !== ''}
              iconSize={18}
              onSave={() => saveProposedGroup(group)}
            />
          </span>
          <button
            className="icon small danger"
            data-tooltip={t('popupDiscardGroup')}
            aria-label={t('popupDiscardGroup')}
            onClick={() => edit({ kind: 'discard-group', groupId: group.id })}
          >
            <Icon name="close" size={18} />
          </button>
        </span>
      </div>
      {paletteOpen && (
        <div className="palette" role="radiogroup" aria-label={t('popupChangeColor')} onKeyDown={(e) => (e.key === 'Escape' ? closePalette() : moveInRadioGroup(e))}>
          {GROUP_COLORS.map((color) => (
            <button
              key={color}
              role="radio"
              aria-checked={color === group.color}
              // Aprendo la tavolozza il focus va sul colore attuale; le frecce passano agli altri.
              autoFocus={color === group.color}
              tabIndex={color === group.color ? 0 : -1}
              className={`swatch color-${color}${color === group.color ? ' selected' : ''}`}
              data-tooltip={t(`color_${color}`)}
              aria-label={t(`color_${color}`)}
              onClick={() => {
                closePalette();
                if (color !== group.color) edit({ kind: 'recolor', groupId: group.id, color });
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
            onRemove={() => edit({ kind: 'remove-tab', tabId: tab.tabId })}
            onClose={() => closeTab(tab.tabId)}
          />
        ))}
      </ul>
    </li>
  );
}

/**
 * Il nome di un gruppo, da modificare. Invio o uscire dal campo salvano il nome se è cambiato; Esc
 * torna al nome di adesso. Con `onDone` (il campo compare solo mentre si modifica) Esc esce anche
 * dal campo, senza salvare, e `onDone` arriva all'uscita.
 */
function GroupNameInput({ name, onRename, onDone }: { name: string; onRename: (name: string) => void; onDone?: () => void }) {
  const [value, setValue] = useState(name);
  const cancelled = useRef(false);
  // Il gruppo nuovo segue il nome della proposta; il campo di un gruppo aperto, che c'è solo mentre si
  // scrive, non perde quanto scritto se il nome cambia in Chrome.
  useEffect(() => {
    if (!onDone) setValue(name);
  }, [name]);
  return (
    <input
      className="group-name"
      value={value}
      autoFocus={onDone !== undefined}
      aria-label={t('popupGroupName')}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (!cancelled.current && value.trim() !== name) onRename(value);
        cancelled.current = false;
        onDone?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(name);
          if (onDone) {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }
      }}
    />
  );
}

/**
 * "Aggiungi alle categorie" (`canSave`: il gruppo ha un nome). Per un gruppo che è già una categoria,
 * o che lo sta diventando (`inCategories`), al posto del pulsante c'è solo il segno.
 */
function SaveToCategories({ inCategories, canSave, iconSize, onSave }: { inCategories: boolean; canSave: boolean; iconSize: number; onSave: () => void }) {
  const { busy } = usePanelActions();
  // Se il pulsante aveva il focus, lo prende il segno che lo sostituisce.
  const savedHere = useRef(false);
  if (inCategories) return <InCategories focus={savedHere.current} />;
  if (!canSave) return null;
  return (
    <button
      className="icon small save"
      disabled={busy}
      data-tooltip={t('popupSaveToListHint')}
      aria-label={t('popupSaveToList')}
      onClick={(e) => {
        savedHere.current = document.activeElement === e.currentTarget;
        onSave();
      }}
    >
      <Icon name="bookmarkAdd" size={iconSize} />
    </button>
  );
}

/**
 * Al posto di "Aggiungi alle categorie" per un gruppo che è già una categoria: solo un segno, nessuna
 * azione. Compare già al clic su "Aggiungi", mentre il salvataggio è in corso. Con `focus` (il pulsante
 * che sostituisce aveva il focus) lo prende lui: senza, il recupero del focus lo manderebbe nel gruppo accanto.
 */
function InCategories({ focus = false }: { focus?: boolean }) {
  const mark = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (focus) mark.current?.focus();
  }, []);
  return (
    <span ref={mark} className="in-categories" role="img" tabIndex={-1} data-tooltip={t('panelInCategories')} aria-label={t('panelInCategories')}>
      <Icon name="bookmarkAdded" size={18} />
    </span>
  );
}

/** "Sposta il gruppo": Su e Giù di un posto nella barra, l'alternativa al trascinamento dell'intestazione. */
function MoveGroup({ name, reorder }: { name: string; reorder: Reorder }) {
  return (
    <label className="move" data-tooltip={t('panelMoveGroup')}>
      <Icon name="swapVert" size={18} />
      <select
        value=""
        aria-label={`${t('panelMoveGroup')}: ${name}`}
        onChange={(e) => (e.target.value === 'up' || e.target.value === 'down') && reorder.onMove(e.target.value)}
      >
        <option value="">{t('panelMoveGroup')}</option>
        {reorder.up && <option value="up">{t('panelMoveUp')}</option>}
        {reorder.down && <option value="down">{t('panelMoveDown')}</option>}
      </select>
    </label>
  );
}

/** Provenienza e numero di tab, nella riga del titolo per tenere le schede basse. */
function GroupMeta({ group }: { group: ProposedGroup }) {
  return (
    <span className="group-meta">
      <span className={`badge provenance-${group.provenance}`}>{t(`provenance_${group.provenance}`)}</span>
      <span className="count">{tabCount(group.tabs.length)}</span>
    </span>
  );
}

/**
 * Un gruppo già aperto in Chrome: il colore resta quello di Chrome, il nome si cambia dalla matita (per
 * una categoria cambia anche la categoria). Se non è una categoria si aggiunge alle categorie; se lo è,
 * al posto del pulsante mostra solo il segno. Le sue tab di adesso
 * sono solo da vedere; quelle che la proposta gli aggiunge sono segnate come nuove e si possono togliere.
 * Un gruppo senza aggiunte resta chiuso, per non allungare l'elenco. Dall'intestazione si comprime o
 * espande il gruppo in Chrome e si chiudono tutte le sue tab (al secondo clic, entro qualche secondo).
 * Dall'intestazione si trascina tutto il gruppo; le sue tab di adesso si trascinano una per una
 * (`nextGroupId`: il gruppo che lo segue nella barra, vedi `useGroupDrag`). Senza trascinare: "Sposta il
 * gruppo" (`reorder`), e per le sue tab "Sposta in…" (`liveTargets`) con Su e Giù.
 */
export function ExistingCard({
  existing,
  targets,
  nextGroupId,
  reorder,
  liveTargets = [],
  readOnly = false,
}: {
  existing: ExistingGroupView;
  nextGroupId: number | null;
  /** Per le tab che la proposta gli aggiunge. */
  targets: Target[];
  /** Assente mentre il trascinamento non è possibile (calcolo in corso, anteprima). */
  reorder?: Reorder;
  /** Per le sue tab di adesso. */
  liveTargets?: Target[];
  readOnly?: boolean;
}) {
  const { group, current, added, collapsed, isCategory } = existing;
  const { edit, closeTab, closeGroup, renameGroup, moveTab, saveOpenGroup, adding } = usePanelActions();
  const { enabled: canDrag } = useContext(DragContext);
  const [armed, setArmed] = useExpiring<true>(CONFIRM_MS);
  // Uscendo dal campo il nome si salva, Esc annulla (vedi `GroupNameInput`).
  const [editing, setEditing] = useState(false);
  const pencil = useRef<HTMLButtonElement>(null);
  const stopEditing = () => {
    setEditing(false);
    // Il campo sparisce: il focus torna sulla matita invece di finire sul body.
    requestAnimationFrame(() => pencil.current?.focus());
  };
  // Come faceva <details open>: aperta se la proposta gli aggiunge tab, chiusa se non più.
  const [open, setOpen] = useState(added.length > 0);
  useEffect(() => setOpen(added.length > 0), [added.length > 0]);
  const listId = `existing-group-${group.id}`;
  const { card, header } = useGroupDrag(group.id, nextGroupId);
  const { className: dropClass, ...cardProps } = card;
  return (
    <li className={`group existing${added.length > 0 ? ' extended' : ''}${dropClass}`} {...motionKey('group', group.id)} {...cardProps}>
      {/* I pulsanti stanno accanto all'intestazione, non dentro: un controllo dentro un altro (com'era nel
          <summary>) non è valido, e molti screen reader non leggono o non raggiungono quello interno. */}
      {/* Mentre si scrive il nome l'intestazione non si trascina: il trascinamento selezionerebbe il testo. */}
      <div className="group-header" {...(!editing ? header : {})}>
        {!editing ? (
          <button className="group-toggle" aria-expanded={open} aria-controls={listId} onClick={() => withMotion(() => setOpen(!open))}>
            {/* La freccia dice che il gruppo si apre: a riposo l'intestazione è solo pallino, nome e conteggio. */}
            <Icon name="chevronRight" size={18} />
            {/* Un aria-label su uno <span> senza ruolo viene ignorato: il colore è testo nascosto. */}
            <span className={`swatch static color-${group.color}`} />
            <span className="visually-hidden">{t(`color_${group.color}`)}</span>
            <span className="group-name static">{group.name || t('popupUnnamed')}</span>
            <span className="count">
              {tabCount(current.length)}
              {added.length > 0 && <strong> {addedCount(added.length)}</strong>}
            </span>
          </button>
        ) : (
          <>
            <span className={`swatch static color-${group.color}`} />
            <GroupNameInput name={group.name} onRename={(name) => renameGroup(group.id, name)} onDone={stopEditing} />
          </>
        )}
        <span className={`group-end${armed ? ' armed' : ''}`}>
          <span className="group-actions">
            {!readOnly && !editing && (
              <button
                ref={pencil}
                className="icon small"
                data-tooltip={t('panelRenameGroup')}
                aria-label={t('panelRenameGroup')}
                onClick={() => setEditing(true)}
              >
                <Icon name="edit" size={16} />
              </button>
            )}
            <SaveToCategories
              inCategories={isCategory || adding === group.id}
              canSave={!readOnly && group.name.trim() !== ''}
              iconSize={16}
              onSave={() => saveOpenGroup(group)}
            />
            {reorder && (reorder.up || reorder.down) && !editing && <MoveGroup name={group.name || t('popupUnnamed')} reorder={reorder} />}
            <button
              className="icon small"
              data-tooltip={t(collapsed ? 'panelExpandGroup' : 'panelCollapseGroup')}
              aria-label={t(collapsed ? 'panelExpandGroup' : 'panelCollapseGroup')}
              onClick={() => setCollapsed(group.id, !collapsed)}
            >
              <Icon name={collapsed ? 'unfoldMore' : 'unfoldLess'} size={16} />
            </button>
          </span>
          {!readOnly &&
            (armed ? (
              <button
                className="text small close-group"
                onClick={() => {
                  setArmed(null);
                  closeGroup(group.id);
                }}
              >
                {current.length === 1 ? t('panelCloseGroupConfirmOne') : t('panelCloseGroupConfirm', String(current.length))}
              </button>
            ) : (
              <button className="icon small danger" data-tooltip={t('panelCloseGroup')} aria-label={t('panelCloseGroup')} onClick={() => setArmed(true)}>
                <Icon name="close" size={16} />
              </button>
            ))}
        </span>
      </div>
      <ul id={listId} className="tabs" hidden={!open}>
        {added.map((tab) => (
          readOnly ? (
            <TabRow key={tab.tabId} tab={tab} added />
          ) : (
            <TabRow
              key={tab.tabId}
              tab={tab}
              added
              targets={targets}
              onRemove={() => edit({ kind: 'remove-tab', tabId: tab.tabId })}
              onClose={() => closeTab(tab.tabId)}
            />
          )
        ))}
        {current.map((tab, i) => (
          <TabRow
            key={tab.tabId}
            tab={tab}
            targets={liveTargets}
            onClose={() => closeTab(tab.tabId)}
            drag={{ groupId: group.id, nextTabId: current[i + 1]?.tabId ?? null }}
            reorder={canDrag ? reorderAt(current.map((x) => x.tabId), i, (before) => moveTab(tab.tabId, group.id, before)) : undefined}
          />
        ))}
      </ul>
    </li>
  );
}
