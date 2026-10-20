import { BACKUP_KEYS } from '../../src/settings';
import { importSettings } from '../../src/settings/backup';
import { t } from '../../src/shared/i18n';
import { ModeSection } from '../../src/ui/settings/ModeSection';
import { BackupSection } from './BackupSection';
import { TabsSection } from './TabsSection';
import type { PageProps } from './use-save';

/** Generale: come raggruppare e quali tab organizzare. */
export function GeneralView({ settings, saving: { save, update } }: PageProps) {
  // "Annulla" dopo un import rimette tutte le preferenze del backup com'erano.
  const before = Object.fromEntries(BACKUP_KEYS.map((key) => [key, settings[key]]));
  return (
    <>
      <ModeSection mode={settings.mode} onChange={(mode) => update({ mode })} />
      <TabsSection
        minTabs={settings.minTabs}
        onMinTabs={(minTabs) => update({ minTabs })}
        excludedDomains={settings.excludedDomains}
        onExcludedDomains={(excludedDomains) => update({ excludedDomains })}
      />
      <BackupSection settings={settings} onImport={(text, onError) => save(() => importSettings(text), { undo: { text: t('optionsImported'), before }, onError })} />
    </>
  );
}
