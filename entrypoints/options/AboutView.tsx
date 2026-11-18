import { browser } from 'wxt/browser';
import { t } from '../../src/shared/i18n';
import { Card } from '../../src/ui/settings/Card';

/** The author's Buy Me a Coffee page. */
const COFFEE_URL = 'https://www.buymeacoffee.com/SpatariuRares';
const REPO_URL = 'https://github.com/SpatariuRares/autoGroup';
const STORE_URL = 'https://chromewebstore.google.com/detail/gpfcmddgokgkjdeecjhgbbdcpjffcmke';
/** Full privacy policy: the same one published for the Chrome Web Store. */
const PRIVACY_URL = `${REPO_URL}/blob/main/docs/store/privacy.md`;

/** External link, in a new tab. */
function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a className="guide-link" href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}

/**
 * About: what autoGroup does, privacy in brief (faithful to docs/store/privacy.md, with the link to
 * the full policy) and "Buy me a coffee". The button is local, in the style of Buy Me a Coffee: the
 * official image would be downloaded from their site every time the page is opened.
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
