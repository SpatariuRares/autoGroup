import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'it',
    permissions: ['tabs', 'tabGroups', 'storage', 'scripting'],
    action: {
      default_title: '__MSG_actionTitle__',
    },
  },
});
