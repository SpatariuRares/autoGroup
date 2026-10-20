import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../../src/shared/i18n';
import { GROUP_COLORS, type ExistingGroupView, type ProposalEdit, type ProposedGroup, type ProposedTab } from '../../src/shared/types';
import { Icon } from '../../src/ui/Icon';
import { moveInRadioGroup } from '../../src/ui/radio-keys';
import { useGroupDrag } from './drag';
import { useExpiring } from './hooks';
import { setCollapsed } from './tab-actions';
import { addedCount, tabCount, TabRow, type Reorder, type Target } from './TabRow';

/** Quanto resta armato "Chiudi gruppo" dopo il primo clic. */
const CONFIRM_MS = 4000;

interface GroupCardProps {
  group: ProposedGroup;
  targets: Target[];
  onMove: (tab: ProposedTab, value: string) => void;
  onEdit: (edit: ProposalEdit) => void;
  onClose: (tabId: number) => void;
  onSave: () => void;
  saving: boolean;
  /** Vero da quando si preme "Aggiungi alle categorie" a quando il gruppo risulta una categoria. */
  adding?: boolean;
  /** Anteprima per sito durante il calcolo: si guarda soltanto. */
  readOnly?: boolean;
}

/** Un gruppo nuovo della proposta: nome e colore modificabili, tab spostabili. */
export function GroupCard({ group, targets, onMove, onEdit, onClose, onSave, saving, adding = false, readOnly = false }: GroupCardProps) {
  const [name, setName] = useState(group.name);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const swatch = useRef<HTMLButtonElement>(null);
  const savedHere = useRef(false);
  // Chiudendo la tavolozza il focus torna sul pallino: i suoi pulsanti spariscono e lo lascerebbero sul body.
  const closePalette = () => {
    swatch.current?.focus();
    setPaletteOpen(false);
  };
  useEffect(() => setName(group.name), [group.name]);

  const commitName = () => {
    if (name.trim() !== group.name) onEdit({ kind: 'rename', groupId: group.id, name });
  };

  if (readOnly) {
    return (
      <li className="group preview">
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
    <li className="group">
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
        <GroupMeta group={group} />
        <span className="group-end">
          <span className="group-actions">
            {group.provenance === 'list' || adding ? (
              <InCategories focus={savedHere.current} />
            ) : (
              group.name.trim() !== '' && (
                <button
                  className="icon small save"
                  disabled={saving}
                  data-tooltip={t('popupSaveToListHint')}
                  aria-label={t('popupSaveToList')}
                  onClick={(e) => {
                    savedHere.current = document.activeElement === e.currentTarget;
                    onSave();
                  }}
                >
                  <Icon name="bookmarkAdd" size={18} />
                </button>
              )
            )}
          </span>
          <button
            className="icon small danger"
            data-tooltip={t('popupDiscardGroup')}
            aria-label={t('popupDiscardGroup')}
            onClick={() => onEdit({ kind: 'discard-group', groupId: group.id })}
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
 * gruppo" (`reorder`), e per le sue tab "Sposta in…" (`liveTargets`, `onMoveLive`) con Su e Giù (`onMoveTab`).
 */
export function ExistingCard({
  existing,
  targets,
  onMove,
  onEdit,
  onClose,
  onCloseGroup,
  onRename,
  onSave,
  saving,
  adding = false,
  nextGroupId,
  reorder,
  liveTargets = [],
  onMoveLive,
  onMoveTab,
  readOnly = false,
}: {
  existing: ExistingGroupView;
  nextGroupId: number | null;
  targets: Target[];
  onMove: GroupCardProps['onMove'];
  onEdit: GroupCardProps['onEdit'];
  onClose: GroupCardProps['onClose'];
  onCloseGroup: () => void;
  onRename: (name: string) => void;
  onSave: () => void;
  saving: boolean;
  adding?: boolean;
  /** Assente mentre il trascinamento non è possibile (calcolo in corso, anteprima). */
  reorder?: Reorder;
  liveTargets?: Target[];
  onMoveLive?: GroupCardProps['onMove'];
  /** Sposta una tab di adesso dentro il gruppo, prima di `beforeTabId` o in fondo. */
  onMoveTab?: (tabId: number, beforeTabId: number | null) => void;
  readOnly?: boolean;
}) {
  const { group, current, added, collapsed, isCategory } = existing;
  const [armed, setArmed] = useExpiring<true>(CONFIRM_MS);
  const savedHere = useRef(false);
  // Nome in modifica (null: non si sta modificando). Uscendo dal campo il nome si salva, Esc annulla.
  const [name, setName] = useState<string | null>(null);
  const pencil = useRef<HTMLButtonElement>(null);
  const cancelled = useRef(false);
  // Invio ed Esc tolgono il focus dal campo: il nome si salva (o no) solo qui, una volta.
  const stopEditing = () => {
    if (!cancelled.current && name !== null && name.trim() !== group.name) onRename(name);
    cancelled.current = false;
    setName(null);
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
    <li className={`group existing${added.length > 0 ? ' extended' : ''}${dropClass}`} {...cardProps}>
      {/* I pulsanti stanno accanto all'intestazione, non dentro: un controllo dentro un altro (com'era nel
          <summary>) non è valido, e molti screen reader non leggono o non raggiungono quello interno. */}
      {/* Mentre si scrive il nome l'intestazione non si trascina: il trascinamento selezionerebbe il testo. */}
      <div className="group-header" {...(name === null ? header : {})}>
        {name === null ? (
          <button className="group-toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
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
            <input
              className="group-name"
              value={name}
              autoFocus
              aria-label={t('popupGroupName')}
              onChange={(e) => setName(e.target.value)}
              onBlur={stopEditing}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelled.current = true;
                if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
              }}
            />
          </>
        )}
        <span className={`group-end${armed ? ' armed' : ''}`}>
          <span className="group-actions">
            {!readOnly && name === null && (
              <button
                ref={pencil}
                className="icon small"
                data-tooltip={t('panelRenameGroup')}
                aria-label={t('panelRenameGroup')}
                onClick={() => setName(group.name)}
              >
                <Icon name="edit" size={16} />
              </button>
            )}
            {isCategory || adding ? (
              <InCategories focus={savedHere.current} />
            ) : (
              !readOnly &&
              group.name.trim() !== '' && (
                <button
                  className="icon small save"
                  disabled={saving}
                  data-tooltip={t('popupSaveToListHint')}
                  aria-label={t('popupSaveToList')}
                  onClick={(e) => {
                    savedHere.current = document.activeElement === e.currentTarget;
                    onSave();
                  }}
                >
                  <Icon name="bookmarkAdd" size={16} />
                </button>
              )
            )}
            {reorder && (reorder.up || reorder.down) && name === null && <MoveGroup name={group.name || t('popupUnnamed')} reorder={reorder} />}
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
                  onCloseGroup();
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
              onMove={onMove}
              onRemove={() => onEdit({ kind: 'remove-tab', tabId: tab.tabId })}
              onClose={() => onClose(tab.tabId)}
            />
          )
        ))}
        {current.map((tab, i) => (
          <TabRow
            key={tab.tabId}
            tab={tab}
            targets={liveTargets}
            onMove={onMoveLive}
            onClose={() => onClose(tab.tabId)}
            drag={{ groupId: group.id, nextTabId: current[i + 1]?.tabId ?? null }}
            reorder={
              onMoveTab && {
                up: i > 0,
                down: i < current.length - 1,
                // Giù: prima della tab che segue la successiva, o in fondo al gruppo.
                onMove: (direction) => onMoveTab(tab.tabId, direction === 'up' ? current[i - 1]!.tabId : (current[i + 2]?.tabId ?? null)),
              }
            }
          />
        ))}
      </ul>
    </li>
  );
}
