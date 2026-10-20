import { browser } from 'wxt/browser';
import { t } from '../../src/shared/i18n';
import { Card } from '../../src/ui/settings/Card';

/** Pagina Buy Me a Coffee dell'autore. */
const COFFEE_URL = 'https://www.buymeacoffee.com/SpatariuRares';
const REPO_URL = 'https://github.com/SpatariuRares/autoGroup';
const STORE_URL = 'https://chromewebstore.google.com/detail/gpfcmddgokgkjdeecjhgbbdcpjffcmke';
/** Informativa completa: la stessa pubblicata per il Chrome Web Store. */
const PRIVACY_URL = `${REPO_URL}/blob/main/docs/store/privacy.md`;

/** Link esterno, in una nuova scheda. */
function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a className="guide-link" href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}

/**
 * Informazioni: cosa fa autoGroup, privacy in breve (fedele a docs/store/privacy.md, con il link
 * all'informativa completa) e "Offrimi un caffè". Il pulsante è locale, nello stile di Buy Me a
 * Coffee: l'immagine ufficiale verrebbe scaricata dal loro sito a ogni apertura della pagina.
 */
export function AboutView() {
  return (
    <>
      <Card id="about-card" title="autoGroup" hint={t('optionsVersion', browser.runtime.getManifest().version)}>
        <p>{t('optionsAboutText')}</p>
        <div className="extra-links">
          <a className="guide-link" href="/onboarding.html" target="_blank">
            {t('optionsOnboarding')}
          </a>
          <ExternalLink href={STORE_URL} label={t('optionsAboutRate')} />
          <ExternalLink href={REPO_URL} label={t('optionsAboutSource')} />
          <ExternalLink href={`${REPO_URL}/issues`} label={t('optionsAboutIssue')} />
        </div>
      </Card>

      <Card id="about-privacy" title={t('optionsAboutPrivacy')} hint={t('optionsAboutPrivacyHint')}>
        {(
          [
            ['optionsAboutLocal', 'optionsAboutLocalHint'],
            ['optionsAboutProvider', 'optionsAboutProviderHint'],
            ['optionsAboutKeys', 'optionsAboutKeysHint'],
          ] as const
        ).map(([title, hint]) => (
          <div key={title} className="setting setting-text">
            <strong>{t(title)}</strong>
            <span className="hint">{t(hint)}</span>
          </div>
        ))}
        <div className="setting">
          <ExternalLink href={PRIVACY_URL} label={t('optionsAboutPolicy')} />
        </div>
      </Card>

      <Card id="about-support" title={t('optionsAboutSupport')} hint={t('optionsAboutSupportHint')}>
        <div className="extra-links">
          <a className="coffee" href={COFFEE_URL} target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true">✈️</span>
            {t('optionsCoffee')}
          </a>
        </div>
      </Card>
    </>
  );
}
