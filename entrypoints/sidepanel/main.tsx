import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { t } from '../../src/shared/i18n';
import { dismissTooltipsOnEscape } from '../../src/ui/tooltip-dismiss';
import { App } from './App';
import '../../src/ui/md3-tokens.css';
import '../../src/ui/base.css';
import './style.css';

// The language of the texts, not the browser's: without a translation Chrome uses Italian (default_locale).
document.documentElement.lang = t('extLang');
dismissTooltipsOnEscape();
document.title = t('popupTitle');
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
