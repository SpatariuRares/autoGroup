import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { createOrganizer } from '../src/organizer';
import { announceState, serveOrganizer } from '../src/shared/organizer-remote';
import { openOnboardingOnInstall } from '../src/shared/onboarding';

export default defineBackground(() => {
  // Il clic sull'icona (e la scorciatoia) apre il pannello laterale: a differenza di un popup resta
  // aperto mentre l'utente cambia tab e mentre l'AI calcola la proposta.
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => console.error('autoGroup:', err));
  browser.runtime.onInstalled.addListener((details) => {
    openOnboardingOnInstall(details).catch((err) => console.error('autoGroup:', err));
  });

  const organizer = createOrganizer({ onStateChange: announceState });
  serveOrganizer(organizer);

  // Raggruppamento automatico con le regole sui siti: solo quando l'URL cambia, non a ogni ricarica,
  // così una tab tolta a mano dal gruppo non ci rientra finché non cambia pagina.
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url !== undefined) organizer.autoGroupTab(tabId);
  });

  // Proposta scaduta: dopo un cambio di tab, gruppi, impostazioni o permessi l'Organizzatore la
  // ricontrolla con la sua impronta. Più cambi ravvicinati (es. "Chiudi doppioni") valgono un controllo.
  let recheckTimer: ReturnType<typeof setTimeout> | undefined;
  const recheck = () => {
    clearTimeout(recheckTimer);
    recheckTimer = setTimeout(() => organizer.checkStale().catch((err) => console.error('autoGroup:', err)), 150);
  };
  browser.tabs.onCreated.addListener(recheck);
  browser.tabs.onRemoved.addListener(recheck);
  browser.tabs.onAttached.addListener(recheck);
  browser.tabs.onDetached.addListener(recheck);
  // Titoli, favicon, audio e tab attiva non contano; il caricamento finito sì (una tab senza titolo vero non è candidata).
  browser.tabs.onUpdated.addListener((_tabId, change) => {
    if (change.url !== undefined || change.pinned !== undefined || change.groupId !== undefined || change.status === 'complete') recheck();
  });
  browser.tabGroups.onCreated.addListener(recheck);
  browser.tabGroups.onUpdated.addListener(recheck);
  browser.tabGroups.onRemoved.addListener(recheck);
  // Non "session": è dove l'Organizzatore salva il suo stato.
  browser.storage.onChanged.addListener((_changes, area) => area !== 'session' && recheck());
  browser.permissions.onAdded.addListener(recheck);
  browser.permissions.onRemoved.addListener(recheck);
});
