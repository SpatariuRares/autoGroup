import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { t } from '../../src/shared/i18n';
import { App } from './App';
import '../../src/ui/base.css';
import './style.css';

document.documentElement.lang = navigator.language;
// Il <title> dell'HTML serve a WXT per il titolo dell'azione nel manifest; qui lo traduciamo.
document.title = t('popupTitle');
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
