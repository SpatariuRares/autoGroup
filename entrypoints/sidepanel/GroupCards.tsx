import { useEffect, useState } from 'react';
import type { ExistingGroupView } from '../../src/organizer/window-view';
import { t } from '../../src/shared/i18n';
import { GROUP_COLORS, type ProposalEdit, type ProposedGroup, type ProposedTab } from '../../src/shared/types';
import { Icon } from '../../src/ui/Icon';
import { addedCount, tabCount, TabRow, type Target } from './TabRow';

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
export function GroupCard({ group, targets, onMove, onEdit, onClose, onSave, saving, readOnly = false }: GroupCardProps) {
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
export function ExistingCard({
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
