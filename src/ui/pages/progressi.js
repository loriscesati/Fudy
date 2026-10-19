import { loadInsights } from '../../domain/insights/observedAssociations.js';
import { EVIDENCE_LABELS } from '../../domain/insights/associationCore.js';
import { exportAllCSV, exportMealsCSV, exportSymptomsCSV, exportBristolCSV, exportChallengesCSV, downloadCSV } from '../../infrastructure/export/csvExporter.js';
import { generatePDFReport, getReportHTML } from '../../infrastructure/export/pdfExporter.js';

const GROUPS = { '': 'Tutti', FRUCTANS_GRAIN: 'Fruttani (cereali)', FRUCTANS_VEG_GARLIC: 'Fruttani (aglio/cipolla)', GOS: 'GOS', LACTOSE: 'Lattosio', EXCESS_FRUCTOSE: 'Fruttosio in eccesso', SORBITOL: 'Sorbitolo', MANNITOL: 'Mannitolo', LOW_FODMAP_SAFE: 'Basso FODMAP' };
const PHASES = { PREPARATION: 'Preparazione', REDUCTION: 'Riduzione', REINTRODUCTION: 'Reintroduzione', PERSONALIZATION: 'Personalizzazione' };
const STATUS = { ELEVATED: 'sintomi elevati registrati', OBSERVED_NOT_ELEVATED: 'check-in senza valori elevati', PENDING: 'finestra ancora aperta', UNKNOWN: 'nessun check-in utile' };
const pct = v => v == null ? 'n.d.' : Math.round(v * 100) + '%';
const num = v => v == null ? 'n.d.' : v.toFixed(1);
const when = ts => new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function table(headers, rows) {
  const t = el('table', null, 'w-full text-xs border-collapse');
  const head = t.createTHead().insertRow();
  for (const h of headers) head.appendChild(el('th', h, 'text-left border-b p-1'));
  const body = t.createTBody();
  for (const row of rows) { const tr = body.insertRow(); for (const cell of row) tr.appendChild(el('td', cell, 'border-b p-1')); }
  return t;
}
function section(title, ...children) {
  const s = el('section', null, 'border rounded-xl p-3 bg-white space-y-2');
  s.appendChild(el('h3', title, 'font-bold text-sm'));
  for (const c of children) s.appendChild(typeof c === 'string' ? el('p', c, 'text-xs') : c);
  return s;
}

export async function render(root) {
  root.replaceChildren();
  const page = el('div', null, 'max-w-2xl mx-auto p-4 pb-24 space-y-4');
  page.appendChild(el('h2', 'Progressi e report', 'text-xl font-bold text-emerald-700'));
  const controls = el('div', null, 'space-y-2');
  const period = el('select'); for (const [v, l] of [[14, '14 giorni'], [30, '30 giorni'], [60, '60 giorni'], [0, 'Tutto']]) { const o = el('option', l); o.value = v; period.appendChild(o); }
  period.value = '30';
  const group = el('select'); for (const [v, l] of Object.entries(GROUPS)) { const o = el('option', l); o.value = v; group.appendChild(o); }
  const hide = el('input'); hide.type = 'checkbox';
  const labelOf = (text, input) => { const l = el('label', text + ' '); l.appendChild(input); l.className = 'block text-sm'; return l; };
  controls.append(labelOf('Periodo', period), labelOf('Gruppo FODMAP', group), labelOf('Nascondi note nel PDF', hide));
  const exportsBox = el('div'); const preview = el('div'); const results = el('div', null, 'space-y-3'); results.setAttribute('aria-live', 'polite');
  page.append(controls, exportsBox, preview, el('p', 'Associazioni temporali osservate nei tuoi dati, non diagnosi: un follow-up mancante non equivale ad assenza di sintomi e piu alimenti nella stessa occasione non sono separabili.', 'text-xs text-gray-600'), results);
  root.appendChild(page);

  const days = () => Number(period.value);
  const pdfOptions = () => ({ hidePersonalNotes: hide.checked });
  const addButton = (label, action) => {
    const b = el('button', label, 'border rounded p-2 m-1 text-xs');
    b.onclick = async () => { b.disabled = true; try { await action(); } catch (e) { alert('Operazione non riuscita: ' + e.message); } finally { b.disabled = false; } };
    exportsBox.appendChild(b);
  };
  for (const [label, fn] of [['CSV consumi', exportMealsCSV], ['CSV sintomi', exportSymptomsCSV], ['CSV Bristol', exportBristolCSV], ['CSV challenge', exportChallengesCSV]]) addButton(label, async () => downloadCSV(await fn(days()), label.replaceAll(' ', '_') + '.csv'));
  addButton('Tutti i CSV', () => exportAllCSV(days()));
  addButton('PDF', () => generatePDFReport(days(), pdfOptions()));
  addButton('Anteprima PDF', async () => { const frame = el('iframe'); frame.title = 'Report'; frame.setAttribute('sandbox', ''); frame.className = 'w-full h-96'; frame.srcdoc = await getReportHTML(days(), pdfOptions()); preview.replaceChildren(frame); });

  let request = 0;
  async function load() {
    const token = ++request;
    results.textContent = 'Analisi in corso...';
    try {
      const data = await loadInsights({ periodDays: days(), fodmapGroupFilter: group.value || null });
      if (token !== request || !root.contains(results)) return;
      results.replaceChildren();
      const { coverage: cov, overview: ov } = data;
      results.appendChild(section('Qualita dei dati',
        `Periodo: ${cov.periodDays} giorni. Giorni con registrazioni alimentari: ${cov.foodDays}; con check-in: ${cov.checkinDays}; con entrambi: ${cov.bothDays}.`,
        `Occasioni alimentari: ${ov.total}. Con follow-up utile: ${ov.observed}; finestra ancora aperta: ${ov.pending}; senza check-in utile: ${ov.unknown}. Un'occasione raggruppa i tap della stessa sezione distanti meno di 90 minuti.`));
      results.appendChild(section('Andamento settimanale',
        data.weekly.length ? table(['Settimana dal', 'Check-in', 'Dolore', 'Gonfiore', 'Pelvico', 'Giorni > 2/10', 'Non valutabili'], data.weekly.map(w => [w.weekStartDate, w.checkins, num(w.meanPain), num(w.meanBloat), num(w.meanPelvic), w.days.elevatedDays, w.days.unknownDays])) : 'Nessun check-in nel periodo.'));
      results.appendChild(section('Fasi del percorso',
        data.phases.length ? table(['Fase', 'Dal', 'Check-in', 'Dolore', 'Gonfiore', 'Giorni > 2/10'], data.phases.map(p => [PHASES[p.phase] || p.phase, new Date(p.startMs).toLocaleDateString('it-IT'), p.checkins, num(p.meanPain), num(p.meanBloat), p.days.elevatedDays])) : 'Inserisci nel profilo la data di inizio della fase per confrontare i periodi. Le date sono quelle indicate da te.',
        data.profile?.baseline?.pain != null || data.profile?.baseline?.bloat != null ? `Baseline dichiarata: dolore ${data.profile.baseline.pain ?? 'n.d.'}/10, gonfiore ${data.profile.baseline.bloat ?? 'n.d.'}/10.` : 'Baseline non indicata.'));

      const list = el('div', null, 'space-y-2');
      if (!data.associations.length) list.appendChild(el('p', 'Nessuna occasione alimentare nel periodo e nel filtro scelti.', 'text-xs'));
      for (const f of data.associations) {
        const card = el('details', null, 'border rounded p-2');
        const ev = EVIDENCE_LABELS[f.evidence];
        card.appendChild(el('summary', `${f.foodName}: ${f.elevatedDays}/${f.observedDays} giorni osservati con sintomi - ${ev.label}`, 'text-sm font-semibold'));
        card.append(
          el('p', `Occasioni: ${f.totalOccasions} (tap ${f.totalTaps}). Con follow-up utile ${f.observedOccasions}, finestra aperta ${f.pendingOccasions}, senza check-in ${f.unknownOccasions}.`, 'text-xs'),
          el('p', `Mangiato da solo in ${f.separableOccasions} occasioni; con finestra condivisa da altre occasioni in ${f.sharedWindowOccasions}. Gli altri casi non permettono di separare l'alimento.`, 'text-xs'),
          el('p', `Intervallo descrittivo sui giorni osservati: ${pct(f.confidenceLower)} - ${pct(f.confidenceUpper)}. Non e una probabilita causale.`, 'text-xs'),
          el('p', `Dolore medio dopo: ${num(f.avgPainAfter)}; gonfiore: ${num(f.avgBloatAfter)}. Media del periodo (non baseline): ${num(f.avgPainPeriod)} e ${num(f.avgBloatPeriod)}.`, 'text-xs'),
          el('p', `Fattori del giorno - non compilati: ${f.strata.NOT_FILLED.elevated}/${f.strata.NOT_FILLED.observed}; compilati senza fattori: ${f.strata.NONE_DECLARED.elevated}/${f.strata.NONE_DECLARED.observed}; con fattori: ${f.strata.DECLARED.elevated}/${f.strata.DECLARED.observed} (occasioni con sintomi su osservate).`, 'text-xs'));
        if (f.challenge) card.appendChild(el('p', `Ultimo challenge concluso: ${f.challenge.outcome || 'esito non indicato'} (${f.challenge.startDate || 'data non indicata'}). Valutazione separata dalle osservazioni.`, 'text-xs'));
        for (const e of f.episodes) card.appendChild(el('p', `${when(e.timestamp)}: ${STATUS[e.status]}${e.coFoods.length ? '; con ' + e.coFoods.join(', ') : ''}${e.dayFactors.factors.length ? '; ' + e.dayFactors.factors.join(', ') : ''}`, 'text-xs text-gray-600'));
        list.appendChild(card);
      }
      results.appendChild(section('Associazioni da approfondire', list));
      results.appendChild(section('Gruppi FODMAP nella stessa occasione',
        data.combinations.length ? table(['Gruppi', 'Occasioni', 'Con follow-up', 'Con sintomi', 'Aperte', 'Senza check-in'], data.combinations.map(c => [c.groups.map(g => GROUPS[g] || g).join(' + '), c.total, c.observed, c.elevated, c.pending, c.unknown])) : 'Nessuna combinazione ripetuta nel periodo. Una co-occorrenza non dimostra un\'interazione.'));
    } catch (e) { if (token === request) results.textContent = 'Analisi non riuscita: ' + e.message; }
  }
  period.onchange = load; group.onchange = load;
  await load();
}
