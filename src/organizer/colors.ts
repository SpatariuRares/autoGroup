import { GROUP_COLORS, type GroupColor } from '../shared/types';

/**
 * Assigns to new groups, in rotation, the colors not yet used in the window.
 * When the free colors run out, it restarts from the least used one.
 */
export function createColorAssigner(usedColors: Iterable<string>) {
  const usage = new Map<GroupColor, number>(GROUP_COLORS.map((c) => [c, 0]));
  for (const color of usedColors) {
    if (usage.has(color as GroupColor)) usage.set(color as GroupColor, usage.get(color as GroupColor)! + 1);
  }
  return {
    /** Records a color already chosen elsewhere (e.g. the fixed color of a category). */
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
