// Esportazione e ripristino dei dati locali. Il ripristino sostituisce tutto in una sola transazione.
import { openDB } from './db.js';
import { STORE_NAMES, LOCAL_KEYS, MAX_FILE_BYTES, BackupError, buildBackup, serializeBackup, parseBackupText, validateBackup } from '../../domain/backupCore.js';

export const LAST_BACKUP_KEY = 'fudy_last_backup';

// Lettura di tutti gli archivi in una sola transazione: istantanea coerente.
export function snapshotFromDb(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES, 'readonly');
    const out = {};
    for (const name of STORE_NAMES) {
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => { out[name] = request.result || []; };
    }
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Lettura annullata'));
  });
}

// Sostituzione atomica: se un solo record fallisce la transazione viene annullata e i dati restano com'erano.
export function restoreIntoDb(db, backup) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Ripristino non riuscito'));
    tx.onabort = () => reject(tx.error || new Error('Ripristino annullato'));
    try {
      for (const name of STORE_NAMES) {
        const store = tx.objectStore(name);
        store.clear();
        for (const record of backup.stores[name]) store.put(record);
      }
    } catch (error) {
      try { tx.abort(); } catch (_) { /* gia terminata */ }
      reject(error);
    }
  });
}

const countsOf = snapshot => Object.fromEntries(STORE_NAMES.map(name => [name, (snapshot[name] || []).length]));

function readLocal() {
  const local = {};
  for (const key of LOCAL_KEYS) { const value = localStorage.getItem(key); if (value !== null) local[key] = value; }
  return local;
}

export async function currentCounts() {
  return countsOf(await snapshotFromDb(await openDB()));
}

export async function createBackupFile() {
  const stores = await snapshotFromDb(await openDB());
  const backup = await buildBackup({ stores, local: readLocal() });
  const text = serializeBackup(backup);
  const check = await validateBackup(parseBackupText(text));
  if (!check.ok) throw new BackupError('Verifica del backup non riuscita: ' + check.errors[0]);
  const d = new Date(backup.createdAt);
  const pad = n => String(n).padStart(2, '0');
  const filename = `fudy-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  return { text, filename, counts: backup.counts, createdAt: backup.createdAt };
}

export function downloadBackup({ text, filename }) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
}

export async function inspectBackupFile(file) {
  if (!file) throw new BackupError('Nessun file selezionato.');
  if (file.size > MAX_FILE_BYTES) throw new BackupError('Il file supera la dimensione massima di 50 MB.');
  const backup = parseBackupText(await file.text());
  const report = await validateBackup(backup);
  return { backup, report, current: report.ok ? await currentCounts() : null };
}

export async function restoreBackup(backup) {
  const report = await validateBackup(backup);
  if (!report.ok) throw new BackupError('Backup non valido: ' + report.errors[0]);
  const db = await openDB();
  await restoreIntoDb(db, backup);
  const after = countsOf(await snapshotFromDb(db));
  const wrong = STORE_NAMES.filter(name => after[name] !== backup.stores[name].length);
  if (wrong.length) throw new BackupError('Verifica dopo il ripristino non riuscita: ' + wrong.join(', '));
  for (const key of LOCAL_KEYS) {
    if (backup.local && typeof backup.local[key] === 'string') localStorage.setItem(key, backup.local[key]);
  }
  return after;
}

export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return 'unsupported';
    if (await navigator.storage.persisted()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch { return 'unsupported'; }
}
