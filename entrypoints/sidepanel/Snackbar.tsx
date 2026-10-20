import { t } from '../../src/shared/i18n';
import type { OrganizerState, RememberOffer } from '../../src/shared/types';
import type { useExpiring } from '../../src/ui/use-expiring';
import { openSettings } from './open-settings';

type Notice = NonNullable<OrganizerState['notice']>;
/** Da spargere sulla snackbar: finché c'è sopra il mouse o il focus non sparisce. */
type Hold = ReturnType<typeof useExpiring>[2];

/**
 * La snackbar del pannello: una sola alla volta, la prima che c'è in quest'ordine.
 * 1. L'offerta "Metti sempre qui" dopo "Sposta in…" verso una categoria (`offer`), solo con una proposta.
 * 2. "Aggiungi alle categorie" in corso (`savingName`).
 * 3. Il suo esito (`saved`), con il collegamento alle categorie se manca la descrizione.
 * 4. L'ultimo avviso dell'Organizzatore, solo con una proposta (`notice`); senza, l'avviso è un banner.
 * La regione live è sempre presente: la snackbar che ci compare dentro viene letta.
 */
export function Snackbar({
  withProposal,
  offer,
  pauseOffer,
  onRemember,
  savingName,
  saved,
  pauseSaved,
  notice,
}: {
  withProposal: boolean;
  offer: RememberOffer | null;
  pauseOffer: Hold;
  onRemember: (offer: RememberOffer) => void;
  savingName: string | null;
  saved: Notice | null;
  pauseSaved: Hold;
  notice?: Notice;
}) {
  return <div role="status">{content()}</div>;

  function content() {
    if (withProposal && offer) {
      return (
        <div className="snackbar" {...pauseOffer}>
          <span>{t('panelRememberSite', [offer.site, offer.category])}</span>
          <button className="text small inverse" onClick={() => onRemember(offer)}>
            {t('panelRememberSiteYes')}
          </button>
        </div>
      );
    }
    if (savingName !== null) {
      return (
        <div className="snackbar">
          <span>{t('panelSavingToList', savingName)}</span>
        </div>
      );
    }
    if (saved) {
      return (
        <div className="snackbar" {...pauseSaved}>
          <span>{t(saved.key, saved.arg)}</span>
          {saved.key === 'saveToListNoDescription' && (
            <button className="text small inverse" onClick={() => openSettings('categories')}>
              {t('popupWarningSettings')}
            </button>
          )}
        </div>
      );
    }
    if (withProposal && notice) {
      return (
        <div className="snackbar">
          <span>{t(notice.key, notice.arg)}</span>
        </div>
      );
    }
    return null;
  }
}
