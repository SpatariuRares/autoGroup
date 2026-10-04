import type { ReactNode } from 'react';

/** Scheda di una sezione: titolo, sottotitolo facoltativo e contenuto. */
export function Card({ id, title, hint, aside, children }: { id: string; title: string; hint?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="card">
      <div className="card-header">
        <div>
          <h2>{title}</h2>
          {hint && <p className="hint">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
