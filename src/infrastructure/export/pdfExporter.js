/**
 * src/infrastructure/export/pdfExporter.js
 *
 * Generatore PDF client-side per FODMAP Path.
 * Produce un report sintetico di 2-3 pagine destinato al dietista
 * o gastroenterologo, interamente generato nel browser senza
 * alcuna chiamata a server esterni.
 */

import { openDB } from '../storage/db.js';
import { getProfile } from '../storage/userProfile.js';

// -- Utility lettura dati --

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
  return records.filter((r) => r[dateField] && r[dateField] >= cutoffISO);
}

function formatDateOnly(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return isoString;
  }
}

// -- Etichette --

const PHASE_LABELS = {
  PREPARATION: 'Preparazione / Baseline',
  BASELINE_OBSERVATION: 'Osservazione Baseline',
  REDUCTION: 'Riduzione (Eliminazione)',
  RESTRICTION: 'Riduzione (Eliminazione)',
  REINTRODUCTION: 'Reintroduzione Guidata',
  PERSONALIZATION: 'Personalizzazione / Mantenimento',
};

const FODMAP_GROUP_LABELS = {
  FRUCTANS_GRAIN: 'Fruttani (Cereali)',
  FRUCTANS_VEG_GARLIC: 'Fruttani (Aglio/Cipolla)',
  GOS: 'Galatto-oligosaccaridi',
  LACTOSE: 'Lattosio',
  EXCESS_FRUCTOSE: 'Fruttosio in eccesso',
  SORBITOL: 'Sorbitolo',
  MANNITOL: 'Mannitolo',
  LOW_FODMAP_SAFE: 'Basso FODMAP',
};

const OUTCOME_LABELS = {
  TOLERATED_HIGH_DOSE: 'Tollerato ad alta dose',
  TOLERATED_MEDIUM_DOSE: 'Tollerato a dose media',
  TOLERATED_INITIAL_DOSE: 'Tollerato solo dose iniziale',
  MILD_SYMPTOMS_ACCEPTABLE: 'Sintomi lievi accettabili',
  SEVERE_SYMPTOMS_FAILED: 'Sintomi severi - non tollerato',
  INCONCLUSIVE_CONFOUNDERS: 'Dubbio (confondenti presenti)',
  ABORTED_EARLY: 'Interrotto precocemente',
};

// -- Raccolta e analisi dati --

async function gatherReportData(periodDays, options = {}) {
  const [profile, allMeals, allSymptoms, allBristol, allChallenges, allFoods, allCycles] =
    await Promise.all([
      getProfile(),
      getAllFromStore('meals'),
      getAllFromStore('symptoms'),
      getAllFromStore('bowel_events'),
      getAllFromStore('challenges'),
      getAllFromStore('foods'),
      getAllFromStore('cycle_logs'),
    ]);

  const meals = filterByPeriod(allMeals, periodDays);
  const symptoms = filterByPeriod(allSymptoms, periodDays);
  const bristol = filterByPeriod(allBristol, periodDays);
  const challenges = filterByPeriod(allChallenges, periodDays, 'startDate');
  const cycles = filterByPeriod(allCycles, periodDays, 'date');

  const painValues = symptoms.map((s) => s.abdominalPainIntensity).filter((v) => v != null);
  const bloatValues = symptoms.map((s) => s.bloatingIntensity).filter((v) => v != null);
  const avgPain = painValues.length > 0 ? (painValues.reduce((a, b) => a + b, 0) / painValues.length) : null;
  const avgBloat = bloatValues.length > 0 ? (bloatValues.reduce((a, b) => a + b, 0) / bloatValues.length) : null;
  const asymptomaticDays = computeAsymptomaticDays(symptoms);

  const bristolDist = [0, 0, 0, 0, 0, 0, 0];
  for (const b of bristol) {
    if (b.bristolType >= 1 && b.bristolType <= 7) {
      bristolDist[b.bristolType - 1]++;
    }
  }

  const toleranceMap = buildToleranceMap(allFoods);

  const completedChallenges = challenges.filter(
    (c) => c.state === 'FINALIZED' || c.state === 'COMPLETED_PENDING_REVIEW'
  );

  return {
    profile,
    periodDays,
    meals,
    symptoms,
    bristol,
    challenges: completedChallenges,
    foods: allFoods,
    cycles,
    stats: {
      totalMeals: meals.length,
      totalSymptomCheckins: symptoms.length,
      totalBristol: bristol.length,
      avgPain,
      avgBloat,
      baselinePain: profile.baseline?.pain ?? null,
      baselineBloat: profile.baseline?.bloat ?? null,
      asymptomaticDays,
      bristolDist,
    },
    toleranceMap,
    hideNotes: options.hidePersonalNotes || false,
  };
}

function computeAsymptomaticDays(symptoms) {
  const dayMap = {};
  for (const s of symptoms) {
    if (!s.timestamp) continue;
    const day = s.timestamp.slice(0, 10);
    if (!dayMap[day]) dayMap[day] = true;
    if (s.abdominalPainIntensity > 2 || s.bloatingIntensity > 2) {
      dayMap[day] = false;
    }
  }
  const total = Object.keys(dayMap).length;
  const asymptomatic = Object.values(dayMap).filter(Boolean).length;
  return { total, asymptomatic };
}

function buildToleranceMap(foods) {
  const map = {};
  for (const group of Object.keys(FODMAP_GROUP_LABELS)) {
    map[group] = { tolerated: [], doseLimited: [], notTolerated: [], untested: [], inObservation: [] };
  }

  for (const food of foods) {
    if (food.isArchived) continue;
    const groups = food.primaryFodmapGroup || [];
    const status = food.tolerance?.status || 'UNTESTED';

    for (const g of groups) {
      if (!map[g]) continue;
      const entry = { name: food.name, maxPortion: food.tolerance?.maxToleratedPortion };
      switch (status) {
        case 'FREELY_TOLERATED': map[g].tolerated.push(entry); break;
        case 'DOSE_LIMITED': map[g].doseLimited.push(entry); break;
        case 'NOT_TOLERATED': map[g].notTolerated.push(entry); break;
        case 'IN_OBSERVATION': map[g].inObservation.push(entry); break;
        default: map[g].untested.push(entry); break;
      }
    }
  }
  return map;
}

// -- Generazione HTML del report --

function generateReportHTML(data) {
  const { profile, periodDays, stats, toleranceMap, challenges, cycles, hideNotes } = data;
  const periodLabel = periodDays > 0 ? `Ultimi ${periodDays} giorni` : 'Periodo completo';
  const today = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

  let html = `
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>Report FODMAP Path</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 11px;
      color: #1f2937;
      line-height: 1.5;
      background: #fff;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #059669;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .report-title { font-size: 22px; font-weight: 700; color: #059669; }
    .report-subtitle { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .report-meta { text-align: right; font-size: 10px; color: #9ca3af; }

    h2 {
      font-size: 14px;
      color: #059669;
      border-bottom: 1px solid #d1fae5;
      padding-bottom: 4px;
      margin: 16px 0 10px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .summary-card {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      padding: 10px;
      text-align: center;
    }
    .summary-card .value { font-size: 24px; font-weight: 700; color: #059669; }
    .summary-card .label { font-size: 9px; color: #6b7280; text-transform: uppercase; }

    .baseline-comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }
    .baseline-box {
      background: #fefce8;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 10px;
    }
    .baseline-box .metric-name { font-weight: 600; font-size: 11px; color: #92400e; }
    .baseline-box .metric-row {
      display: flex;
      justify-content: space-between;
      margin-top: 4px;
      font-size: 10px;
    }
    .metric-bar {
      height: 8px;
      border-radius: 4px;
      margin-top: 4px;
    }

    .tolerance-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-bottom: 12px;
    }
    .tolerance-table th {
      background: #059669;
      color: white;
      padding: 6px 8px;
      text-align: left;
      font-weight: 600;
    }
    .tolerance-table td {
      padding: 5px 8px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
    }
    .tolerance-table tr:nth-child(even) { background: #f9fafb; }

    .badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 9999px;
      font-size: 9px;
      font-weight: 600;
      margin: 1px 2px;
    }
    .badge-green { background: #d1fae5; color: #065f46; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-yellow { background: #fef3c7; color: #92400e; }
    .badge-gray { background: #f3f4f6; color: #6b7280; }

    .bristol-chart {
      display: flex;
      align-items: flex-end;
      gap: 6px;
      height: 80px;
      margin: 8px 0 12px 0;
    }
    .bristol-bar-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .bristol-bar {
      width: 100%;
      max-width: 40px;
      border-radius: 4px 4px 0 0;
      transition: height 0.3s;
    }
    .bristol-label { font-size: 9px; color: #6b7280; margin-top: 3px; }
    .bristol-count { font-size: 9px; font-weight: 700; margin-bottom: 2px; }

    .challenge-list { list-style: none; padding: 0; }
    .challenge-item {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 6px;
    }
    .challenge-food { font-weight: 700; }
    .challenge-detail { font-size: 10px; color: #6b7280; }

    .disclaimer {
      margin-top: 20px;
      padding: 10px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      font-size: 9px;
      color: #9ca3af;
      text-align: center;
    }

    .page-break { page-break-before: always; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div>
      <div class="report-title">Report FODMAP Path</div>
      <div class="report-subtitle">${periodLabel} - Generato il ${today}</div>
    </div>
    <div class="report-meta">
      Fase attuale: <strong>${PHASE_LABELS[profile.phase] || profile.phase || '-'}</strong><br>
      Obiettivi: ${(profile.goals || []).join(', ') || '-'}
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="value">${stats.totalMeals}</div>
      <div class="label">Pasti registrati</div>
    </div>
    <div class="summary-card">
      <div class="value">${stats.totalSymptomCheckins}</div>
      <div class="label">Check-in sintomi</div>
    </div>
    <div class="summary-card">
      <div class="value">${stats.totalBristol}</div>
      <div class="label">Registrazioni Bristol</div>
    </div>
    <div class="summary-card">
      <div class="value">${stats.asymptomaticDays.asymptomatic}/${stats.asymptomaticDays.total}</div>
      <div class="label">Giorni asintomatici</div>
    </div>
  </div>

  <h2>Confronto con il Baseline</h2>
  <div class="baseline-comparison">
    <div class="baseline-box">
      <div class="metric-name">Dolore Addominale</div>
      <div class="metric-row">
        <span>Baseline: <strong>${stats.baselinePain ?? '-'}/10</strong></span>
        <span>Attuale: <strong>${stats.avgPain != null ? stats.avgPain.toFixed(1) : '-'}/10</strong></span>
      </div>
      ${stats.baselinePain != null && stats.avgPain != null ? `
      <div class="metric-bar" style="
        background: linear-gradient(90deg, #059669 ${Math.max(0, (1 - stats.avgPain / 10) * 100)}%, #ef4444 100%);
        width: ${Math.max(10, stats.avgPain * 10)}%;
      "></div>
      <div style="font-size: 9px; color: #6b7280; margin-top: 2px;">
        ${stats.avgPain < stats.baselinePain
          ? 'Migliorato del ' + Math.round(((stats.baselinePain - stats.avgPain) / stats.baselinePain) * 100) + '%'
          : stats.avgPain > stats.baselinePain
            ? 'Peggiorato del ' + Math.round(((stats.avgPain - stats.baselinePain) / stats.baselinePain) * 100) + '%'
            : 'Stabile'}
      </div>` : ''}
    </div>

    <div class="baseline-box">
      <div class="metric-name">Gonfiore Addominale</div>
      <div class="metric-row">
        <span>Baseline: <strong>${stats.baselineBloat ?? '-'}/10</strong></span>
        <span>Attuale: <strong>${stats.avgBloat != null ? stats.avgBloat.toFixed(1) : '-'}/10</strong></span>
      </div>
      ${stats.baselineBloat != null && stats.avgBloat != null ? `
      <div class="metric-bar" style="
        background: linear-gradient(90deg, #059669 ${Math.max(0, (1 - stats.avgBloat / 10) * 100)}%, #f59e0b 100%);
        width: ${Math.max(10, stats.avgBloat * 10)}%;
      "></div>
      <div style="font-size: 9px; color: #6b7280; margin-top: 2px;">
        ${stats.avgBloat < stats.baselineBloat
          ? 'Migliorato del ' + Math.round(((stats.baselineBloat - stats.avgBloat) / stats.baselineBloat) * 100) + '%'
          : stats.avgBloat > stats.baselineBloat
            ? 'Peggiorato del ' + Math.round(((stats.avgBloat - stats.baselineBloat) / stats.baselineBloat) * 100) + '%'
            : 'Stabile'}
      </div>` : ''}
    </div>
  </div>`;

  const maxBristol = Math.max(...stats.bristolDist, 1);
  const bristolColors = ['#991b1b', '#dc2626', '#f59e0b', '#10b981', '#3b82f6', '#f97316', '#ef4444'];

  html += `
  <h2>Distribuzione Alvo Bristol</h2>
  <div class="bristol-chart">
    ${stats.bristolDist.map((count, i) => `
      <div class="bristol-bar-container">
        <div class="bristol-count">${count}</div>
        <div class="bristol-bar" style="height: ${Math.max(4, (count / maxBristol) * 60)}px; background: ${bristolColors[i]};"></div>
        <div class="bristol-label">Tipo ${i + 1}</div>
      </div>
    `).join('')}
  </div>`;

  html += `
  <div class="page-break"></div>
  <h2>Mappa Tolleranze per Gruppo FODMAP</h2>
  <table class="tolerance-table">
    <thead>
      <tr>
        <th>Gruppo FODMAP</th>
        <th>Tollerato</th>
        <th>Dose-Limitato</th>
        <th>Non Tollerato</th>
        <th>In Osservazione</th>
      </tr>
    </thead>
    <tbody>`;

  for (const [group, info] of Object.entries(toleranceMap)) {
    if (group === 'LOW_FODMAP_SAFE') continue;
    const tolNames = info.tolerated.map((f) => f.name);
    const doseNames = info.doseLimited.map((f) => {
      const p = f.maxPortion;
      const portionStr = p ? ` (<=${p.amount}${p.unit})` : '';
      return f.name + portionStr;
    });
    const notTolNames = info.notTolerated.map((f) => f.name);
    const obsNames = info.inObservation.map((f) => f.name);

    html += `
      <tr>
        <td><strong>${FODMAP_GROUP_LABELS[group] || group}</strong></td>
        <td>${tolNames.length > 0 ? tolNames.map((n) => `<span class="badge badge-green">${n}</span>`).join(' ') : '<span class="badge badge-gray">-</span>'}</td>
        <td>${doseNames.length > 0 ? doseNames.map((n) => `<span class="badge badge-blue">${n}</span>`).join(' ') : '<span class="badge badge-gray">-</span>'}</td>
        <td>${notTolNames.length > 0 ? notTolNames.map((n) => `<span class="badge badge-red">${n}</span>`).join(' ') : '<span class="badge badge-gray">-</span>'}</td>
        <td>${obsNames.length > 0 ? obsNames.map((n) => `<span class="badge badge-yellow">${n}</span>`).join(' ') : '<span class="badge badge-gray">-</span>'}</td>
      </tr>`;
  }

  html += `
    </tbody>
  </table>`;

  if (challenges.length > 0) {
    html += `
  <h2>Challenge Completati nel Periodo</h2>
  <ul class="challenge-list">`;
    for (const c of challenges) {
      html += `
    <li class="challenge-item">
      <span class="challenge-food">${c.testFoodName || '-'}</span>
      <span class="badge ${c.outcome?.includes('TOLERATED') ? 'badge-green' : c.outcome?.includes('FAILED') ? 'badge-red' : 'badge-yellow'}">
        ${OUTCOME_LABELS[c.outcome] || c.outcome || '-'}
      </span>
      <div class="challenge-detail">
        Gruppo: ${FODMAP_GROUP_LABELS[c.fodmapGroup] || c.fodmapGroup || '-'} -
        Inizio: ${formatDateOnly(c.startDate)}
      </div>
    </li>`;
    }
    html += `
  </ul>`;
  }

  if (cycles.length > 0) {
    const endoDays = cycles.filter((c) => c.endoBellyDistension).length;
    const painfulDays = cycles.filter((c) => c.dysmenorrhea > 3 || c.pelvicPainNonCyclic > 3).length;
    html += `
  <h2>Correlazione Ciclo Mestruale</h2>
  <div class="summary-grid" style="grid-template-columns: repeat(3, 1fr);">
    <div class="summary-card">
      <div class="value">${cycles.length}</div>
      <div class="label">Giorni con log ciclo</div>
    </div>
    <div class="summary-card">
      <div class="value">${endoDays}</div>
      <div class="label">Giorni con endo-belly</div>
    </div>
    <div class="summary-card">
      <div class="value">${painfulDays}</div>
      <div class="label">Giorni con dolore pelvico >3</div>
    </div>
  </div>`;
  }

  html += `
  <div class="disclaimer">
    <strong>Disclaimer:</strong> Questo report e' generato automaticamente da Fudy ed e' destinato esclusivamente
    a supportare il colloquio con il professionista sanitario. Non costituisce diagnosi medica ne' consiglio terapeutico.
    Generato interamente in locale - nessun dato e' stato trasmesso a server esterni.
  </div>

</body>
</html>`;

  return html;
}

// -- Generazione e download PDF --

/**
 * Crea un documento HTML con stili di stampa, lo apre in una nuova finestra
 * e invoca window.print() (Stampa > Salva come PDF): zero dipendenze,
 * funziona offline, pieno controllo del formato all'utente.
 */
export async function generatePDFReport(periodDays = 30, options = {}) {
  const data = await gatherReportData(periodDays, options);
  const html = generateReportHTML(data);

  const printWindow = window.open('', '_blank', 'width=800,height=1100');
  if (!printWindow) {
    downloadReportAsHTML(html);
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };
}

/** Fallback: scarica il report come file HTML se il popup e' bloccato. */
function downloadReportAsHTML(html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Report_Fudy_${new Date().toISOString().slice(0, 10)}.html`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

/** Restituisce l'HTML del report senza aprire finestre (anteprima in-app). */
export async function getReportHTML(periodDays = 30, options = {}) {
  const data = await gatherReportData(periodDays, options);
  return generateReportHTML(data);
}
