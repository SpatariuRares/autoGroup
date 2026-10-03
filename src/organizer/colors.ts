import { GROUP_COLORS, type GroupColor } from '../shared/types';

/**
 * Assegna ai gruppi nuovi, a rotazione, i colori non ancora usati nella finestra.
 * Quando i colori liberi finiscono si riparte dal meno usato.
 */
export function createColorAssigner(usedColors: Iterable<string>) {
  const usage = new Map<GroupColor, number>(GROUP_COLORS.map((c) => [c, 0]));
  for (const color of usedColors) {
    if (usage.has(color as GroupColor)) usage.set(color as GroupColor, usage.get(color as GroupColor)! + 1);
  }
  return {
    /** Registra un colore già scelto altrove (es. colore fisso di una categoria). */
    reserve(color: GroupColor) {
      usage.set(color, usage.get(color)! + 1);
    },
    next(): GroupColor {
      const min = Math.min(...usage.values());
      const color = GROUP_COLORS.find((c) => usage.get(c) === min)!;
      usage.set(color, min + 1);
      return color;
    },
  };
}
