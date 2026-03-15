/**
 * 16 unique user colors, chosen to be visually distinct from each other
 * AND from the 5 toolbar swatches (#ef4444, #22c55e, #3b82f6, #eab308, #ffffff).
 */
export const USER_COLORS = [
  '#e06cf0', // orchid pink
  '#ff7b3a', // tangerine
  '#1dd4c0', // teal
  '#a78bfa', // soft violet
  '#f472b6', // hot pink
  '#38bdf8', // sky blue
  '#fb923c', // peach orange
  '#4ade80', // mint green
  '#c084fc', // lavender
  '#f87171', // coral red
  '#2dd4bf', // aquamarine
  '#fbbf24', // golden amber
  '#818cf8', // periwinkle
  '#34d399', // emerald mint
  '#f97316', // burnt orange
  '#67e8f9', // cyan
] as const;

/** Returns a color by server-assigned index (0–15). */
export function colorByIndex(index: number): string {
  return USER_COLORS[((index % USER_COLORS.length) + USER_COLORS.length) % USER_COLORS.length];
}

/** Deterministically maps a UUID to one of 16 fixed user colors. */
export function uuidToColor(uuid: string): string {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = ((hash << 5) - hash + uuid.charCodeAt(i)) | 0;
  }
  const index = ((hash % USER_COLORS.length) + USER_COLORS.length) % USER_COLORS.length;
  return USER_COLORS[index];
}
