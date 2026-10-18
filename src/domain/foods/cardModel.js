/**
 * src/domain/foods/cardModel.js
 *
 * Modello puro delle card alimentari: la card e' l'unica porta di
 * ingresso dei consumi. Nessuna dipendenza da IndexedDB o DOM: il
 * modulo e' adatto a test unitari.
 *
 * Una card = un alimento tracciabile a tap. Ogni consumo eredita
 * dalla card la classificazione FODMAP e la tipologia di zuccheri,
 * cosi' statistiche e report restano agganciati ai dati reali.
 */

export const CARD_SECTIONS = [
  { id: 'LUNCH', key: 'pranzo', label: 'Pranzo', icon: '☀️' },
  { id: 'DINNER', key: 'cena', label: 'Cena', icon: '🌙' },
  { id: 'OTHER', key: 'altro', label: 'Altro', icon: '🧺' },
];

export const SECTION_KEYS = Object.fromEntries(CARD_SECTIONS.map((s) => [s.id, s.key]));

// Tipo di pasto salvato nei record del diario (utile per le statistiche)
export const SECTION_MEAL_TYPE = { pranzo: 'LUNCH', cena: 'DINNER', altro: 'SNACK' };
export const MEAL_TYPE_SECTION = { LUNCH: 'pranzo', DINNER: 'cena', SNACK: 'altro' };

/**
 * Tipologia nutrizionale degli zuccheri presenti, livello distinto
 * e complementare ai gruppi FODMAP. Obbligatorio in fase di creazione.
 */
export const SUGAR_TYPES = [
  { id: 'NONE', label: 'Nessuno zucchero rilevante' },
  { id: 'FREE_FRUCTOSE', label: 'Fruttosio libero (frutta dolce, succhi)' },
  { id: 'SUCROSE', label: 'Saccarosio (zucchero da tavola, dolci)' },
  { id: 'LACTOSE', label: 'Lattosio' },
  { id: 'GLUCOSE', label: 'Glucosio / destrosio' },
  { id: 'HFCS', label: 'Sciroppo di glucosio-fruttosio (HFCS)' },
  { id: 'HONEY_SYRUP', label: 'Miele o sciroppi naturali (agave, acero)' },
  { id: 'POLYOLS', label: 'Polioli (sorbitolo, xilitolo, maltitolo, mannitolo)' },
];

/**
 * Normalizza qualunque input in una card valida.
 * weeklyLimit null = nessun budget, solo contatore (tipico di Altro).
 */
export function normalizeCard(input = {}) {
  const section = CARD_SECTIONS.some((s) => s.id === input.mealSection)
    ? input.mealSection
    : 'OTHER';

  let weeklyLimit = null;
  if (input.weeklyLimit !== null && input.weeklyLimit !== undefined && input.weeklyLimit !== '') {
    const n = Math.floor(Number(input.weeklyLimit));
    if (Number.isFinite(n) && n > 0) weeklyLimit = n;
  }

  let groupLimit = null;
  if (input.groupLimit !== null && input.groupLimit !== undefined && input.groupLimit !== '') {
    const n = Math.floor(Number(input.groupLimit));
    if (Number.isFinite(n) && n > 0) groupLimit = n;
  }

  const sugars = Array.isArray(input.sugars)
    ? input.sugars.filter((s) => SUGAR_TYPES.some((t) => t.id === s))
    : [];

  return {
    isCard: true,
    name: String(input.name || '').trim(),
    emoji: input.emoji || '🍽️',
    mealSection: section,
    primaryFodmapGroup: Array.isArray(input.primaryFodmapGroup) && input.primaryFodmapGroup.length > 0
      ? input.primaryFodmapGroup
      : ['LOW_FODMAP_SAFE'],
    sugars: sugars.length > 0 ? sugars : ['NONE'],
    weeklyLimit,
    sharedGroup: input.sharedGroup ? String(input.sharedGroup).trim() : null,
    groupLimit: input.sharedGroup ? groupLimit : null,
  };
}

/**
 * Stato del budget di una card per la settimana corrente.
 * counts = { [cardId]: n } consumi della sezione.
 * siblings = tutte le card della stessa sezione.
 *
 * Ritorna:
 *  { consumed, hasLimit, limit, remaining, isShared }
 * consumed = consumi propri o, se condiviso, totale del gruppo.
 * remaining = null quando non c'e' limite.
 */
export function getCardBudgetState(card, counts = {}, siblings = []) {
  const own = counts[card.id] || 0;

  const constraints = [];
  if (card.weeklyLimit) constraints.push(card.weeklyLimit - own);

  let groupConsumed = null;
  let groupLimit = null;
  if (card.sharedGroup) {
    const members = siblings.filter((c) => c.sharedGroup === card.sharedGroup);
    groupConsumed = members.reduce((sum, c) => sum + (counts[c.id] || 0), 0);
    groupLimit = members.map((c) => c.groupLimit).find((g) => g != null) ?? null;
    if (groupLimit != null) constraints.push(groupLimit - groupConsumed);
  }

  const hasLimit = constraints.length > 0;
  const remaining = hasLimit ? Math.min(...constraints) : null;
  const shared = card.sharedGroup != null;
  const consumed = shared && groupConsumed != null ? groupConsumed : own;
  const limit = shared && groupLimit != null ? groupLimit : card.weeklyLimit ?? null;

  return { consumed, hasLimit, limit, remaining, isShared: shared };
}
