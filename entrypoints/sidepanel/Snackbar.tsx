import { t } from '../../src/shared/i18n';
import type { OrganizerState, RememberOffer } from '../../src/shared/types';
import { Snackbar as Message, type Hold } from '../../src/ui/Snackbar';
import { openSettings } from './open-settings';

type Notice = NonNullable<OrganizerState['notice']>;

/**
 * The panel's snackbar: only one at a time, the first one present in this order.
 * 1. The offer "Always put here" after "Move to…" towards a category (`offer`), only with a proposal.
 * 2. "Add to categories" in progress (`savingName`).
 * 3. Its outcome (`saved`), with the link to the categories if the description is missing.
 * 4. The Organizer's latest notice, only with a proposal (`notice`); without one, the notice is a banner.
 * The live region is always present: the snackbar that appears inside it is read out.
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
