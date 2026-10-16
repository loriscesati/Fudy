/**
 * src/domain/foods/budgetModel.js
 *
 * Modello unico del budget settimanale, comune a tutti gli alimenti.
 * Logica pura (nessun accesso a IndexedDB) per poterla testare facilmente.
 *
 * Struttura:
 * budget: {
 *   enabled: boolean,                      // se true l'alimento compare nella home
 *   weeklyLimits: { LUNCH?: n, DINNER?: n },// porzioni/settimana per pasto
 *   sharedGroup: { id, weeklyLimits } | null,// tetto condiviso fra piu' alimenti
 *   emoji: string,
 *   shortLabel: string                     // etichetta breve per la home
 * }
 */

export const MEAL_SLOTS = [
  { id: 'BREAKFAST', label: 'Colazione', icon: '☕' },
  { id: 'LUNCH', label: 'Pranzo', icon: '☀️' },
  { id: 'SNACK', label: 'Spuntino', icon: '🍎' },
  { id: 'DINNER', label: 'Cena', icon: '🌙' },
];

export const DEFAULT_WEEKLY_LIMIT = 1;
export const DEFAULT_MEAL_SLOTS = ['LUNCH', 'DINNER'];

const VALID_SLOT_IDS = new Set(MEAL_SLOTS.map((s) => s.id));

function sanitizeLimits(limits) {
  const out = {};
  if (!limits || typeof limits !== 'object') return out;
  for (const [slot, value] of Object.entries(limits)) {
    const n = Number(value);
    if (VALID_SLOT_IDS.has(slot) && Number.isFinite(n) && n >= 0) {
      out[slot] = Math.floor(n);
    }
  }
  return out;
}

function defaultLimits() {
  const limits = {};
  DEFAULT_MEAL_SLOTS.forEach((slot) => {
    limits[slot] = DEFAULT_WEEKLY_LIMIT;
  });
  return limits;
}

/**
 * Normalizza qualunque input in un budget valido.
 * Un alimento nuovo senza budget viene abilitato con limite predefinito,
 * cosi' compare subito nella home.
 *
 * @param {Object|undefined} input
 * @param {{name?: string, categoryIcon?: string}} context
 */
export function normalizeBudget(input, context = {}) {
  const raw = input && typeof input === 'object' ? input : {};

  let weeklyLimits = sanitizeLimits(raw.weeklyLimits);
  if (Object.keys(weeklyLimits).length === 0) {
    weeklyLimits = defaultLimits();
  }

  let sharedGroup = null;
  if (raw.sharedGroup && raw.sharedGroup.id) {
    const sharedLimits = sanitizeLimits(raw.sharedGroup.weeklyLimits);
    if (Object.keys(sharedLimits).length > 0) {
      sharedGroup = { id: String(raw.sharedGroup.id), weeklyLimits: sharedLimits };
    }
  }

  const name = (context.name || '').trim();

  return {
    enabled: raw.enabled === undefined ? true : !!raw.enabled,
    weeklyLimits,
    sharedGroup,
    emoji: raw.emoji || context.categoryIcon || '🍽️',
    shortLabel: (raw.shortLabel || name).trim(),
  };
}

/**
 * Porzioni rimanenti in questa settimana per un alimento e un pasto.
 * Il valore puo' essere negativo: indica quante porzioni sono state
 * consumate oltre il limite (la home lo mostra come "Sforato").
 *
 * @param {Object} food  alimento con campo budget
 * @param {string} slot  'LUNCH' | 'DINNER' | ...
 * @param {Object} consumed  { [foodId]: n } consumi del pasto nella settimana
 * @param {Array}  allFoods  catalogo, necessario per i tetti condivisi
 * @returns {number|null} null se l'alimento non ha budget per quel pasto
 */
export function getRemainingPortions(food, slot, consumed = {}, allFoods = []) {
  const budget = food?.budget;
  if (!budget || !budget.enabled) return null;

  const ownLimit = budget.weeklyLimits?.[slot];
  if (ownLimit === undefined) return null;

  let remaining = ownLimit - (consumed[food.id] || 0);

  const shared = budget.sharedGroup;
  if (shared && shared.weeklyLimits?.[slot] !== undefined) {
    const members = allFoods.filter((f) => f.budget?.sharedGroup?.id === shared.id);
    const groupTotal = members.reduce((sum, f) => sum + (consumed[f.id] || 0), 0);
    remaining = Math.min(remaining, shared.weeklyLimits[slot] - groupTotal);
  }

  return remaining;
}
