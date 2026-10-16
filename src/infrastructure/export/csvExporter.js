/**
 * src/infrastructure/export/csvExporter.js
 *
 * Generatore CSV client-side per FODMAP Path.
 * Produce file CSV separati per Pasti, Sintomi, Bristol e Challenge,
 * scaricabili direttamente dal browser senza alcun server esterno.
 *
 * Encoding: UTF-8 con BOM per compatibilità Excel.
 * Separatore: punto e virgola (;) per locale italiano.
 */

import { openDB } from '../storage/db.js';

// ── Costanti ──────────────────────────────────────────────────────────────────
const CSV_SEPARATOR = ';';
const UTF8_BOM = '\uFEFF';

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Escape di un valore per CSV: se contiene il separatore, virgolette o newline,
 * lo racchiude tra doppi apici e raddoppia le virgolette interne.
 */
function escapeCSV(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(CSV_SEPARATOR) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Converte un array di oggetti in stringa CSV con intestazione.
 * @param {string[]} headers - Nomi delle colonne
 * @param {Array<Object>} rows - Righe di dati
 * @param {Function} rowMapper - Funzione che converte un oggetto in array di valori
 * @returns {string} Contenuto CSV completo
 */
function toCSV(headers, rows, rowMapper) {
  const lines = [headers.map(escapeCSV).join(CSV_SEPARATOR)];
  for (const row of rows) {
    const values = rowMapper(row);
    lines.push(values.map(escapeCSV).join(CSV_SEPARATOR));
  }
  return UTF8_BOM + lines.join('\r\n');
}

/**
 * Formatta una data ISO in formato leggibile italiano (DD/MM/YYYY HH:mm).
 */
function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return isoString;
  }
}

/**
 * Formatta solo la data senza orario (DD/MM/YYYY).
 */
function formatDateOnly(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return isoString;
  }
}

// ── Helper per leggere tutti i record da uno store ────────────────────────────

async function getAllFromStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Filtra i record per intervallo temporale.
 * @param {Array} records - Record con campo timestamp o date
 * @param {number} days - Numero di giorni dal presente (0 = tutto)
 */
function filterByPeriod(records, days, dateField = 'timestamp') {
  if (!days || days <= 0) return records;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = cutoff.toISOString();
  return records.filter((r) => {
    const val = r[dateField];
    return val && val >= cutoffISO;
  });
}

// ── Esportazione Pasti ────────────────────────────────────────────────────────

const MEAL_HEADERS = [
  'Data e Ora',
  'Tipo Pasto',
  'Fuori Casa',
  'Alimento',
  'Porzione (quantità)',
  'Unità',
  'Preparazione',
  'Gruppi FODMAP',
  'Porzione Stimata',
  'Note Pasto',
];

function mealToRows(meal) {
  if (!meal.items || meal.items.length === 0) {
    return [[
      formatDate(meal.timestamp),
      meal.mealType || '',
      meal.isEatingOut ? 'Sì' : 'No',
      '(pasto vuoto)',
      '', '', '', '', '',
      meal.notes || '',
    ]];
  }
  return meal.items.map((item) => [
    formatDate(meal.timestamp),
    meal.mealType || '',
    meal.isEatingOut ? 'Sì' : 'No',
    item.foodName || '',
    item.consumedPortion?.amount ?? '',
    item.consumedPortion?.unit ?? '',
    item.preparationUsed || '',
    (item.fodmapGroupsSnapshot || []).join(', '),
    item.isEstimated ? 'Sì' : 'No',
    meal.notes || '',
  ]);
}

/**
 * Genera il CSV dei pasti.
 * @param {number} periodDays - Filtro temporale (0 = tutto)
 * @returns {Promise<string>} Contenuto CSV
 */
export async function exportMealsCSV(periodDays = 0) {
  let meals = await getAllFromStore('meals');
  meals = filterByPeriod(meals, periodDays);
  meals.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  // Espandi i pasti: un pasto con N items diventa N righe
  const allRows = [];
  for (const meal of meals) {
    allRows.push(...mealToRows(meal));
  }

  const lines = [UTF8_BOM + MEAL_HEADERS.map(escapeCSV).join(CSV_SEPARATOR)];
  for (const row of allRows) {
    lines.push(row.map(escapeCSV).join(CSV_SEPARATOR));
  }
  return lines.join('\r\n');
}

// ── Esportazione Sintomi ──────────────────────────────────────────────────────

const SYMPTOM_HEADERS = [
  'Data e Ora',
  'Tipo Check-in',
  'Gonfiore (0-10)',
  'Dolore Addominale (0-10)',
  'Confronto Baseline',
  'Nessun Sintomo',
  'Distensione Visibile',
  'Flatulenza',
  'Dolore Pelvico (0-10)',
  'Nausea (0-10)',
  'Urgenza Evacuativa',
  'Evacuazione Incompleta',
  'Minuti dopo Pasto',
  'Durata (min)',
];

/**
 * Genera il CSV dei sintomi.
 */
export async function exportSymptomsCSV(periodDays = 0) {
  let symptoms = await getAllFromStore('symptoms');
  symptoms = filterByPeriod(symptoms, periodDays);
  symptoms.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  return toCSV(SYMPTOM_HEADERS, symptoms, (s) => [
    formatDate(s.timestamp),
    s.type || '',
    s.bloatingIntensity ?? '',
    s.abdominalPainIntensity ?? '',
    s.generalComparisonToBaseline || '',
    s.noSymptomsFlag ? 'Sì' : 'No',
    s.visibleDistension == null ? '' : s.visibleDistension ? 'Sì' : 'No',
    s.flatulenceSeverity || '',
    s.pelvicPainIntensity ?? '',
    s.nauseaIntensity ?? '',
    s.evacuationUrgency == null ? '' : s.evacuationUrgency ? 'Sì' : 'No',
    s.incompleteEvacuation == null ? '' : s.incompleteEvacuation ? 'Sì' : 'No',
    s.onsetMinutesAfterMeal ?? '',
    s.durationMinutes ?? '',
  ]);
}

// ── Esportazione Registro Alvo Bristol ────────────────────────────────────────

const BRISTOL_HEADERS = [
  'Data e Ora',
  'Tipo Bristol (1-7)',
  'Urgenza',
  'Dolore Evacuazione (0-10)',
  'Sforzo',
  'Evacuazione Incompleta',
  'Muco Presente',
  'Note',
];

/**
 * Genera il CSV del registro alvo Bristol.
 */
export async function exportBristolCSV(periodDays = 0) {
  let events = await getAllFromStore('bowel_events');
  events = filterByPeriod(events, periodDays);
  events.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  return toCSV(BRISTOL_HEADERS, events, (e) => [
    formatDate(e.timestamp),
    e.bristolType ?? '',
    e.urgency || '',
    e.painDuringDefecation ?? '',
    e.straining || '',
    e.incompleteEvacuation ? 'Sì' : 'No',
    e.mucusPresent ? 'Sì' : 'No',
    e.notes || '',
  ]);
}

// ── Esportazione Challenge ────────────────────────────────────────────────────

const CHALLENGE_HEADERS = [
  'Gruppo FODMAP',
  'Alimento Test',
  'Data Inizio',
  'Stato',
  'Dose Giorno 1',
  'Dose Giorno 2',
  'Dose Giorno 3',
  'Dolore Max G1',
  'Gonfiore Max G1',
  'Dolore Max G2',
  'Gonfiore Max G2',
  'Dolore Max G3',
  'Gonfiore Max G3',
  'Esito',
  'Confermato',
];

function formatDose(portion) {
  if (!portion) return '';
  return `${portion.amount || '?'} ${portion.unit || ''}${portion.description ? ' (' + portion.description + ')' : ''}`;
}

function getDayLog(challenge, day) {
  if (!challenge.dayLogs) return {};
  return challenge.dayLogs.find((d) => d.day === day) || {};
}

/**
 * Genera il CSV dei challenge di reintroduzione.
 */
export async function exportChallengesCSV(periodDays = 0) {
  let challenges = await getAllFromStore('challenges');
  challenges = filterByPeriod(challenges, periodDays, 'startDate');
  challenges.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

  return toCSV(CHALLENGE_HEADERS, challenges, (c) => {
    const d1 = getDayLog(c, 1);
    const d2 = getDayLog(c, 2);
    const d3 = getDayLog(c, 3);
    return [
      c.fodmapGroup || '',
      c.testFoodName || '',
      formatDateOnly(c.startDate),
      c.state || '',
      formatDose(c.doses?.day1),
      formatDose(c.doses?.day2),
      formatDose(c.doses?.day3),
      d1.maxPain ?? '',
      d1.maxBloating ?? '',
      d2.maxPain ?? '',
      d2.maxBloating ?? '',
      d3.maxPain ?? '',
      d3.maxBloating ?? '',
      c.outcome || '',
      c.confirmedByPatient ? 'Sì' : 'No',
    ];
  });
}

// ── Download Helper ───────────────────────────────────────────────────────────

/**
 * Scarica una stringa come file CSV nel browser.
 * @param {string} csvContent - Contenuto CSV
 * @param {string} filename - Nome del file (con estensione)
 */
export function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Pulizia dopo il click
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

// ── Esportazione Completa (Tutti i CSV in un unico zip o download multiplo) ──

/**
 * Genera e scarica tutti i CSV del periodo selezionato.
 * @param {number} periodDays - Filtro temporale (14, 30, 60 o 0 per tutto)
 */
export async function exportAllCSV(periodDays = 0) {
  const suffix = periodDays > 0 ? `_${periodDays}gg` : '_completo';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const [mealsCSV, symptomsCSV, bristolCSV, challengesCSV] = await Promise.all([
    exportMealsCSV(periodDays),
    exportSymptomsCSV(periodDays),
    exportBristolCSV(periodDays),
    exportChallengesCSV(periodDays),
  ]);

  downloadCSV(mealsCSV, `FODMAP_Pasti${suffix}_${dateStr}.csv`);
  downloadCSV(symptomsCSV, `FODMAP_Sintomi${suffix}_${dateStr}.csv`);
  downloadCSV(bristolCSV, `FODMAP_Bristol${suffix}_${dateStr}.csv`);
  downloadCSV(challengesCSV, `FODMAP_Challenge${suffix}_${dateStr}.csv`);
}
