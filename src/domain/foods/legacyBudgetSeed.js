/**
 * src/domain/foods/legacyBudgetSeed.js
 *
 * Alimenti che in precedenza erano definiti a mano nella costante BUDGET
 * di home.js. Vengono convertiti una sola volta in alimenti del catalogo.
 *
 * Le uova avevano due voci separate (pranzo/cena): ora sono un unico alimento
 * con limiti diversi per pasto. Le chiavi legacy servono a migrare
 * i consumi della settimana corrente salvati in localStorage.
 */

const SAFE = ['LOW_FODMAP_SAFE'];

export const LEGACY_FOOD_SEED = [
  { id: 'seed-carne-bianca', name: 'Carne Bianca', category: 'PROTEIN', primaryFodmapGroup: SAFE,
    budget: { emoji: '🍗', shortLabel: 'Carne Bianca', weeklyLimits: { LUNCH: 3 } },
    legacyKeys: { LUNCH: 'carne_bianca' } },

  { id: 'seed-uova', name: 'Uova', category: 'PROTEIN', primaryFodmapGroup: SAFE,
    budget: { emoji: '🥚', shortLabel: 'Uova', weeklyLimits: { LUNCH: 2, DINNER: 1 } },
    legacyKeys: { LUNCH: 'uovo_pranzo', DINNER: 'uovo_cena' } },

  { id: 'seed-mozzarella', name: 'Mozzarella', category: 'DAIRY', primaryFodmapGroup: ['LACTOSE'],
    budget: { emoji: '🧀', shortLabel: 'Mozzarella', weeklyLimits: { LUNCH: 1 } },
    legacyKeys: { LUNCH: 'mozzarella' } },

  { id: 'seed-gamberi-calamari', name: 'Gamberi / Calamari', category: 'PROTEIN', primaryFodmapGroup: SAFE,
    budget: { emoji: '🦐', shortLabel: 'Gamberi/Cal.', weeklyLimits: { LUNCH: 1 } },
    legacyKeys: { LUNCH: 'gamberi_calamari' } },

  { id: 'seed-pasta-frumento', name: 'Pasta Tradizionale', category: 'GRAIN', primaryFodmapGroup: ['FRUCTANS_GRAIN'],
    budget: { emoji: '🍝', shortLabel: 'Pasta Tradiz.', weeklyLimits: { LUNCH: 2 } },
    legacyKeys: { LUNCH: 'pasta_frumento' } },

  { id: 'seed-legumi', name: 'Legumi', category: 'LEGUME', primaryFodmapGroup: ['GOS'],
    budget: { emoji: '🫘', shortLabel: 'Legumi', weeklyLimits: { LUNCH: 1 } },
    legacyKeys: { LUNCH: 'legumi_misti' } },

  { id: 'seed-pesce-magro', name: 'Pesce Magro', category: 'PROTEIN', primaryFodmapGroup: SAFE,
    budget: { emoji: '🐟', shortLabel: 'Pesce Magro', weeklyLimits: { DINNER: 2 } },
    legacyKeys: { DINNER: 'pesce_magro' } },

  { id: 'seed-pesce-azzurro', name: 'Pesce Azzurro', category: 'PROTEIN', primaryFodmapGroup: SAFE,
    budget: { emoji: '🎣', shortLabel: 'Pesce Azzurro', weeklyLimits: { DINNER: 1 } },
    legacyKeys: { DINNER: 'pesce_azzurro' } },

  { id: 'seed-salmone-fresco', name: 'Salmone Fresco', category: 'PROTEIN', primaryFodmapGroup: SAFE,
    budget: { emoji: '🍣', shortLabel: 'Salmone Fresco', weeklyLimits: { DINNER: 2 },
      sharedGroup: { id: 'SALMON', weeklyLimits: { DINNER: 2 } } },
    legacyKeys: { DINNER: 'salmone_fresco' } },

  { id: 'seed-salmone-affumicato', name: 'Salmone Affumicato', category: 'PROTEIN', primaryFodmapGroup: SAFE,
    budget: { emoji: '🥓', shortLabel: 'Salm. Affum.', weeklyLimits: { DINNER: 1 },
      sharedGroup: { id: 'SALMON', weeklyLimits: { DINNER: 2 } } },
    legacyKeys: { DINNER: 'salmone_affumicato' } },

  { id: 'seed-carne-rossa', name: 'Carne Rossa', category: 'PROTEIN', primaryFodmapGroup: SAFE,
    budget: { emoji: '🥩', shortLabel: 'Carne Rossa', weeklyLimits: { DINNER: 1 } },
    legacyKeys: { DINNER: 'carne_rossa' } },

  { id: 'seed-mela-pera', name: 'Mela / Pera', category: 'FRUIT', primaryFodmapGroup: ['EXCESS_FRUCTOSE', 'SORBITOL'],
    budget: { emoji: '🍎', shortLabel: 'Mela / Pera', weeklyLimits: { DINNER: 1 } },
    legacyKeys: { DINNER: 'mela_frutta' } },

  { id: 'seed-funghi-cavolfiore', name: 'Funghi / Cavolfiore', category: 'VEGETABLE', primaryFodmapGroup: ['MANNITOL'],
    budget: { emoji: '🍄', shortLabel: 'Funghi / Cavolf.', weeklyLimits: { DINNER: 1 } },
    legacyKeys: { DINNER: 'funghi_verdure' } },
];
