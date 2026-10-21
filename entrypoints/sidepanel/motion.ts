import { flushSync } from 'react-dom';
import type { WindowView } from '../../src/shared/types';

/*
 * Il movimento del pannello spiega cosa è cambiato: una tab o un gruppo che si sposta scivola al nuovo
 * posto, uno che arriva compare, uno che se ne va sfuma. È un FLIP con la Web Animations API: si
 * misurano gli elementi segnati da `motionKey` prima e dopo l'aggiornamento, e ognuno parte da dove
 * era. Niente blocca i clic: le View Transitions li mandano al documento finché l'animazione dura.
 */

/** Vero mentre si trascina: il segno di rilascio sposta le righe, e un'animazione le farebbe saltare. */
let dragging = false;

export function pauseMotion(paused: boolean) {
  dragging = paused;
}

/** Segna una riga o una scheda: con la stessa chiave è lo stesso elemento prima e dopo, anche in un'altra sezione. */
export function motionKey(kind: 'tab' | 'group', id: number | string) {
  return { 'data-motion': `${kind}-${id}` };
}

/**
 * Cosa sta dove nella vista: i gruppi e le loro tab, in ordine. Cambia solo se qualcosa si sposta,
 * compare o sparisce, non per un titolo o un'icona nuovi: allora non serve animare.
 */
export function layoutOf(view: WindowView): string {
  const ids = (tabs: { tabId: number }[]) => tabs.map((tab) => tab.tabId);
  return JSON.stringify([
    view.created.map((group) => [group.id, ids(group.tabs)]),
    view.existing.map((x) => [x.group.id, ids(x.added), ids(x.current)]),
    ids(view.free),
    ids(view.held.map((x) => x.tab)),
  ]);
}

/** Applica `update` (che cambia il DOM di React) animando il passaggio dal prima al dopo. */
export function withMotion(update: () => void) {
  if (dragging || document.visibilityState !== 'visible') return update();
  const before = measure();
  flushSync(update);
  animate(before, measure());
}

type Boxes = Map<string, { el: HTMLElement; box: DOMRect }>;

/** Dove sta ora ogni elemento segnato e visibile, compreso lo spostamento di un'animazione ancora in corso. */
function measure(): Boxes {
  const boxes: Boxes = new Map();
  for (const el of document.querySelectorAll<HTMLElement>('[data-motion]')) {
    const box = el.getBoundingClientRect();
    if (box.height > 0) boxes.set(el.dataset.motion!, { el, box });
  }
  return boxes;
}

/** Le curve e le durate dei token MD3 di base.css. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--md-sys-motion-${name}`).trim();
}
const ms = (value: string) => parseFloat(value) || 0;

const running = new WeakMap<HTMLElement, Animation>();

function play(el: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  running.get(el)?.cancel();
  running.set(el, el.animate(keyframes, options));
}

function animate(before: Boxes, after: Boxes) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const medium = ms(token('duration-medium'));
  const short = ms(token('duration-short'));
  const enter = { duration: reduced ? short : medium, easing: token('easing-emphasized-decelerate') };
  const exit = { duration: short, easing: token('easing-emphasized-accelerate') };

  // Una riga dentro una scheda che si sposta si muove già con lei: conta solo il resto.
  const shift = new Map<string, { x: number; y: number }>();
  const shiftOf = (key: string, el: HTMLElement) => {
    const old = before.get(key)!.box;
    const now = after.get(key)!.box;
    const parent = el.parentElement?.closest<HTMLElement>('[data-motion]');
    const outer = parent ? shift.get(parent.dataset.motion!) : undefined;
    const value = { x: old.left - now.left - (outer?.x ?? 0), y: old.top - now.top - (outer?.y ?? 0) };
    shift.set(key, value);
    return value;
  };

  // In ordine di documento: una scheda prima delle sue righe.
  for (const [key, { el }] of after) {
    if (!before.has(key)) {
      play(el, [{ opacity: 0 }, { opacity: 1 }], enter);
      continue;
    }
    const { x, y } = shiftOf(key, el);
    if (reduced || (Math.abs(x) < 1 && Math.abs(y) < 1)) continue;
    play(el, [{ transform: `translate(${x}px, ${y}px)` }, { transform: 'none' }], { duration: medium, easing: enter.easing });
  }

  // Chi è sparito sfuma dove era, sopra il pannello e senza prendere clic né focus.
  for (const [key, { el, box }] of before) {
    if (after.has(key) || el.isConnected) continue;
    const parent = el.parentElement?.closest<HTMLElement>('[data-motion]');
    if (parent && before.has(parent.dataset.motion!) && !after.has(parent.dataset.motion!)) continue;
    fadeOut(el, box, exit);
  }
}

function fadeOut(el: HTMLElement, box: DOMRect, options: KeyframeAnimationOptions) {
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('data-motion');
  ghost.inert = true;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.classList.add('motion-ghost');
  Object.assign(ghost.style, { top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px` });
  document.body.append(ghost);
  ghost.animate([{ opacity: 1 }, { opacity: 0 }], { ...options, fill: 'forwards' });
  // Con un timer, non alla fine dell'animazione: in una pagina che non viene disegnata non finirebbe mai.
  setTimeout(() => ghost.remove(), Number(options.duration));
}
