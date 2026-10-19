import { analyzeAssociations, analyzeMultifactorial } from '../../domain/insights/observedAssociations.js';
import { exportAllCSV, exportMealsCSV, exportSymptomsCSV, exportBristolCSV, exportChallengesCSV, downloadCSV } from '../../infrastructure/export/csvExporter.js';
import { generatePDFReport, getReportHTML } from '../../infrastructure/export/pdfExporter.js';

export async function render(root) {
  root.innerHTML = `<section class="max-w-2xl mx-auto p-4 pb-24 space-y-4"><h2>Progressi e report</h2><label>Periodo <select id="period"><option value="14">14 giorni</option><option value="30" selected>30 giorni</option><option value="60">60 giorni</option><option value="0">Tutto</option></select></label><label>Gruppo FODMAP <select id="group"></select></label><div id="exports"></div><label><input id="hide" type="checkbox"> Nascondi note nel PDF</label><p>Associazioni temporali, non diagnosi. Un follow-up mancante non equivale ad assenza di sintomi. Finestre sovrapposte e confondenti non compilati restano limiti del calcolo. PDF non ancora allineato alle nuove regole.</p><div id="preview"></div><div id="results" aria-live="polite"></div></section>`;
  const el = id => root.querySelector('#' + id);
  const groups = ['', 'FRUCTANS_GRAIN', 'FRUCTANS_VEG_GARLIC', 'GOS', 'LACTOSE', 'EXCESS_FRUCTOSE', 'SORBITOL', 'MANNITOL', 'LOW_FODMAP_SAFE'];
  for (const id of groups) { const o = document.createElement('option'); o.value = id; o.textContent = id || 'Tutti'; el('group').appendChild(o); }
  const days = () => Number(el('period').value);
  const options = () => ({ hidePersonalNotes: el('hide').checked });
  const actions = [['CSV consumi', exportMealsCSV], ['CSV sintomi', exportSymptomsCSV], ['CSV Bristol', exportBristolCSV], ['CSV challenge', exportChallengesCSV]];
  const addButton = (label, action) => {
    const b = document.createElement('button'); b.textContent = label; b.className = 'border rounded p-2 m-1';
    b.onclick = async () => { b.disabled = true; try { await action(); } catch (e) { alert(e.message); } finally { b.disabled = false; } };
    el('exports').appendChild(b);
  };
  for (const [label, action] of actions) addButton(label, async () => downloadCSV(await action(days()), label.replaceAll(' ', '_') + '.csv'));
  addButton('Tutti i CSV', () => exportAllCSV(days()));
  addButton('PDF', () => generatePDFReport(days(), options()));
  addButton('Anteprima PDF', async () => { const frame = document.createElement('iframe'); frame.title = 'Report'; frame.setAttribute('sandbox', ''); frame.className = 'w-full h-96'; frame.srcdoc = await getReportHTML(days(), options()); el('preview').replaceChildren(frame); });
  const text = (parent, value) => { const p = document.createElement('p'); p.textContent = value; parent.appendChild(p); };
  const pct = v => v == null ? 'non valutabile' : Math.round(v * 100) + '%';
  const score = v => v == null ? 'non disponibile' : v.toFixed(1) + '/10';
  let request = 0;
  async function load() {
    const token = ++request;
    const target = el('results'); target.textContent = 'Analisi in corso...';
    try {
      const settings = { periodDays: days(), fodmapGroupFilter: el('group').value || null };
      const [foods, combinations] = await Promise.all([analyzeAssociations(settings), analyzeMultifactorial(settings)]);
      if (token !== request || !root.contains(target)) return;
      target.replaceChildren();
      if (!foods.length) text(target, 'Nessun consumo nel periodo e filtro scelti.');
      for (const f of foods) {
        const card = document.createElement('details'); card.className = 'border rounded p-3 my-3';
        const title = document.createElement('summary'); title.textContent = `${f.foodName}: ${f.symptomOccurrences}/${f.observedOccurrences} osservati con sintomi`; card.appendChild(title);
        text(card, `Totali: ${f.totalOccurrences}; osservati: ${f.observedOccurrences}; non valutabili: ${f.unknownOccurrences}. Frequenza ponderata: ${pct(f.correlationScore)}.`);
        text(card, `Dolore medio dopo consumo: ${score(f.avgPainWhenConsumed)}; gonfiore: ${score(f.avgBloatWhenConsumed)}. Media globale del periodo, non baseline pre-dieta: ${score(f.avgPainBaseline)} e ${score(f.avgBloatBaseline)}.`);
        text(card, `Osservati senza fattori segnalati: ${f.cleanOccurrences}; con fattori: ${f.confoundedOccurrences}. Intervallo della frequenza grezza, non del punteggio ponderato: ${pct(f.confidenceLower)} - ${pct(f.confidenceUpper)}. Non corretto per dipendenza tra episodi.`);
        for (const e of f.episodes) text(card, `${new Date(e.mealTimestamp).toLocaleString('it-IT')}: ${e.observationStatus}; ${(e.confounders || []).join(', ')}`);
        target.appendChild(card);
      }
      for (const c of combinations) {
        if (settings.fodmapGroupFilter && !c.fodmapCombination.includes(settings.fodmapGroupFilter)) continue;
        text(target, `Gruppi nello stesso record, non interazione dimostrata: ${c.combinationLabel}; ${c.mealsWithSymptoms}/${c.observedMeals} osservati con sintomi; ${c.unknownMeals} non valutabili.`);
      }
    } catch (e) { if (token === request) target.textContent = 'Analisi non riuscita: ' + e.message; }
  }
  el('period').onchange = load; el('group').onchange = load; await load();
}
