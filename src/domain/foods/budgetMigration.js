/**
 * src/domain/foods/budgetMigration.js
 *
 * Migrazione una tantum: porta nel catalogo alimenti le voci che prima
 * erano scritte a mano nella costante BUDGET di home.js.
 *
 * - Idempotente: usa ID stabili e un flag in localStorage.
 * - Non sovrascrive alimenti gia' esistenti con lo stesso ID.
 * - Aggiunge il campo budget ad eventuali alimenti senza budget.
 */

import { getFoodById, saveFood, getFoods } from './foodService.js';
import { LEGACY_FOOD_SEED } from './legacyBudgetSeed.js';

const MIGRATION_FLAG = 'fudy_budget_migration_v1';

export async function migrateLegacyBudgetFoods() {
  if (localStorage.getItem(MIGRATION_FLAG) === 'done') {
    return { migrated: 0, skipped: true };
  }

  let migrated = 0;

  for (const seed of LEGACY_FOOD_SEED) {
    const existing = await getFoodById(seed.id);
    if (existing) continue;

    await saveFood({
      id: seed.id,
      name: seed.name,
      category: seed.category,
      primaryFodmapGroup: seed.primaryFodmapGroup,
      budget: seed.budget,
      dataSource: { origin: 'MIGRATED_FROM_HOME', notes: 'Convertito dalla vecchia lista budget della home' },
    });
    migrated++;
  }

  // Alimenti gia' presenti ma privi di budget: abilitati con limite predefinito.
  const all = await getFoods();
  for (const food of all) {
    if (!food.budget) {
      await saveFood({ ...food, budget: undefined });
    }
  }

  localStorage.setItem(MIGRATION_FLAG, 'done');
  return { migrated, skipped: false };
}
