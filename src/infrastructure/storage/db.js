/**
 * src/infrastructure/storage/db.js
 *
 * IndexedDB wrapper for FODMAP Path local-first storage.
 * Stores: foods, meals, symptoms, bowel_events, challenges,
 * cycle_logs, confounders, user_profile.
 * No external dependencies; works offline.
 */

const DB_NAME = 'fodmap-path-db';
const DB_VERSION = 1; // Increment when schema changes

let dbPromise = null;

/** Open (or reuse) the single shared IndexedDB connection. */
export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const ensure = (name, options) =>
        db.objectStoreNames.contains(name)
          ? request.transaction.objectStore(name)
          : db.createObjectStore(name, options);
      const index = (store, name, path) => {
        if (!store.indexNames.contains(name)) store.createIndex(name, path, { unique: false });
      };

      const foods = ensure('foods', { keyPath: 'id' });
      index(foods, 'name', 'name');
      index(foods, 'category', 'category');
      index(foods, 'status', 'tolerance.status');
      index(foods, 'archived', 'isArchived');

      const meals = ensure('meals', { keyPath: 'id' });
      index(meals, 'timestamp', 'timestamp');
      index(meals, 'mealType', 'mealType');
      index(meals, 'isEatingOut', 'isEatingOut');

      const symptoms = ensure('symptoms', { keyPath: 'id' });
      index(symptoms, 'timestamp', 'timestamp');
      index(symptoms, 'type', 'type');

      const bowel = ensure('bowel_events', { keyPath: 'id' });
      index(bowel, 'timestamp', 'timestamp');
      index(bowel, 'bristolType', 'bristolType');

      const challenges = ensure('challenges', { keyPath: 'id' });
      index(challenges, 'state', 'state');
      index(challenges, 'fodmapGroup', 'fodmapGroup');
      index(challenges, 'startDate', 'startDate');

      const cycles = ensure('cycle_logs', { keyPath: 'date' });
      index(cycles, 'cycleDay', 'cycleDay');
      index(cycles, 'menstrualFlow', 'menstrualFlow');

      const conf = ensure('confounders', { keyPath: 'date' });
      index(conf, 'stressLevel', 'stressLevel');

      ensure('user_profile', { keyPath: 'key' });
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
    request.onblocked = () => {
      console.warn('Aggiornamento database bloccato: chiudi le altre schede di Fudy.');
    };
  });
  return dbPromise;
}

/** Run one transaction and resolve only after it has committed. */
async function run(storeName, mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    const request = action(store);
    if (request) request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Transazione annullata'));
  });
}

// ---------- CRUD helpers ---------------------------------------------------
export const addRecord = (storeName, record) => run(storeName, 'readwrite', (s) => s.add(record));
export const updateRecord = (storeName, record) => run(storeName, 'readwrite', (s) => s.put(record));
export const deleteRecord = (storeName, key) => run(storeName, 'readwrite', (s) => s.delete(key));
export const getRecord = (storeName, key) => run(storeName, 'readonly', (s) => s.get(key));
export const getAll = (storeName) => run(storeName, 'readonly', (s) => s.getAll());

// Specific domain helpers (example for foods)
export const FoodStore = {
  add: (food) => addRecord('foods', food),
  get: (id) => getRecord('foods', id),
  update: (food) => updateRecord('foods', food),
  delete: (id) => deleteRecord('foods', id),
  getAll: () => getAll('foods'),
};

/** Utility to generate a UUID v4 – sufficient for local use. */
export function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}
