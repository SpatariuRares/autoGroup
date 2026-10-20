import type { useExpiring } from './use-expiring';

/** Da spargere sulla snackbar: finché c'è sopra il mouse o il focus non sparisce (vedi `useExpiring`). */
export type Hold = ReturnType<typeof useExpiring>[2];

/**
 * Snackbar Material 3: il testo e, se c'è, un'azione. Va dentro una regione live sempre presente
 * (`role="status"`), così quando compare viene letta. La posizione la decide la pagina.
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
