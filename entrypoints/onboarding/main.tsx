import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { t } from '../../src/shared/i18n';
import '../../src/ui/md3-tokens.css';
import '../../src/ui/base.css';
import '../options/style.css';
import { App } from './App';
import './style.css';

// La lingua dei testi, non quella del browser: senza traduzione Chrome usa l'italiano (default_locale).
document.documentElement.lang = t('extLang');
document.title = t('onboardingTitle');
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
