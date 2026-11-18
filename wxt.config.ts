import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '__MSG_extName__',
    // The full name carries the words searched for in the store; where space is short Chrome shows this.
    short_name: 'autoGroup',
    description: '__MSG_extDescription__',
    default_locale: 'it',
    permissions: ['tabs', 'tabGroups', 'storage', 'scripting'],
    // Requested only when needed: the configured provider's host (on save) and <all_urls>
    // for page descriptions (when the option is turned on).
    optional_host_permissions: ['http://*/*', 'https://*/*', '<all_urls>'],
    // Only for scripts/smoke.mjs: in headless the permission request cannot be accepted,
    // so the test build grants them in advance (local providers and page descriptions).
    ...(process.env.AUTOGROUP_SMOKE ? { host_permissions: ['<all_urls>'] } : {}),
    action: {
      default_title: '__MSG_actionTitle__',
    },
    // Opens the side panel. It is only suggested: the user can change it at chrome://extensions/shortcuts,
    // and Chrome does not assign it if another extension already uses it. Without a description: for
    // _execute_action Chrome ignores it and shows the action's title.
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+G' },
      },
    },
  },
});
