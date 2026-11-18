/**
 * Esc hides the visible tooltips (`data-tooltip`, see base.css) without moving mouse or focus, as WCAG 1.4.13 asks:
 * a tooltip opened by focus covers the row below. They come back by moving focus or the pointer
 * to another element. Esc still reaches the rest of the page too (e.g. it closes the palette).
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
