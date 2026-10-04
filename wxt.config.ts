import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'it',
    permissions: ['tabs', 'tabGroups', 'storage', 'scripting'],
    // Chiesti solo quando servono: l'host del provider configurato (al salvataggio) e <all_urls>
    // per la descrizione delle pagine (all'accensione dell'opzione).
    optional_host_permissions: ['http://*/*', 'https://*/*', '<all_urls>'],
    // Solo per scripts/smoke.mjs: in headless la richiesta dei permessi non si può accettare,
    // quindi la build di prova li concede in anticipo (provider locali e descrizioni delle pagine).
    ...(process.env.AUTOGROUP_SMOKE ? { host_permissions: ['<all_urls>'] } : {}),
    action: {
      default_title: '__MSG_actionTitle__',
    },
    // Apre il popup. È solo suggerita: l'utente può cambiarla da chrome://extensions/shortcuts,
    // e Chrome non la assegna se un'altra estensione la usa già. Senza descrizione: per
    // _execute_action Chrome la ignora e mostra il titolo dell'azione.
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+G' },
      },
    },
  },
});
