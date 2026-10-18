/**
 * src/infrastructure/export/csvExporter.js
 *
 * Generatore CSV client-side (UTF-8 BOM, separatore ";" locale IT).
 * Le colonne riflettono i campi realmente scritti dall'app card-only:
 * pasti a occorrenze con FODMAP e zuccheri, check-in sintomi, Bristol.
 * I vecchi record con porzioni in grammi restano leggibili via fallback.
 */

import { openDB } from '../storage/db.js';

const CSV_SEPARATOR = ';';
const UTF8_BOM = '\uFEFF';

function escapeCSV(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(CSV_SEPARATOR) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function toCSV(headers, rows, rowMapper) {
  const lines = [headers.map(escapeCSV).join(CSV_SEPARATOR)];
  for (const row of rows) {
    lines.push(rowMapper(row).map(escapeCSV).join(CSV_SEPARATOR));
  }
  return UTF8_BOM + lines.join('\r\n');
}

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

function formatDateOnly(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleDateString('it-IT');
  } catch {
    return isoString;
  }
}

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

// -- Pasti (occasioni via card) --

const MEAL_HEADERS = [
  'Data e Ora',
  'Tipo Pasto',
  'Alimento',
  'Occorrenze',
  'Gruppi FODMAP',
  'Zuccheri',
  'Note Pasto',
];

function mealToRows(meal) {
  const base = [formatDate(meal.timestamp), meal.mealType || ''];
  if (!meal.items || meal.items.length === 0) {
    return [[...base, '(registrazione vuota)', '', '', '', meal.notes || '']];
  }
  return meal.items.map((item) => [
    ...base,
    item.foodName || '',
    // Card-only: 1 occorrenza; fallback ai grammi dei record pre-rifattorizzazione
    item.occurrences ?? item.consumedPortion?.amount ?? 1,
    (item.fodmapGroupsSnapshot || []).join(', '),
    (item.sugarsSnapshot || []).join(', '),
    meal.notes || '',
  ]);
}

export async function exportMealsCSV(periodDays = 0) {
  let meals = await getAllFromStore('meals');
  meals = filterByPeriod(meals, periodDays);
  meals.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

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

// -- Sintomi (check-in rapido) --

export async function exportSymptomsCSV(periodDays = 0) {
  let symptoms = await getAllFromStore('symptoms');
  symptoms = filterByPeriod(symptoms, periodDays);
  symptoms.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  return toCSV(
    ['Data e Ora', 'Tipo Check-in', 'Dolore (0-10)', 'Gonfiore (0-10)', 'Note'],
    symptoms,
    (s) => [
      formatDate(s.timestamp),
      s.type || '',
      s.abdominalPainIntensity ?? '',
      s.bloatingIntensity ?? '',
      s.notes || '',
    ]
  );
}

// -- Registro Bristol --

export async function exportBristolCSV(periodDays = 0) {
  let events = await getAllFromStore('bowel_events');
  events = filterByPeriod(events, periodDays);
  events.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  return toCSV(
    ['Data e Ora', 'Tipo Bristol (1-7)', 'Note'],
    events,
    (e) => [formatDate(e.timestamp), e.bristolType ?? '', e.notes || '']
  );
}

// -- Challenge --

function formatDose(portion) {
  if (!portion) return '';
  return `${portion.amount || '?'} ${portion.unit || ''}${portion.description ? ' (' + portion.description + ')' : ''}`;
}

function getDayLog(challenge, day) {
  if (!challenge.dayLogs) return {};
  return challenge.dayLogs.find((d) => d.day === day) || {};
}

export async function exportChallengesCSV(periodDays = 0) {
  let challenges = await getAllFromStore('challenges');
  challenges = filterByPeriod(challenges, periodDays, 'startDate');
  challenges.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

  return toCSV(
    ['Gruppo FODMAP', 'Alimento Test', 'Data Inizio', 'Stato',
     'Dose G1', 'Dose G2', 'Dose G3',
     'Dolore Max G1', 'Gonfiore Max G1',
     'Dolore Max G2', 'Gonfiore Max G2',
     'Dolore Max G3', 'Gonfiore Max G3', 'Esito'],
    challenges,
    (c) => {
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
        d1.maxPain ?? '', d1.maxBloating ?? '',
        d2.maxPain ?? '', d2.maxBloating ?? '',
        d3.maxPain ?? '', d3.maxBloating ?? '',
        c.outcome || '',
      ];
    }
  );
}

// -- Download --

export function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

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
