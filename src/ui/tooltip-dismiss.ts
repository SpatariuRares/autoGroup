/**
 * Esc nasconde i tooltip visibili (`data-tooltip`, vedi base.css) senza spostare mouse o focus, come chiede
 * WCAG 1.4.13: un tooltip aperto dal focus copre la riga sotto. Tornano spostando il focus o il puntatore
 * su un altro elemento. Esc arriva comunque anche al resto della pagina (es. chiude la tavolozza).
 */
export function dismissTooltipsOnEscape() {
  const hidden = new Set<Element>();
  const clear = () => {
    for (const el of hidden) el.removeAttribute('data-tooltip-hidden');
    hidden.clear();
  };
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      for (const el of document.querySelectorAll('[data-tooltip]')) {
        if (!el.matches(':hover, :focus-visible, :has(:focus-visible)')) continue;
        el.setAttribute('data-tooltip-hidden', '');
        hidden.add(el);
      }
    },
    true,
  );
  document.addEventListener('focusin', clear);
  document.addEventListener('pointerover', (e) => {
    if (![...hidden].some((el) => el.contains(e.target as Node))) clear();
  });
}
