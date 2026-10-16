/**
 * src/domain/foods/foodService.js
 *
 * Servizio di gestione del catalogo alimenti per FODMAP Path.
 * Fornisce operazioni CRUD e ricerca tipizzata sullo store IndexedDB 'foods'.
 * Non inserisce dati fittizi o proprietari: lascia il database vuoto
 * pronto per l'inserimento dell'utente o per l'importazione di un database personale.
 */

import { openDB, uuidv4, addRecord, updateRecord, deleteRecord, getRecord } from '../../infrastructure/storage/db.js';

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

export const FOOD_CATEGORIES = [
  { id: 'GRAIN', label: 'Cereali & Tuberi', icon: '🌾' },
  { id: 'VEGETABLE', label: 'Verdure & Ortaggi', icon: '🥦' },
  { id: 'FRUIT', label: 'Frutta', icon: '🍎' },
  { id: 'LEGUME', label: 'Legumi', icon: '🫘' },
  { id: 'DAIRY', label: 'Latticini & Formaggi', icon: '🧀' },
  { id: 'PROTEIN', label: 'Carne, Pesce & Uova', icon: '🥩' },
  { id: 'SNACK', label: 'Snack & Dolci', icon: '🍪' },
  { id: 'BEVERAGE', label: 'Bevande', icon: '☕' },
  { id: 'CONDIMENT', label: 'Condimenti & Spezie', icon: '🧂' },
  { id: 'COMPOSITE', label: 'Piatto Composto', icon: '🍲' },
];

export const TOLERANCE_STATUSES = [
  { id: 'UNTESTED', label: 'Non testato', badgeClass: 'bg-gray-100 text-gray-700' },
  { id: 'IN_OBSERVATION', label: 'In osservazione', badgeClass: 'bg-amber-100 text-amber-800' },
  { id: 'DOSE_LIMITED', label: 'Dose-limitato', badgeClass: 'bg-blue-100 text-blue-800' },
  { id: 'FREELY_TOLERATED', label: 'Tollerato', badgeClass: 'bg-emerald-100 text-emerald-800' },
  { id: 'NOT_TOLERATED', label: 'Non tollerato', badgeClass: 'bg-red-100 text-red-800' },
];

/**
 * Recupera tutti gli alimenti non archiviati.
 * @param {Object} options - Filtri opzionali (searchQuery, category, fodmapGroup, toleranceStatus)
 * @returns {Promise<Array>}
 */
export async function getFoods(options = {}) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('foods', 'readonly');
    const store = tx.objectStore('foods');
    const request = store.getAll();

    request.onsuccess = () => {
      let foods = request.result || [];

      // Escludi archiviati
      foods = foods.filter((f) => !f.isArchived);

      // Filtro ricerca testuale su nome e sinonimi
      if (options.searchQuery && options.searchQuery.trim() !== '') {
        const q = options.searchQuery.toLowerCase().trim();
        foods = foods.filter((f) => {
          const matchName = (f.name || '').toLowerCase().includes(q);
          const matchSyn = (f.synonyms || []).some((s) => s.toLowerCase().includes(q));
          return matchName || matchSyn;
        });
      }

      // Filtro categoria
      if (options.category && options.category !== 'ALL') {
        foods = foods.filter((f) => f.category === options.category);
      }

      // Filtro gruppo FODMAP
      if (options.fodmapGroup && options.fodmapGroup !== 'ALL') {
        foods = foods.filter((f) => (f.primaryFodmapGroup || []).includes(options.fodmapGroup));
      }

      // Filtro tolleranza
      if (options.toleranceStatus && options.toleranceStatus !== 'ALL') {
        foods = foods.filter((f) => (f.tolerance?.status || 'UNTESTED') === options.toleranceStatus);
      }

      // Ordina alfabeticamente per nome
      foods.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      resolve(foods);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Recupera un alimento per ID
 */
export async function getFoodById(id) {
  return getRecord('foods', id);
}

/**
 * Salva o aggiorna un alimento nel catalogo
 */
export async function saveFood(foodData) {
  const now = new Date().toISOString();
  const id = foodData.id || uuidv4();

  const record = {
    id,
    name: foodData.name.trim(),
    synonyms: Array.isArray(foodData.synonyms)
      ? foodData.synonyms
      : (foodData.synonyms || '').split(',').map((s) => s.trim()).filter(Boolean),
    category: foodData.category || 'VEGETABLE',
    preparation: foodData.preparation || ['RAW', 'COOKED'],
    primaryFodmapGroup: foodData.primaryFodmapGroup || ['LOW_FODMAP_SAFE'],
    isGlutenFree: !!foodData.isGlutenFree,
    isLactoseFree: !!foodData.isLactoseFree,
    dataSource: foodData.dataSource || {
      origin: 'USER_INPUT',
      notes: ''
    },
    tolerance: {
      status: foodData.tolerance?.status || 'UNTESTED',
      maxToleratedPortion: foodData.tolerance?.maxToleratedPortion || {
        amount: foodData.portionAmount || 100,
        unit: foodData.portionUnit || 'g',
        description: foodData.portionDesc || 'porzione standard'
      },
      evidenceLevel: foodData.tolerance?.evidenceLevel || 'HYPOTHESIS',
      personalNotes: foodData.tolerance?.personalNotes || ''
    },
    isArchived: false,
    createdAt: foodData.createdAt || now,
    updatedAt: now
  };

  await updateRecord('foods', record);
  return record;
}

/**
 * Archiviazione logica di un alimento
 */
export async function archiveFood(id) {
  const food = await getFoodById(id);
  if (!food) return;
  food.isArchived = true;
  food.updatedAt = new Date().toISOString();
  await updateRecord('foods', food);
}

/**
 * Eliminazione fisica di un alimento
 */
export async function deleteFood(id) {
  await deleteRecord('foods', id);
}

/**
 * Importazione massiva di alimenti (utile se l'utente ha un file JSON del proprio database)
 * @param {Array<Object>} foodsArray
 * @returns {Promise<number>} numero di alimenti importati
 */
export async function importFoodsBatch(foodsArray) {
  if (!Array.isArray(foodsArray)) return 0;
  let count = 0;
  for (const f of foodsArray) {
    if (f.name) {
      await saveFood(f);
      count++;
    }
  }
  return count;
}
