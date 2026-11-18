import type { Settings } from '../../src/settings';
import { importSettings } from '../../src/settings/backup';
import { t } from '../../src/shared/i18n';
import { ModeSection } from '../../src/ui/settings/ModeSection';
import { BackupSection } from './BackupSection';
import { TabsSection } from './TabsSection';
import type { PageProps } from './use-save';

/** General: how to group and which tabs to organize. */
export function GeneralView({ settings, saving: { save, update } }: PageProps) {
  // "Undo" after an import restores as they were only the preferences that the file changed.
  const before = (patch: Partial<Settings>) => Object.fromEntries(Object.keys(patch).map((key) => [key, settings[key as keyof Settings]])) as Partial<Settings>;
  return (
    <>
      <ModeSection mode={settings.mode} onChange={(mode) => update({ mode })} />
      <TabsSection
        minTabs={settings.minTabs}
        onMinTabs={(minTabs) => update({ minTabs })}
        excludedDomains={settings.excludedDomains}
        onExcludedDomains={(excludedDomains) => update({ excludedDomains })}
      />
      <BackupSection settings={settings} onImport={(text, onError) => save(() => importSettings(text), { undo: (patch) => ({ text: t('optionsImported'), before: before(patch) }), onError })} />
    </>
  );
}
