import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'it',
    permissions: ['tabs', 'tabGroups', 'storage', 'scripting'],
    // Chiesti solo per l'host del provider configurato, al salvataggio nelle impostazioni.
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    // Solo per scripts/smoke.mjs: in headless la richiesta del permesso non si può accettare.
    ...(process.env.AUTOGROUP_SMOKE ? { host_permissions: ['http://127.0.0.1/*'] } : {}),
    action: {
      default_title: '__MSG_actionTitle__',
    },
  },
});
