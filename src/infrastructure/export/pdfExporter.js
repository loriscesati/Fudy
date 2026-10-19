/**
 * src/infrastructure/export/pdfExporter.js
 *
 * Report HTML/PDF generato interamente nel browser (stampa -> salva come PDF).
 * Numeri descrittivi: nessuna diagnosi e nessuna conclusione causale.
 * I calcoli vengono da reportStats.js, gli stessi principi di Progressi.
 */

import { openDB } from '../storage/db.js';
import { getProfile } from '../storage/userProfile.js';
import { computeReportStats } from '../../domain/insights/reportStats.js';

async function getAllFromStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function filterByPeriod(records, days, field = 'timestamp') {
  if (!days || days <= 0) return records;
  const cutoff = Date.now() - days * 86400000;
  return records.filter((r) => Number.isFinite(Date.parse(r[field])) && Date.parse(r[field]) >= cutoff);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const fmt1 = (v) => (v == null ? 'n.d.' : v.toFixed(1));
const fmtDate = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
};

const PHASE_LABELS = {
  PREPARATION: 'Preparazione / osservazione',
  REDUCTION: 'Riduzione temporanea',
  REINTRODUCTION: 'Reintroduzione',
  PERSONALIZATION: 'Personalizzazione',
};
const FODMAP_GROUP_LABELS = {
  FRUCTANS_GRAIN: 'Fruttani (cereali)', FRUCTANS_VEG_GARLIC: 'Fruttani (aglio/cipolla)', GOS: 'GOS',
  LACTOSE: 'Lattosio', EXCESS_FRUCTOSE: 'Fruttosio in eccesso', SORBITOL: 'Sorbitolo', MANNITOL: 'Mannitolo',
  LOW_FODMAP_SAFE: 'Basso FODMAP',
};
const OUTCOME_LABELS = {
  TOLERATED_HIGH_DOSE: 'Tollerato ad alta dose', TOLERATED_MEDIUM_DOSE: 'Tollerato a dose media',
  TOLERATED_INITIAL_DOSE: 'Tollerato solo dose iniziale', MILD_SYMPTOMS_ACCEPTABLE: 'Sintomi lievi accettabili',
  SEVERE_SYMPTOMS_FAILED: 'Sintomi severi, non tollerato', INCONCLUSIVE_CONFOUNDERS: 'Dubbio (confondenti)',
  ABORTED_EARLY: 'Interrotto precocemente',
};

function buildToleranceMap(foods) {
  const map = {};
  for (const group of Object.keys(FODMAP_GROUP_LABELS)) map[group] = { tolerated: [], doseLimited: [], notTolerated: [], inObservation: [] };
  for (const food of foods) {
    if (food.isArchived) continue;
    const status = food.tolerance?.status || 'UNTESTED';
    for (const g of food.primaryFodmapGroup || []) {
      if (!map[g]) continue;
      const entry = { name: food.name, maxPortion: food.tolerance?.maxToleratedPortion };
      if (status === 'FREELY_TOLERATED') map[g].tolerated.push(entry);
      else if (status === 'DOSE_LIMITED') map[g].doseLimited.push(entry);
      else if (status === 'NOT_TOLERATED') map[g].notTolerated.push(entry);
      else if (status === 'IN_OBSERVATION') map[g].inObservation.push(entry);
    }
  }
  return map;
}

async function gatherReportData(periodDays, options = {}) {
  const [profile, meals, symptoms, bristol, challenges, foods] = await Promise.all([
    getProfile(), getAllFromStore('meals'), getAllFromStore('symptoms'), getAllFromStore('bowel_events'),
    getAllFromStore('challenges'), getAllFromStore('foods'),
  ]);
  const periodMeals = filterByPeriod(meals, periodDays);
  const periodSymptoms = filterByPeriod(symptoms, periodDays);
  const periodBristol = filterByPeriod(bristol, periodDays);
  return {
    profile, periodDays,
    foodRecords: periodMeals.length,
    checkins: periodSymptoms.length,
    stats: computeReportStats(periodSymptoms, periodBristol, profile),
    toleranceMap: buildToleranceMap(foods),
    challenges: filterByPeriod(challenges, periodDays, 'startDate').filter((c) => c.state === 'FINALIZED' || c.state === 'COMPLETED_PENDING_REVIEW'),
    hideNotes: !!options.hidePersonalNotes,
  };
}

function badges(list, cls) {
  return list.length ? list.map((n) => `<span class="badge ${cls}">${esc(n)}</span>`).join(' ') : '<span class="badge badge-gray">-</span>';
}

function changeText(change) {
  if (change.difference == null) return 'Confronto non disponibile (baseline o dati mancanti).';
  const d = change.difference;
  const direction = d < 0 ? `inferiore di ${Math.abs(d).toFixed(1)} punti` : d > 0 ? `superiore di ${d.toFixed(1)} punti` : 'invariato';
  const pct = change.improvementPercent == null ? '' : ` (${change.improvementPercent > 0 ? 'riduzione' : 'aumento'} relativa del ${Math.abs(Math.round(change.improvementPercent))}%)`;
  return `Media del periodo ${direction} rispetto alla baseline${pct}. Descrittivo: il numero di check-in puo differire dal periodo basale.`;
}

function generateReportHTML(data) {
  const { profile, periodDays, stats, toleranceMap, challenges, hideNotes } = data;
  const periodLabel = periodDays > 0 ? `Ultimi ${periodDays} giorni` : 'Periodo completo';
  const today = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
  const days = stats.symptomDays;
  const maxBristol = Math.max(...stats.bristolDist, 1);
  const bristolColors = ['#991b1b', '#dc2626', '#f59e0b', '#10b981', '#3b82f6', '#f97316', '#ef4444'];

  const phase = PHASE_LABELS[profile.phase] || '-';
  const phaseStart = profile.phaseStartedAt ? `${fmtDate(profile.phaseStartedAt)}${profile.phaseStartEstimated ? ' (data approssimativa)' : ''}` : 'data non indicata';
  const phaseNote = !hideNotes && profile.phaseNote ? `<br>Nota: ${esc(profile.phaseNote)}` : '';

  const toleranceRows = Object.entries(toleranceMap).filter(([g]) => g !== 'LOW_FODMAP_SAFE').map(([group, info]) => `
      <tr>
        <td><strong>${esc(FODMAP_GROUP_LABELS[group] || group)}</strong></td>
        <td>${badges(info.tolerated.map((f) => f.name), 'badge-green')}</td>
        <td>${badges(info.doseLimited.map((f) => f.name + (f.maxPortion ? ` (fino a ${f.maxPortion.amount}${f.maxPortion.unit || ''})` : '')), 'badge-blue')}</td>
        <td>${badges(info.notTolerated.map((f) => f.name), 'badge-red')}</td>
        <td>${badges(info.inObservation.map((f) => f.name), 'badge-yellow')}</td>
      </tr>`).join('');

  const challengeHTML = challenges.length ? `
  <h2>Challenge completati nel periodo</h2>
  <ul class="challenge-list">${challenges.map((c) => `
    <li class="challenge-item"><span class="challenge-food">${esc(c.testFoodName || '-')}</span>
      <span class="badge ${String(c.outcome).includes('TOLERATED') ? 'badge-green' : String(c.outcome).includes('FAILED') ? 'badge-red' : 'badge-yellow'}">${esc(OUTCOME_LABELS[c.outcome] || c.outcome || '-')}</span>
      <div class="challenge-detail">Gruppo: ${esc(FODMAP_GROUP_LABELS[c.fodmapGroup] || c.fodmapGroup || '-')} - Inizio: ${esc(fmtDate(c.startDate))}</div></li>`).join('')}
  </ul>` : '';

  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"><title>Report Fudy</title>
<style>
@page { size: A4; margin: 15mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 11px; color: #1f2937; line-height: 1.5; }
.head { display: flex; justify-content: space-between; border-bottom: 3px solid #059669; padding-bottom: 12px; margin-bottom: 16px; }
.title { font-size: 22px; font-weight: 700; color: #059669; } .sub { font-size: 12px; color: #6b7280; } .meta { text-align: right; font-size: 10px; color: #6b7280; }
h2 { font-size: 14px; color: #059669; border-bottom: 1px solid #d1fae5; padding-bottom: 4px; margin: 16px 0 10px; text-transform: uppercase; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
.card { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px; text-align: center; }
.card .value { font-size: 22px; font-weight: 700; color: #059669; } .card .label { font-size: 9px; color: #6b7280; text-transform: uppercase; }
.box { background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 10px; margin-bottom: 8px; }
.note { font-size: 10px; color: #6b7280; }
table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 12px; }
th { background: #059669; color: #fff; padding: 6px 8px; text-align: left; } td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
.badge { display: inline-block; padding: 1px 6px; border-radius: 9999px; font-size: 9px; font-weight: 600; margin: 1px 2px; }
.badge-green { background: #d1fae5; color: #065f46; } .badge-blue { background: #dbeafe; color: #1e40af; } .badge-red { background: #fee2e2; color: #991b1b; } .badge-yellow { background: #fef3c7; color: #92400e; } .badge-gray { background: #f3f4f6; color: #6b7280; }
.bristol { display: flex; align-items: flex-end; gap: 6px; height: 80px; margin: 8px 0 12px; }
.bcol { flex: 1; display: flex; flex-direction: column; align-items: center; } .bar { width: 100%; max-width: 40px; border-radius: 4px 4px 0 0; }
.challenge-list { list-style: none; } .challenge-item { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; }
.disclaimer { margin-top: 20px; padding: 10px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 9px; color: #6b7280; text-align: center; }
.pb { page-break-before: always; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="head"><div><div class="title">Report Fudy</div><div class="sub">${esc(periodLabel)} - generato il ${esc(today)}</div></div>
<div class="meta">Fase: <strong>${esc(phase)}</strong><br>Inizio fase: ${esc(phaseStart)}${phaseNote}<br>Obiettivi: ${esc((profile.goals || []).join(', ') || '-')}</div></div>

<div class="grid">
  <div class="card"><div class="value">${data.foodRecords}</div><div class="label">Registrazioni alimentari (tap)</div></div>
  <div class="card"><div class="value">${data.checkins}</div><div class="label">Check-in sintomi</div></div>
  <div class="card"><div class="value">${stats.totalBristol}</div><div class="label">Registrazioni Bristol</div></div>
  <div class="card"><div class="value">${days.recordedDays}</div><div class="label">Giorni con check-in</div></div>
</div>

<h2>Sintomi nel periodo</h2>
<div class="box">Giorni con almeno un valore sopra 2/10: <strong>${days.elevatedDays}</strong> - giorni con valori completi entro 2/10: <strong>${days.lowSymptomDays}</strong> - giorni non valutabili (valori incompleti): <strong>${days.unknownDays}</strong>.
<div class="note">Entro 2/10 non significa assenza di sintomi. I giorni senza check-in non sono conteggiati.</div></div>
<div class="grid" style="grid-template-columns: repeat(4, 1fr);">
  <div class="card"><div class="value">${fmt1(stats.avgPain)}</div><div class="label">Dolore addominale medio /10</div></div>
  <div class="card"><div class="value">${fmt1(stats.avgBloat)}</div><div class="label">Gonfiore medio /10</div></div>
  <div class="card"><div class="value">${fmt1(stats.avgPelvic)}</div><div class="label">Dolore pelvico medio /10</div></div>
  <div class="card"><div class="value">${stats.endoBellyCount}/${stats.dyscheziaCount}</div><div class="label">Endo-belly / dischezia (check-in)</div></div>
</div>

<h2>Confronto con la baseline</h2>
<div class="box"><strong>Dolore addominale</strong> - baseline ${profile.baseline?.pain ?? 'n.d.'}/10 - periodo ${fmt1(stats.avgPain)}/10<div class="note">${esc(changeText(stats.painChange))}</div></div>
<div class="box"><strong>Gonfiore</strong> - baseline ${profile.baseline?.bloat ?? 'n.d.'}/10 - periodo ${fmt1(stats.avgBloat)}/10<div class="note">${esc(changeText(stats.bloatChange))}</div></div>

<h2>Distribuzione alvo (Bristol)</h2>
<div class="bristol">${stats.bristolDist.map((count, i) => `<div class="bcol"><div style="font-size:9px;font-weight:700">${count}</div><div class="bar" style="height:${Math.max(4, (count / maxBristol) * 60)}px;background:${bristolColors[i]}"></div><div style="font-size:9px;color:#6b7280">Tipo ${i + 1}</div></div>`).join('')}</div>

<div class="pb"></div>
<h2>Tolleranze registrate per gruppo FODMAP</h2>
<table><thead><tr><th>Gruppo</th><th>Tollerato</th><th>Dose-limitato</th><th>Non tollerato</th><th>In osservazione</th></tr></thead><tbody>${toleranceRows}</tbody></table>
${challengeHTML}

<div class="disclaimer"><strong>Nota:</strong> report generato in locale da Fudy per supportare il colloquio con il professionista sanitario. Dati auto-riferiti, non diagnostici. Le registrazioni alimentari sono occorrenze senza quantita.</div>
</body></html>`;
}

export async function generatePDFReport(periodDays = 30, options = {}) {
  const html = generateReportHTML(await gatherReportData(periodDays, options));
  const printWindow = window.open('', '_blank', 'width=800,height=1100');
  if (!printWindow) { downloadReportAsHTML(html); return; }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => setTimeout(() => printWindow.print(), 300);
}

function downloadReportAsHTML(html) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `Report_Fudy_${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
}

export async function getReportHTML(periodDays = 30, options = {}) {
  return generateReportHTML(await gatherReportData(periodDays, options));
}
