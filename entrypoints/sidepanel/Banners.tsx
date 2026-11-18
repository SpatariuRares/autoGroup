import { useLayoutEffect, useRef, useState } from 'react';
import { t, warningKey } from '../../src/shared/i18n';
import type { Proposal, ProposedTab } from '../../src/shared/types';
import { Icon, type IconName } from '../../src/ui/Icon';
import { openSettings } from './open-settings';

/**
 * Computing in progress: progress bar, "Stop" and, with the per-site preview, "Use this".
 * The buttons appear only once the service worker has really started (`started`).
 */
export function ComputingStatus({
  preview,
  started,
  onAccept,
  onAbort,
}: {
  preview?: Proposal;
  started: boolean;
  onAccept: () => void;
  onAbort: () => void;
}) {
  return (
    // The text is announced by the panel's live region: this one already appears full and would not be read.
    <div className="status computing">
      <div className="md-linear-progress" aria-hidden="true" />
      <div className="status-row">
        <span>{t(preview ? 'panelPreviewComputing' : 'popupComputing')}</span>
        {started && (
          <span className="status-actions">
            {preview && preview.groups.length > 0 && (
              <button className="text small accept-preview" onClick={onAccept}>
                <Icon name="check" size={18} />
                {t('panelUsePreview')}
              </button>
            )}
            <button className="text small abort" onClick={onAbort}>
              <Icon name="stop" size={18} />
              {t('popupAbort')}
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

/** Informational banner with the "i" icon. */
export function InfoBanner({ text }: { text: string }) {
  return (
    <p className="banner">
      <Icon name="info" />
      <span>{text}</span>
    </p>
  );
}

export function ErrorBanner({ messageKey }: { messageKey: string }) {
  return (
    <p className="banner error" role="alert">
      <Icon name="warning" />
      <span>{t(messageKey)}</span>
    </p>
  );
}

/** The tabs changed after the proposal: it offers to recompute, without doing it on its own. */
export function StaleBanner({ onRecompute }: { onRecompute: () => void }) {
  return (
    <div className="banner stale">
      <Icon name="info" />
      <span>{t('panelStale')}</span>
      <button className="text small" onClick={onRecompute}>
        {t('popupRecompute')}
      </button>
    </div>
  );
}

/** Host of a URL, to tell apart two tabs with the same title; the whole URL if it has none. */
const hostOf = (url: string) => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

/**
 * Tabs that can be closed in bulk (duplicates, inactive). "Review" opens the preview: the tabs that
 * would be closed, all checked; the checks are removed from those to keep, then "Close" closes only the others.
 */
export function CloseTabsBanner({
  icon,
  text,
  tabs,
  disabled,
  onClose,
}: {
  icon: IconName;
  text: string;
  tabs: ProposedTab[];
  disabled: boolean;
  onClose: (tabIds: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  // The tabs to keep, not the ones to close: a new duplicate appearing while the preview is open starts checked.
  const [kept, setKept] = useState<Set<number>>(new Set());
  const chosen = tabs.filter((tab) => !kept.has(tab.tabId)).map((tab) => tab.tabId);
  const toggle = (tabId: number) =>
    setKept((current) => {
      const next = new Set(current);
      if (!next.delete(tabId)) next.add(tabId);
      return next;
    });

  // "Review" disappears when the preview opens and comes back when it closes: focus follows it, instead of ending up on the body.
  const review = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const returnFocus = useRef(false);
  useLayoutEffect(() => {
    if (open) list.current?.querySelector('input')?.focus();
    else if (returnFocus.current) review.current?.focus();
    returnFocus.current = false;
  }, [open]);
  const closePreview = () => {
    returnFocus.current = true;
    setOpen(false);
    setKept(new Set());
  };

  return (
    <div className="banner duplicates">
      <div className="duplicates-row">
        <Icon name={icon} />
        <span>{text}</span>
        {!open && (
          <button ref={review} className="text small" onClick={() => setOpen(true)}>
            {t('panelReviewDuplicates')}
          </button>
        )}
      </div>
      {open && (
        <>
          <ul ref={list} className="duplicates-list">
            {tabs.map((tab) => (
              <li key={tab.tabId}>
                <label title={tab.url}>
                  <input type="checkbox" checked={!kept.has(tab.tabId)} onChange={() => toggle(tab.tabId)} />
                  {tab.favIconUrl ? <img src={tab.favIconUrl} alt="" /> : <span className="no-icon" />}
                  <span className="duplicate-title">{tab.title}</span>
                  <span className="duplicate-host">{hostOf(tab.url)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="duplicates-actions">
            <button className="text small" onClick={closePreview}>
              {t('panelCancel')}
            </button>
            <button
              className="tonal small"
              disabled={disabled || chosen.length === 0}
              onClick={() => {
                onClose(chosen);
                closePreview();
              }}
            >
              {t('panelCloseSelected', String(chosen.length))}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** AI levels that were skipped, with the cause and the link to the right section of the settings. */
export function WarningsBanner({ warnings }: { warnings: Proposal['warnings'] }) {
  return (
    // role="alert" on a container: on the <ul> it would replace the list semantics.
    <div role="alert">
      <ul className="banner warnings">
      {warnings.map((w, i) => (
        <li key={i}>
          <Icon name="warning" />
          <span>
            {t('popupWarningFallback')} {t(warningKey(w.cause), w.provider)}{' '}
            <button className="link" onClick={() => openSettings(w.level)}>
              {t('popupWarningSettings')}
            </button>
          </span>
        </li>
      ))}
      </ul>
    </div>
  );
}
