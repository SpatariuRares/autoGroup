import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { t } from '../../src/shared/i18n';
import '../../src/ui/base.css';
import { App } from './App';
import './style.css';

document.documentElement.lang = navigator.language;
document.title = t('optionsTitle');
// Il popup può aprire una sezione precisa, es. options.html#generator.
window.addEventListener('load', () => document.getElementById(location.hash.slice(1))?.scrollIntoView());
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
