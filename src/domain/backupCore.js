// Formato e validazione dei backup di Fudy. Logica pura: nessun accesso a DOM o IndexedDB.

export const BACKUP_FORMAT = 'fudy-backup';
export const BACKUP_VERSION = 1;
export const SCHEMA_VERSION = 1;
export const STORE_NAMES = ['foods', 'meals', 'symptoms', 'bowel_events', 'challenges', 'confounders', 'user_profile'];
export const LOCAL_KEYS = ['fudy_prefs', 'fudy_cards_migration_v1'];
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_RECORDS = 500000;

const KEY_PATH = { foods: 'id', meals: 'id', symptoms: 'id', bowel_events: 'id', challenges: 'id', confounders: 'date', user_profile: 'key' };
const TIME_FIELD = { meals: 'timestamp', symptoms: 'timestamp', bowel_events: 'timestamp' };
const MAX_MESSAGES = 10;
const MAX_DEPTH = 30;

export class BackupError extends Error {}

const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Serializzazione con chiavi ordinate: lo stesso contenuto da' sempre lo stesso controllo di integrita'.
export function canonicalize(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (isPlain(value)) {
    return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined)
      .map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  return JSON.stringify(value === undefined ? null : value);
}

export async function checksumOf(payload, subtle = globalThis.crypto?.subtle) {
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(canonicalize(payload)));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function buildBackup({ stores, local = {}, now = new Date(), subtle } = {}) {
  const jsonStores = {};
  // Passaggio JSON: il controllo e il file descrivono esattamente gli stessi dati.
  for (const name of STORE_NAMES) jsonStores[name] = JSON.parse(JSON.stringify(stores?.[name] ?? []));
  const jsonLocal = {};
  for (const key of LOCAL_KEYS) if (typeof local[key] === 'string') jsonLocal[key] = local[key];
  const counts = Object.fromEntries(STORE_NAMES.map(name => [name, jsonStores[name].length]));
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, schemaVersion: SCHEMA_VERSION, app: 'Fudy',
    createdAt: now.toISOString(), counts, local: jsonLocal,
    checksum: await checksumOf({ stores: jsonStores, local: jsonLocal }, subtle),
    stores: jsonStores
  };
}

export const serializeBackup = backup => JSON.stringify(backup);

export function parseBackupText(text) {
  if (typeof text !== 'string' || !text.trim()) throw new BackupError('Il file e vuoto.');
  try { return JSON.parse(text); } catch { throw new BackupError('Il file non e un JSON valido.'); }
}

function findForbiddenKey(value, depth = 0) {
  if (depth > MAX_DEPTH) return 'struttura troppo profonda';
  if (Array.isArray(value)) {
    for (const item of value) { const found = findForbiddenKey(item, depth + 1); if (found) return found; }
  } else if (isPlain(value)) {
    for (const key of Object.keys(value)) {
      if (key === '__proto__') return 'chiave non consentita (__proto__)';
      const found = findForbiddenKey(value[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function checkRecords(name, records, errors) {
  const keyPath = KEY_PATH[name];
  const seen = new Set();
  let problems = 0;
  const report = message => { if (problems++ < MAX_MESSAGES) errors.push(message); };
  records.forEach((record, i) => {
    if (!isPlain(record)) return report(`${name}[${i}]: record non valido.`);
    const key = record[keyPath];
    if (typeof key !== 'string' || !key) return report(`${name}[${i}]: manca ${keyPath}.`);
    if (seen.has(key)) return report(`${name}: ${keyPath} duplicato (${key}).`);
    seen.add(key);
    const field = TIME_FIELD[name];
    if (field && (typeof record[field] !== 'string' || !Number.isFinite(Date.parse(record[field])))) report(`${name}[${i}]: data e ora non valide.`);
    if (name === 'meals' && !Array.isArray(record.items)) report(`${name}[${i}]: elenco alimenti mancante.`);
    if (name === 'confounders' && !/^\d{4}-\d{2}-\d{2}$/.test(key)) report(`${name}[${i}]: data del giorno non valida.`);
    if (name === 'user_profile' && key !== 'current') report(`${name}[${i}]: chiave profilo non valida.`);
  });
  if (name === 'user_profile' && records.length > 1) errors.push('Il profilo deve essere uno solo.');
  if (problems > MAX_MESSAGES) errors.push(`${name}: altri ${problems - MAX_MESSAGES} problemi non elencati.`);
}

export async function validateBackup(backup, { subtle } = {}) {
  const errors = [];
  const warnings = [];
  const fail = () => ({ ok: false, errors, warnings, summary: null });
  if (!isPlain(backup) || backup.format !== BACKUP_FORMAT) { errors.push('Non e un file di backup di Fudy.'); return fail(); }
  if (!Number.isInteger(backup.version) || backup.version < 1) { errors.push('Versione del backup non valida.'); return fail(); }
  if (backup.version > BACKUP_VERSION || (Number.isInteger(backup.schemaVersion) && backup.schemaVersion > SCHEMA_VERSION)) {
    errors.push('Il backup e stato creato da una versione piu recente di Fudy: aggiorna l app prima di importarlo.');
    return fail();
  }
  if (!isPlain(backup.stores)) { errors.push('Il backup non contiene i dati.'); return fail(); }
  const forbidden = findForbiddenKey(backup);
  if (forbidden) { errors.push(`File non sicuro: ${forbidden}.`); return fail(); }

  let total = 0;
  for (const name of STORE_NAMES) {
    const records = backup.stores[name];
    if (!Array.isArray(records)) { errors.push(`Archivio mancante: ${name}.`); continue; }
    total += records.length;
    if (isPlain(backup.counts) && backup.counts[name] !== records.length) errors.push(`${name}: il numero di record non corrisponde a quello dichiarato.`);
    checkRecords(name, records, errors);
  }
  if (total > MAX_RECORDS) errors.push('Il backup contiene troppi record.');
  const unknown = Object.keys(backup.stores).filter(name => !STORE_NAMES.includes(name));
  if (unknown.length) warnings.push(`Archivi ignorati: ${unknown.join(', ')}.`);

  const local = isPlain(backup.local) ? backup.local : {};
  const badLocal = Object.keys(local).filter(key => !LOCAL_KEYS.includes(key) || typeof local[key] !== 'string' || local[key].length > 10000);
  if (badLocal.length) warnings.push(`Preferenze ignorate: ${badLocal.join(', ')}.`);

  if (!errors.length) {
    if (backup.checksum) {
      const actual = await checksumOf({ stores: backup.stores, local }, subtle);
      if (actual === null) warnings.push('Controllo di integrita non verificabile in questo browser.');
      else if (actual !== backup.checksum) errors.push('Il contenuto non corrisponde al controllo di integrita: il file e stato modificato o e danneggiato.');
    } else {
      warnings.push('Il file non ha un controllo di integrita.');
    }
  }
  const counts = Object.fromEntries(STORE_NAMES.map(name => [name, Array.isArray(backup.stores[name]) ? backup.stores[name].length : 0]));
  return { ok: errors.length === 0, errors, warnings, summary: { createdAt: typeof backup.createdAt === 'string' ? backup.createdAt : null, counts, total } };
}
