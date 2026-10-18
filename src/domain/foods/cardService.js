/**
 * src/domain/foods/cardService.js
 *
 * CRUD delle card alimentari sullo store IndexedDB 'foods'
 * (campo isCard: true le distingue da eventuali record legacy).
 * Include la migrazione una tantum delle card che prima erano
 * scritte nel codice della home, con riparazione idempotente
 * delle classificazioni corrette dopo la prima versione.
 */

import { uuidv4, getRecord, updateRecord, deleteRecord, getAll } from '../../infrastructure/storage/db.js';
import { normalizeCard } from './cardModel.js';

const MIGRATION_FLAG = 'fudy_cards_migration_v1';

/**
 * Seed delle card preesistenti: stessi ID della vecchia costante
 * BUDGET, cosi' i consumi gia' registrati nel diario continuano
 * a corrispondere. La pasta tradizionale non contiene glucosio
 * libero: contiene amido, quindi nessuno zucchero rilevante.
 */
const LEGACY_CARDS = [
  { id: 'carne_bianca', name: 'Carne Bianca', emoji: '🍗', mealSection: 'LUNCH', weeklyLimit: 3, primaryFodmapGroup: ['LOW_FODMAP_SAFE'], sugars: ['NONE'] },
  { id: 'uovo_pranzo', name: 'Uova', emoji: '🥚', mealSection: 'LUNCH', weeklyLimit: 2, primaryFodmapGroup: ['LOW_FODMAP_SAFE'], sugars: ['NONE'] },
  { id: 'mozzarella', name: 'Mozzarella', emoji: '🧀', mealSection: 'LUNCH', weeklyLimit: 1, primaryFodmapGroup: ['LACTOSE'], sugars: ['LACTOSE'] },
  { id: 'gamberi_calamari', name: 'Gamberi/Calamari', emoji: '🦐', mealSection: 'LUNCH', weeklyLimit: 1, primaryFodmapGroup: ['LOW_FODMAP_SAFE'], sugars: ['NONE'] },
  { id: 'pasta_frumento', name: 'Pasta Tradizionale', emoji: '🍝', mealSection: 'LUNCH', weeklyLimit: 2, primaryFodmapGroup: ['FRUCTANS_GRAIN'], sugars: ['NONE'] },
  { id: 'legumi_misti', name: 'Legumi', emoji: '🫘', mealSection: 'LUNCH', weeklyLimit: 1, primaryFodmapGroup: ['GOS'], sugars: ['NONE'] },
  { id: 'pesce_magro', name: 'Pesce Magro', emoji: '🐟', mealSection: 'DINNER', weeklyLimit: 2, primaryFodmapGroup: ['LOW_FODMAP_SAFE'], sugars: ['NONE'] },
  { id: 'pesce_azzurro', name: 'Pesce Azzurro', emoji: '🎣', mealSection: 'DINNER', weeklyLimit: 1, primaryFodmapGroup: ['LOW_FODMAP_SAFE'], sugars: ['NONE'] },
  { id: 'salmone_fresco', name: 'Salmone Fresco', emoji: '🍣', mealSection: 'DINNER', weeklyLimit: 2, primaryFodmapGroup: ['LOW_FODMAP_SAFE'], sugars: ['NONE'], sharedGroup: 'salmone', groupLimit: 2 },
  { id: 'salmone_affumicato', name: 'Salmone Affumicato', emoji: '🥓', mealSection: 'DINNER', weeklyLimit: 1, primaryFodmapGroup: ['LOW_FODMAP_SAFE'], sugars: ['NONE'], sharedGroup: 'salmone', groupLimit: 2 },
  { id: 'carne_rossa', name: 'Carne Rossa', emoji: '🥩', mealSection: 'DINNER', weeklyLimit: 1, primaryFodmapGroup: ['LOW_FODMAP_SAFE'], sugars: ['NONE'] },
  { id: 'uovo_cena', name: 'Uova', emoji: '🥚', mealSection: 'DINNER', weeklyLimit: 1, primaryFodmapGroup: ['LOW_FODMAP_SAFE'], sugars: ['NONE'] },
  { id: 'mela_frutta', name: 'Mela / Pera', emoji: '🍎', mealSection: 'DINNER', weeklyLimit: 1, primaryFodmapGroup: ['EXCESS_FRUCTOSE', 'SORBITOL'], sugars: ['FREE_FRUCTOSE', 'POLYOLS'] },
  { id: 'funghi_verdure', name: 'Funghi / Cavolfiore', emoji: '🍄', mealSection: 'DINNER', weeklyLimit: 1, primaryFodmapGroup: ['MANNITOL'], sugars: ['POLYOLS'] },
];

export async function getCards() {
  const foods = (await getAll('foods')) || [];
  return foods
    .filter((f) => f.isCard && !f.isArchived)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function getCardById(id) {
  const record = await getRecord('foods', id);
  return record && record.isCard ? record : null;
}

/** Salva o aggiorna una card. Ritorna il record scritto. */
export async function saveCard(input) {
  const existing = input.id ? await getRecord('foods', input.id) : null;
  const now = new Date().toISOString();
  const record = {
    ...(existing || {}),
    ...normalizeCard({ ...(existing || {}), ...input }),
    id: input.id || uuidv4(),
    category: 'CARD',
    tolerance: existing?.tolerance || { status: 'UNTESTED' },
    isArchived: false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await updateRecord('foods', record);
  return record;
}

export async function archiveCard(id) {
  const record = await getCardById(id);
  if (!record) return;
  record.isArchived = true;
  record.updatedAt = new Date().toISOString();
  await updateRecord('foods', record);
}

export async function deleteCard(id) {
  await deleteRecord('foods', id);
}

/**
 * Riparazione idempotente della prima versione del seed: chi ha
 * gia' migrato aveva la pasta tradizionale marcata "glucosio",
 * incoerente con la composizione reale (amido). Corregge solo se
 * la classificazione e' esattamente quella errata: modifiche
 * manuali dell'utente non vengono toccate.
 */
async function repairSeedClassifications() {
  const pasta = await getRecord('foods', 'pasta_frumento');
  if (!pasta || !pasta.isCard) return;
  const sugars = pasta.sugars || [];
  if (sugars.length === 1 && sugars[0] === 'GLUCOSE') {
    pasta.sugars = ['NONE'];
    pasta.updatedAt = new Date().toISOString();
    await updateRecord('foods', pasta);
  }
}

/**
 * Migrazione: la prima volta inserisce in IndexedDB le card che
 * vivevano nella costante BUDGET. Non sovrascrive card con ID gia'
 * esistenti; la riparazione dei dati seed e' comunque sempre eseguita.
 */
export async function migrateLegacyCards() {
  if (localStorage.getItem(MIGRATION_FLAG) !== 'done') {
    let migrated = 0;
    for (const legacy of LEGACY_CARDS) {
      const existing = await getRecord('foods', legacy.id);
      if (existing) continue;
      await saveCard(legacy);
      migrated++;
    }
    localStorage.setItem(MIGRATION_FLAG, 'done');
  }
  await repairSeedClassifications();
}
