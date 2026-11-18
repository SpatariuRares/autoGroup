import type { useExpiring } from './use-expiring';

/** To spread on the snackbar: it does not disappear while the mouse or focus is over it (see `useExpiring`). */
export type Hold = ReturnType<typeof useExpiring>[2];

/**
 * Material 3 snackbar: the text and, if present, an action. It goes inside a live region that is always present
 * (`role="status"`), so it is read when it appears. The page decides the position.
 */
export function Snackbar({ text, action, hold }: { text: string; action?: { label: string; onClick: () => void }; hold?: Hold }) {
  return (
    <div className="snackbar" {...hold}>
      <span>{text}</span>
      {action && (
        <button className="text small inverse" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
