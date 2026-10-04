import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { createOrganizer } from '../src/organizer';
import { isOrganizerRequest, type OrganizerRequest, type OrganizerResponse, type StateChangedMessage } from '../src/shared/messages';
import type { OrganizerState } from '../src/shared/types';

export default defineBackground(() => {
  // Il clic sull'icona (e la scorciatoia) apre il pannello laterale: a differenza di un popup resta
  // aperto mentre l'utente cambia tab e mentre l'AI calcola la proposta.
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => console.error('autoGroup:', err));

  const organizer = createOrganizer({
    onStateChange(state) {
      const message: StateChangedMessage = { type: 'organizer/state-changed', state };
      // Se il pannello è chiuso non c'è nessun destinatario: l'errore è atteso.
      browser.runtime.sendMessage(message).catch(() => {});
    },
  });

  function handle(request: OrganizerRequest): Promise<OrganizerState> {
    switch (request.type) {
      case 'organizer/state':
        return organizer.state();
      case 'organizer/propose':
        return organizer.propose(request.windowId, { force: request.force });
      case 'organizer/edit':
        return organizer.edit(request.edit);
      case 'organizer/save-to-list':
        return organizer.saveToList(request.groupId);
      case 'organizer/apply':
        return organizer.apply();
      case 'organizer/abort':
        return organizer.abort();
      case 'organizer/accept-preview':
        return organizer.acceptPreview();
      case 'organizer/undo':
        return organizer.undo();
      case 'organizer/close-tab':
        return organizer.closeTab(request.tabId);
    }
  }

  browser.runtime.onMessage.addListener((request: unknown, _sender, sendResponse) => {
    if (!isOrganizerRequest(request)) return;
    handle(request)
      .then((state) => sendResponse({ ok: true, state } satisfies OrganizerResponse))
      .catch((err) => sendResponse({ ok: false, error: String(err) } satisfies OrganizerResponse));
    return true;
  });
});
