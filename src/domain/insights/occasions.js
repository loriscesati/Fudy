export const DEFAULT_GAP_MINUTES = 90;

// Taps of the same section closer than gapMinutes form one food occasion.
// No quantities and no ingredients are needed: only time and section.
export function groupOccasions(meals, gapMinutes = DEFAULT_GAP_MINUTES) {
  if (!(gapMinutes > 0)) throw new RangeError('Intervallo non valido');
  const valid = meals
    .filter(m => m && typeof m.timestamp === 'string' && Number.isFinite(Date.parse(m.timestamp)) && Array.isArray(m.items) && m.items.length)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const byType = new Map();
  for (const m of valid) {
    const key = m.mealType || 'UNKNOWN';
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key).push(m);
  }
  const result = [];
  for (const [mealType, list] of byType) {
    let current = null;
    for (const m of list) {
      const t = Date.parse(m.timestamp);
      if (!current || t - current.lastAt > gapMinutes * 60000) {
        current = { id: `${mealType}:${m.timestamp}`, mealType, startAt: t, lastAt: t, timestamp: m.timestamp, items: [] };
        result.push(current);
      }
      current.lastAt = t;
      for (const item of m.items) if (item && item.foodId) current.items.push(item);
    }
  }
  return result
    .filter(o => o.items.length)
    .sort((a, b) => a.startAt - b.startAt)
    .map(o => ({ ...o, foodIds: [...new Set(o.items.map(i => i.foodId))] }));
}
