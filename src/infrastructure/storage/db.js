/**
 * src/infrastructure/storage/db.js
 *
 * IndexedDB wrapper for FODMAP Path local‑first storage.
 * Provides async CRUD helpers for the domain stores defined in the
 * specification (foods, meals, symptoms, bowel_events, challenges,
 * cycle_logs, confounders, user_profile).
 *
 * Uses the `idb` library pattern – a tiny promisified wrapper –
 * but implements only the needed functionality without external
 * dependencies, ensuring the app works offline.
 */

const DB_NAME = 'fodmap-path-db';
const DB_VERSION = 1; // Increment when schema changes

/**
 * Open (or create) the IndexedDB database. Returns a Promise that
 * resolves with the `IDBDatabase` instance.
 */
export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      // -- Object stores ---------------------------------------------------
      const foods = db.createObjectStore('foods', { keyPath: 'id' });
      foods.createIndex('name', 'name', { unique: false });
      foods.createIndex('category', 'category', { unique: false });
      foods.createIndex('status', 'tolerance.status', { unique: false });
      foods.createIndex('archived', 'isArchived', { unique: false });

      const meals = db.createObjectStore('meals', { keyPath: 'id' });
      meals.createIndex('timestamp', 'timestamp', { unique: false });
      meals.createIndex('mealType', 'mealType', { unique: false });
      meals.createIndex('isEatingOut', 'isEatingOut', { unique: false });

      const symptoms = db.createObjectStore('symptoms', { keyPath: 'id' });
      symptoms.createIndex('timestamp', 'timestamp');
      symptoms.createIndex('type', 'type');

      const bowel = db.createObjectStore('bowel_events', { keyPath: 'id' });
      bowel.createIndex('timestamp', 'timestamp');
      bowel.createIndex('bristolType', 'bristolType');

      const challenges = db.createObjectStore('challenges', { keyPath: 'id' });
      challenges.createIndex('state', 'state');
      challenges.createIndex('fodmapGroup', 'fodmapGroup');
      challenges.createIndex('startDate', 'startDate');

      const cycles = db.createObjectStore('cycle_logs', { keyPath: 'date' });
      cycles.createIndex('cycleDay', 'cycleDay');
      cycles.createIndex('menstrualFlow', 'menstrualFlow');

      const conf = db.createObjectStore('confounders', { keyPath: 'date' });
      conf.createIndex('stressLevel', 'stressLevel');

      const profile = db.createObjectStore('user_profile', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Generic helper to perform a transaction */
function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    return { tx, store };
  });
}

// ---------- CRUD helpers ---------------------------------------------------
export async function addRecord(storeName, record) {
  const { tx, store } = await tx(storeName, 'readwrite');
  store.add(record);
  return tx.complete;
}

export async function getRecord(storeName, key) {
  const { tx, store } = await tx(storeName);
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function updateRecord(storeName, record) {
  const { tx, store } = await tx(storeName, 'readwrite');
  store.put(record);
  return tx.complete;
}

export async function deleteRecord(storeName, key) {
  const { tx, store } = await tx(storeName, 'readwrite');
  store.delete(key);
  return tx.complete;
}

export async function getAll(storeName) {
  const { tx, store } = await tx(storeName);
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Specific domain helpers (example for foods)
export const FoodStore = {
  add: (food) => addRecord('foods', food),
  get: (id) => getRecord('foods', id),
  update: (food) => updateRecord('foods', food),
  delete: (id) => deleteRecord('foods', id),
  getAll: () => getAll('foods'),
};

// Similar objects can be created for meals, symptoms, bowel_events, etc.

/**
 * Utility to generate a UUID v4 – sufficient for local use.
 */
export function uuidv4() {
  // Crypto‑secure random UUID
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}
