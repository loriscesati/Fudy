/**
 * src/domain/foods/foodService.js
 *
 * Servizio minimo del catalogo alimenti, usato da Challenge
 * (selezione alimento di test e aggiornamento tolleranza).
 * La gestione quotidiana degli alimenti passa dalle card:
 * vedi cardModel.js e cardService.js.
 */

import { uuidv4, updateRecord, getRecord, getAll } from '../../infrastructure/storage/db.js';

export const FODMAP_GROUPS = [
  { id: 'LOW_FODMAP_SAFE', label: 'Basso FODMAP (Sicuro)', color: '#10B981' },
  { id: 'FRUCTANS_GRAIN', label: 'Fruttani (Cereali/Grano)', color: '#F59E0B' },
  { id: 'FRUCTANS_VEG_GARLIC', label: 'Fruttani (Aglio/Cipolla)', color: '#D97706' },
  { id: 'GOS', label: 'Galatto-oligosaccaridi (GOS/Legumi)', color: '#8B5CF6' },
  { id: 'LACTOSE', label: 'Lattosio (Latticini)', color: '#3B82F6' },
  { id: 'EXCESS_FRUCTOSE', label: 'Fruttosio in eccesso (Frutta/Miele)', color: '#EC4899' },
  { id: 'SORBITOL', label: 'Sorbitolo (Frutta con nocciolo)', color: '#6366F1' },
  { id: 'MANNITOL', label: 'Mannitolo (Funghi/Cavolfiore)', color: '#14B8A6' },
];

/** Recupera tutti gli alimenti non archiviati, in ordine alfabetico. */
export async function getFoods() {
  const foods = (await getAll('foods')) || [];
  return foods
    .filter((f) => !f.isArchived)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/** Recupera un alimento per ID. */
export async function getFoodById(id) {
  return getRecord('foods', id);
}

/**
 * Salva o aggiorna un alimento. E' il punto usato dal Challenge per
 * applicare l'esito dei test di reintroduzione alla scheda tolleranza.
 */
export async function saveFood(foodData) {
  const now = new Date().toISOString();
  const id = foodData.id || uuidv4();

  const record = {
    ...foodData,
    id,
    name: (foodData.name || '').trim(),
    synonyms: Array.isArray(foodData.synonyms) ? foodData.synonyms : [],
    primaryFodmapGroup: foodData.primaryFodmapGroup || ['LOW_FODMAP_SAFE'],
    tolerance: {
      status: foodData.tolerance?.status || 'UNTESTED',
      ...foodData.tolerance,
    },
    isArchived: !!foodData.isArchived,
    createdAt: foodData.createdAt || now,
    updatedAt: now,
  };

  await updateRecord('foods', record);
  return record;
}
