/** Local-first IndexedDB storage. No external dependencies. */
const DB_NAME = 'fodmap-path-db';
const DB_VERSION = 1;
let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const ensure = (name, keyPath, indexes = {}) => {
        const store = db.objectStoreNames.contains(name)
          ? request.transaction.objectStore(name)
          : db.createObjectStore(name, { keyPath });
        for (const [name, path] of Object.entries(indexes)) {
          if (!store.indexNames.contains(name)) store.createIndex(name, path, { unique: false });
        }
      };
      ensure('foods', 'id', { name: 'name', category: 'category', status: 'tolerance.status', archived: 'isArchived' });
      ensure('meals', 'id', { timestamp: 'timestamp', mealType: 'mealType', isEatingOut: 'isEatingOut' });
      ensure('symptoms', 'id', { timestamp: 'timestamp', type: 'type' });
      ensure('bowel_events', 'id', { timestamp: 'timestamp', bristolType: 'bristolType' });
      ensure('challenges', 'id', { state: 'state', fodmapGroup: 'fodmapGroup', startDate: 'startDate' });
      ensure('cycle_logs', 'date', { cycleDay: 'cycleDay', menstrualFlow: 'menstrualFlow' });
      ensure('confounders', 'date', { stressLevel: 'stressLevel' });
      ensure('user_profile', 'key');
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => { dbPromise = null; reject(request.error); };
    request.onblocked = () => {
      console.warn('Aggiornamento database bloccato: chiudi le altre schede di Fudy.');
    };
  });
  dbPromise = dbPromise.catch(error => { dbPromise = null; throw error; });
  return dbPromise;
}

async function run(storeName, mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    let result;
    let operationError;
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(operationError || transaction.error || new Error('Transazione annullata'));
    transaction.onerror = () => { operationError = operationError || transaction.error; };
    try {
      const request = action(transaction.objectStore(storeName));
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => { operationError = request.error; };
    } catch (error) {
      operationError = error;
      try { transaction.abort(); } catch (_) { reject(error); }
    }
  });
}

export const addRecord = (storeName, record) => run(storeName, 'readwrite', store => store.add(record));
export const updateRecord = (storeName, record) => run(storeName, 'readwrite', store => store.put(record));
export const deleteRecord = (storeName, key) => run(storeName, 'readwrite', store => store.delete(key));
export const getRecord = (storeName, key) => run(storeName, 'readonly', store => store.get(key));
export const getAll = storeName => run(storeName, 'readonly', store => store.getAll());

export const FoodStore = {
  add: food => addRecord('foods', food),
  get: id => getRecord('foods', id),
  update: food => updateRecord('foods', food),
  delete: id => deleteRecord('foods', id),
  getAll: () => getAll('foods'),
};

export function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}
