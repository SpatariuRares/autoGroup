import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { t } from '../../src/shared/i18n';
import { App } from './App';
import '../../src/ui/md3-tokens.css';
import '../../src/ui/base.css';
import './style.css';

document.documentElement.lang = navigator.language;
document.title = t('popupTitle');
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
