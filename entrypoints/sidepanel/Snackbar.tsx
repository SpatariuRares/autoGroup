import { t } from '../../src/shared/i18n';
import type { OrganizerState, RememberOffer } from '../../src/shared/types';
import { Snackbar as Message, type Hold } from '../../src/ui/Snackbar';
import { openSettings } from './open-settings';

type Notice = NonNullable<OrganizerState['notice']>;

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
      return <Message text={t('panelRememberSite', [offer.site, offer.category])} action={{ label: t('panelRememberSiteYes'), onClick: () => onRemember(offer) }} hold={pauseOffer} />;
    }
    if (savingName !== null) return <Message text={t('panelSavingToList', savingName)} />;
    if (saved) {
      const action = saved.key === 'saveToListNoDescription' ? { label: t('popupWarningSettings'), onClick: () => openSettings('categories') } : undefined;
      return <Message text={t(saved.key, saved.arg)} action={action} hold={pauseSaved} />;
    }
    if (withProposal && notice) return <Message text={t(notice.key, notice.arg)} />;
    return null;
  }
}
