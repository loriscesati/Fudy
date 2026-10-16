/**
 * src/ui/pages/progressi.js
 *
 * Pagina "Progressi & Report" — sezione della bottom navigation.
 * Integra la reportistica (CSV/PDF) e la visualizzazione delle
 * associazioni probabilistiche alimento-sintomo.
 *
 * Esportata come modulo con `render(rootElement)` per il router.
 */

import { exportAllCSV, exportMealsCSV, exportSymptomsCSV, exportBristolCSV, exportChallengesCSV, downloadCSV } from '../../infrastructure/export/csvExporter.js';
import { generatePDFReport, getReportHTML } from '../../infrastructure/export/pdfExporter.js';
import { analyzeAssociations, analyzeMultifactorial, EVIDENCE_LABELS } from '../../domain/insights/associationEngine.js';

// ── Costanti UI ───────────────────────────────────────────────────────────────

const FODMAP_GROUP_LABELS = {
  FRUCTANS_GRAIN: 'Fruttani (Cereali)',
  FRUCTANS_VEG_GARLIC: 'Fruttani (Aglio/Cipolla)',
  GOS: 'Galatto-oligosaccaridi (GOS)',
  LACTOSE: 'Lattosio',
  EXCESS_FRUCTOSE: 'Fruttosio in eccesso',
  SORBITOL: 'Sorbitolo',
  MANNITOL: 'Mannitolo',
};

const PERIOD_OPTIONS = [
  { value: 14, label: 'Ultimi 14 giorni' },
  { value: 30, label: 'Ultimi 30 giorni' },
  { value: 60, label: 'Ultimi 60 giorni' },
  { value: 0, label: 'Periodo completo' },
];

// ── CSS inline per la pagina ──────────────────────────────────────────────────

const PAGE_STYLES = `
  .progressi-page {
    max-width: 640px;
    margin: 0 auto;
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }

  .progressi-page h1 {
    font-size: 1.5rem;
    font-weight: 700;
    color: #059669;
    margin-bottom: 4px;
  }

  .progressi-page .subtitle {
    font-size: 0.8rem;
    color: #6b7280;
    margin-bottom: 20px;
  }

  /* Tab navigation */
  .tab-nav {
    display: flex;
    gap: 0;
    background: #f3f4f6;
    border-radius: 12px;
    padding: 4px;
    margin-bottom: 20px;
  }
  .tab-btn {
    flex: 1;
    padding: 10px 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #6b7280;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .tab-btn.active {
    background: white;
    color: #059669;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  /* Period selector */
  .period-selector {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .period-btn {
    padding: 6px 14px;
    border: 1px solid #d1d5db;
    border-radius: 20px;
    background: white;
    color: #374151;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  .period-btn.active {
    background: #059669;
    color: white;
    border-color: #059669;
  }

  /* Section cards */
  .section-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    padding: 16px;
    margin-bottom: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .section-card h2 {
    font-size: 0.95rem;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Export buttons */
  .export-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 12px;
  }
  .export-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 14px 10px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #f9fafb;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
  }
  .export-btn:hover {
    background: #f0fdf4;
    border-color: #86efac;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(5,150,105,0.1);
  }
  .export-btn:active { transform: scale(0.97); }
  .export-btn .icon { font-size: 1.5rem; }
  .export-btn .label { font-size: 0.7rem; color: #6b7280; font-weight: 400; }

  .export-btn-full {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    border: 2px solid #059669;
    border-radius: 12px;
    background: #ecfdf5;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 700;
    color: #059669;
    transition: all 0.2s;
    width: 100%;
  }
  .export-btn-full:hover {
    background: #059669;
    color: white;
  }

  /* Association cards */
  .association-card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 12px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .association-card:hover {
    border-color: #d1d5db;
    box-shadow: 0 2px 6px rgba(0,0,0,0.06);
  }
  .association-card.expanded {
    background: white;
    border-color: #f59e0b;
  }

  .assoc-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .assoc-food-name {
    font-weight: 700;
    font-size: 0.9rem;
    color: #1f2937;
  }
  .assoc-score {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 12px;
  }

  .assoc-stats {
    display: flex;
    gap: 12px;
    font-size: 0.7rem;
    color: #6b7280;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }
  .assoc-stats span { white-space: nowrap; }

  .evidence-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 8px;
    background: #f3f4f6;
  }

  .confidence-bar {
    height: 6px;
    background: #e5e7eb;
    border-radius: 3px;
    margin-top: 8px;
    position: relative;
    overflow: hidden;
  }
  .confidence-fill {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: 3px;
    opacity: 0.7;
  }

  /* Episode detail */
  .episodes-list {
    margin-top: 10px;
    border-top: 1px solid #e5e7eb;
    padding-top: 10px;
  }
  .episode-item {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 6px;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px dashed #f3f4f6;
    font-size: 0.7rem;
  }
  .episode-date { color: #9ca3af; font-weight: 500; }
  .episode-meal { color: #374151; }
  .episode-symptom { font-weight: 700; }
  .episode-symptom.elevated { color: #ef4444; }
  .episode-symptom.normal { color: #10b981; }

  .confounder-tag {
    display: inline-block;
    font-size: 0.6rem;
    padding: 1px 6px;
    border-radius: 6px;
    background: #fef3c7;
    color: #92400e;
    margin: 1px;
  }

  /* Combo analysis */
  .combo-card {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }
  .combo-label { font-weight: 700; font-size: 0.8rem; color: #92400e; }
  .combo-stats { font-size: 0.7rem; color: #78716c; margin-top: 4px; }

  /* Loading / Empty */
  .loading-spinner {
    text-align: center;
    padding: 40px;
    color: #9ca3af;
    font-size: 0.85rem;
  }
  .empty-state {
    text-align: center;
    padding: 32px 16px;
    color: #9ca3af;
  }
  .empty-state .icon { font-size: 2.5rem; margin-bottom: 8px; }
  .empty-state .message { font-size: 0.85rem; line-height: 1.5; }

  /* FODMAP filter */
  .fodmap-filter {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .fodmap-filter-btn {
    padding: 4px 10px;
    border: 1px solid #d1d5db;
    border-radius: 14px;
    background: white;
    color: #6b7280;
    font-size: 0.65rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .fodmap-filter-btn.active {
    background: #f59e0b;
    color: white;
    border-color: #f59e0b;
  }

  /* Preview */
  .pdf-preview-frame {
    width: 100%;
    min-height: 400px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
    margin-top: 12px;
  }
  .pdf-preview-frame iframe {
    width: 100%;
    height: 500px;
    border: none;
  }

  .hide-notes-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    color: #6b7280;
    margin-bottom: 12px;
  }
`;

// ── Componente principale ─────────────────────────────────────────────────────

export async function render(root) {
  root.innerHTML = '';

  // Inietta stili
  const style = document.createElement('style');
  style.textContent = PAGE_STYLES;
  root.appendChild(style);

  const page = document.createElement('div');
  page.className = 'progressi-page';

  // Header
  page.innerHTML = `
    <h1>📊 Progressi & Report</h1>
    <p class="subtitle">Esporta i dati per il tuo professionista o esplora le associazioni alimento-sintomo</p>
  `;

  // Tab navigation
  const tabNav = document.createElement('div');
  tabNav.className = 'tab-nav';
  tabNav.innerHTML = `
    <button class="tab-btn active" data-tab="export">📤 Esporta</button>
    <button class="tab-btn" data-tab="analysis">🔬 Analisi</button>
  `;
  page.appendChild(tabNav);

  // Tab content container
  const tabContent = document.createElement('div');
  tabContent.id = 'tab-content';
  page.appendChild(tabContent);

  root.appendChild(page);

  // State
  let activeTab = 'export';
  let selectedPeriod = 30;
  let selectedFodmapFilter = null;

  // Tab switching
  tabNav.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tab = btn.dataset.tab;
    if (tab === activeTab) return;
    activeTab = tab;
    tabNav.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    renderTabContent();
  });

  // Period selector builder
  function buildPeriodSelector(onChange) {
    const container = document.createElement('div');
    container.className = 'period-selector';
    for (const opt of PERIOD_OPTIONS) {
      const btn = document.createElement('button');
      btn.className = `period-btn${opt.value === selectedPeriod ? ' active' : ''}`;
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        selectedPeriod = opt.value;
        container.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        if (onChange) onChange(selectedPeriod);
      });
      container.appendChild(btn);
    }
    return container;
  }

  // ── Tab: Export ──────────────────────────────────────────────────────────────

  function renderExportTab() {
    const container = document.createElement('div');

    // Period selector
    container.appendChild(buildPeriodSelector());

    // CSV Section
    const csvSection = document.createElement('div');
    csvSection.className = 'section-card';
    csvSection.innerHTML = `<h2>📄 Esportazione CSV</h2>`;

    const csvGrid = document.createElement('div');
    csvGrid.className = 'export-grid';

    const csvButtons = [
      { icon: '🍽️', label: 'Pasti', sublabel: 'Con ingredienti e porzioni', action: 'meals' },
      { icon: '⚡', label: 'Sintomi', sublabel: 'Check-in con intensità', action: 'symptoms' },
      { icon: '🚽', label: 'Bristol', sublabel: 'Registro evacuazioni', action: 'bristol' },
      { icon: '🧪', label: 'Challenge', sublabel: 'Reintroduzioni e esiti', action: 'challenges' },
    ];

    for (const btn of csvButtons) {
      const el = document.createElement('button');
      el.className = 'export-btn';
      el.innerHTML = `
        <span class="icon">${btn.icon}</span>
        <span>${btn.label}</span>
        <span class="label">${btn.sublabel}</span>
      `;
      el.addEventListener('click', () => handleCSVExport(btn.action));
      csvGrid.appendChild(el);
    }
    csvSection.appendChild(csvGrid);

    // Esporta tutti
    const allBtn = document.createElement('button');
    allBtn.className = 'export-btn-full';
    allBtn.innerHTML = '📦 Esporta tutti i CSV';
    allBtn.addEventListener('click', () => handleCSVExport('all'));
    csvSection.appendChild(allBtn);

    container.appendChild(csvSection);

    // PDF Section
    const pdfSection = document.createElement('div');
    pdfSection.className = 'section-card';

    const hideNotesToggle = document.createElement('label');
    hideNotesToggle.className = 'hide-notes-toggle';
    hideNotesToggle.innerHTML = `
      <input type="checkbox" id="hide-notes-check">
      <span>🔒 Nascondi note personali nel report</span>
    `;

    pdfSection.innerHTML = `<h2>📊 Report PDF per il Professionista</h2>`;
    pdfSection.appendChild(hideNotesToggle);

    const pdfBtnRow = document.createElement('div');
    pdfBtnRow.style.cssText = 'display: flex; gap: 8px;';

    const previewBtn = document.createElement('button');
    previewBtn.className = 'export-btn-full';
    previewBtn.style.cssText = 'flex: 1; background: white; color: #059669; border: 2px solid #059669;';
    previewBtn.innerHTML = '👁️ Anteprima';
    previewBtn.addEventListener('click', () => handlePDFPreview(pdfSection));

    const printBtn = document.createElement('button');
    printBtn.className = 'export-btn-full';
    printBtn.style.cssText = 'flex: 1;';
    printBtn.innerHTML = '🖨️ Genera PDF';
    printBtn.addEventListener('click', () => handlePDFGenerate());

    pdfBtnRow.appendChild(previewBtn);
    pdfBtnRow.appendChild(printBtn);
    pdfSection.appendChild(pdfBtnRow);

    container.appendChild(pdfSection);

    return container;
  }

  async function handleCSVExport(type) {
    try {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const suffix = selectedPeriod > 0 ? `_${selectedPeriod}gg` : '_completo';

      switch (type) {
        case 'meals':
          downloadCSV(await exportMealsCSV(selectedPeriod), `FODMAP_Pasti${suffix}_${dateStr}.csv`);
          break;
        case 'symptoms':
          downloadCSV(await exportSymptomsCSV(selectedPeriod), `FODMAP_Sintomi${suffix}_${dateStr}.csv`);
          break;
        case 'bristol':
          downloadCSV(await exportBristolCSV(selectedPeriod), `FODMAP_Bristol${suffix}_${dateStr}.csv`);
          break;
        case 'challenges':
          downloadCSV(await exportChallengesCSV(selectedPeriod), `FODMAP_Challenge${suffix}_${dateStr}.csv`);
          break;
        case 'all':
          await exportAllCSV(selectedPeriod);
          break;
      }
    } catch (err) {
      console.error('Errore durante l\'esportazione CSV:', err);
      alert('Errore durante l\'esportazione. Verifica che ci siano dati registrati.');
    }
  }

  async function handlePDFPreview(container) {
    // Rimuovi eventuale anteprima precedente
    const existingPreview = container.querySelector('.pdf-preview-frame');
    if (existingPreview) {
      existingPreview.remove();
      return;
    }

    const hideNotes = document.getElementById('hide-notes-check')?.checked || false;

    try {
      const html = await getReportHTML(selectedPeriod, { hidePersonalNotes: hideNotes });

      const previewFrame = document.createElement('div');
      previewFrame.className = 'pdf-preview-frame';

      const iframe = document.createElement('iframe');
      iframe.sandbox = 'allow-same-origin';
      previewFrame.appendChild(iframe);
      container.appendChild(previewFrame);

      // Scrivi l'HTML nell'iframe
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
    } catch (err) {
      console.error('Errore anteprima PDF:', err);
      alert('Errore nella generazione dell\'anteprima.');
    }
  }

  async function handlePDFGenerate() {
    const hideNotes = document.getElementById('hide-notes-check')?.checked || false;
    try {
      await generatePDFReport(selectedPeriod, { hidePersonalNotes: hideNotes });
    } catch (err) {
      console.error('Errore generazione PDF:', err);
      alert('Errore nella generazione del PDF. Prova a consentire i popup del browser.');
    }
  }

  // ── Tab: Analysis ───────────────────────────────────────────────────────────

  function renderAnalysisTab() {
    const container = document.createElement('div');

    // Period selector
    container.appendChild(buildPeriodSelector(() => loadAnalysis(container)));

    // FODMAP filter
    const filterContainer = document.createElement('div');
    filterContainer.className = 'fodmap-filter';

    const allFilterBtn = document.createElement('button');
    allFilterBtn.className = `fodmap-filter-btn${!selectedFodmapFilter ? ' active' : ''}`;
    allFilterBtn.textContent = 'Tutti';
    allFilterBtn.addEventListener('click', () => {
      selectedFodmapFilter = null;
      filterContainer.querySelectorAll('.fodmap-filter-btn').forEach((b) => b.classList.remove('active'));
      allFilterBtn.classList.add('active');
      loadAnalysis(container);
    });
    filterContainer.appendChild(allFilterBtn);

    for (const [key, label] of Object.entries(FODMAP_GROUP_LABELS)) {
      const btn = document.createElement('button');
      btn.className = `fodmap-filter-btn${selectedFodmapFilter === key ? ' active' : ''}`;
      btn.textContent = label.replace(/\(.*\)/, '').trim();
      btn.addEventListener('click', () => {
        selectedFodmapFilter = key;
        filterContainer.querySelectorAll('.fodmap-filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        loadAnalysis(container);
      });
      filterContainer.appendChild(btn);
    }
    container.appendChild(filterContainer);

    // Results container
    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'analysis-results';
    container.appendChild(resultsContainer);

    // Load data
    loadAnalysis(container);

    return container;
  }

  async function loadAnalysis(parentContainer) {
    const results = parentContainer.querySelector('#analysis-results') || parentContainer;
    // Trova o create the results div
    let resultsDiv = parentContainer.querySelector('#analysis-results');
    if (!resultsDiv) {
      resultsDiv = document.createElement('div');
      resultsDiv.id = 'analysis-results';
      parentContainer.appendChild(resultsDiv);
    }

    resultsDiv.innerHTML = '<div class="loading-spinner">⏳ Analisi in corso...</div>';

    try {
      const [associations, combos] = await Promise.all([
        analyzeAssociations({
          periodDays: selectedPeriod,
          fodmapGroupFilter: selectedFodmapFilter,
        }),
        analyzeMultifactorial({ periodDays: selectedPeriod }),
      ]);

      resultsDiv.innerHTML = '';

      // Disclaimer
      const disclaimer = document.createElement('div');
      disclaimer.className = 'section-card';
      disclaimer.style.cssText = 'background: #fffbeb; border-color: #fde68a; font-size: 0.72rem; color: #92400e; line-height: 1.5;';
      disclaimer.innerHTML = `
        <strong>⚠️ Nota importante:</strong> Le associazioni mostrate sono <strong>osservazioni statistiche</strong>,
        non diagnosi. La correlazione temporale tra un alimento e un sintomo non implica causalità.
        Fattori come stress, ciclo mestruale, farmaci e sonno possono influenzare significativamente i sintomi.
        Discuti sempre i risultati con il tuo dietista o gastroenterologo.
      `;
      resultsDiv.appendChild(disclaimer);

      // Associazioni per singolo alimento
      if (associations.length > 0) {
        const section = document.createElement('div');
        section.className = 'section-card';
        section.innerHTML = `<h2>🔬 Sospetti Principali (per Alimento)</h2>`;

        for (const assoc of associations.slice(0, 20)) {
          section.appendChild(buildAssociationCard(assoc));
        }

        if (associations.length > 20) {
          const more = document.createElement('p');
          more.style.cssText = 'text-align: center; font-size: 0.75rem; color: #9ca3af; margin-top: 8px;';
          more.textContent = `... e altri ${associations.length - 20} alimenti analizzati`;
          section.appendChild(more);
        }

        resultsDiv.appendChild(section);
      } else {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `
          <div class="icon">📭</div>
          <div class="message">
            Nessun dato sufficiente per generare associazioni.<br>
            Registra pasti e sintomi per almeno qualche giorno per vedere i primi risultati.
          </div>
        `;
        resultsDiv.appendChild(empty);
      }

      // Combinazioni multifattoriali
      if (combos.length > 0) {
        const comboSection = document.createElement('div');
        comboSection.className = 'section-card';
        comboSection.innerHTML = `<h2>🧩 Combinazioni FODMAP nel Pasto</h2>
          <p style="font-size: 0.72rem; color: #6b7280; margin-bottom: 10px;">
            Analisi delle combinazioni di gruppi FODMAP che compaiono nello stesso pasto,
            per capire se certi mix scatenano più sintomi rispetto ai singoli gruppi.
          </p>`;

        for (const combo of combos.slice(0, 10)) {
          const card = document.createElement('div');
          card.className = 'combo-card';

          const rate = Math.round(combo.symptomRate * 100);
          card.innerHTML = `
            <div class="combo-label">${combo.combinationLabel}</div>
            <div class="combo-stats">
              ${combo.totalMeals} pasti · ${combo.mealsWithSymptoms} con sintomi (${rate}%) ·
              IC: ${Math.round(combo.confidenceLower * 100)}%-${Math.round(combo.confidenceUpper * 100)}%
            </div>
            <div class="confidence-bar">
              <div class="confidence-fill" style="
                left: ${combo.confidenceLower * 100}%;
                width: ${(combo.confidenceUpper - combo.confidenceLower) * 100}%;
                background: ${rate > 50 ? '#ef4444' : rate > 30 ? '#f59e0b' : '#10b981'};
              "></div>
            </div>
          `;
          comboSection.appendChild(card);
        }

        resultsDiv.appendChild(comboSection);
      }
    } catch (err) {
      console.error('Errore nell\'analisi:', err);
      resultsDiv.innerHTML = `
        <div class="empty-state">
          <div class="icon">❌</div>
          <div class="message">Errore durante l'analisi: ${err.message}</div>
        </div>
      `;
    }
  }

  function buildAssociationCard(assoc) {
    const card = document.createElement('div');
    card.className = 'association-card';

    const scorePercent = Math.round(assoc.correlationScore * 100);
    const scoreColor = scorePercent > 60 ? '#ef4444' : scorePercent > 30 ? '#f59e0b' : '#10b981';
    const evidence = EVIDENCE_LABELS[assoc.evidenceLevel] || EVIDENCE_LABELS.OSSERVAZIONE_ISOLATA;

    card.innerHTML = `
      <div class="assoc-header">
        <span class="assoc-food-name">${assoc.foodName}</span>
        <span class="assoc-score" style="background: ${scoreColor}15; color: ${scoreColor};">
          ${scorePercent}%
        </span>
      </div>
      <div class="assoc-stats">
        <span>📊 ${assoc.totalOccurrences} consumo/i</span>
        <span>⚡ ${assoc.symptomOccurrences} con sintomi</span>
        <span>🧹 ${assoc.cleanOccurrences} senza confondenti</span>
      </div>
      <div style="margin-bottom: 6px;">
        <span class="evidence-badge" style="background: ${evidence.color}15; color: ${evidence.color};">
          ${evidence.icon} ${evidence.label}
        </span>
        ${assoc.fodmapGroups.map((g) => `<span class="evidence-badge">${FODMAP_GROUP_LABELS[g] || g}</span>`).join(' ')}
      </div>
      <div style="font-size: 0.7rem; color: #6b7280;">
        Dolore medio: <strong>${assoc.avgPainWhenConsumed}/10</strong> (globale: ${assoc.avgPainBaseline}/10) ·
        Gonfiore medio: <strong>${assoc.avgBloatWhenConsumed}/10</strong> (globale: ${assoc.avgBloatBaseline}/10)
      </div>
      <div class="confidence-bar">
        <div class="confidence-fill" style="
          left: ${assoc.confidenceLower * 100}%;
          width: ${(assoc.confidenceUpper - assoc.confidenceLower) * 100}%;
          background: ${scoreColor};
        "></div>
      </div>
      ${assoc.activeConfounders.length > 0 ? `
        <div style="margin-top: 6px;">
          ${assoc.activeConfounders.map((c) => `<span class="confounder-tag">⚠️ ${c}</span>`).join(' ')}
        </div>
      ` : ''}
    `;

    // Click per espandere gli episodi
    card.addEventListener('click', () => {
      card.classList.toggle('expanded');
      let episodesDiv = card.querySelector('.episodes-list');
      if (episodesDiv) {
        episodesDiv.remove();
        return;
      }

      episodesDiv = document.createElement('div');
      episodesDiv.className = 'episodes-list';

      const maxEpisodes = 10;
      const episodes = assoc.episodes.slice(-maxEpisodes);

      for (const ep of episodes) {
        const dateStr = ep.mealTimestamp
          ? new Date(ep.mealTimestamp).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
          : '—';
        const portionStr = ep.portion ? `${ep.portion.amount || '?'}${ep.portion.unit || ''}` : '?';
        const maxPain = ep.symptomsInWindow.reduce((max, s) => Math.max(max, s.pain || 0), 0);
        const maxBloat = ep.symptomsInWindow.reduce((max, s) => Math.max(max, s.bloat || 0), 0);

        const item = document.createElement('div');
        item.className = 'episode-item';
        item.innerHTML = `
          <span class="episode-date">${dateStr}</span>
          <span class="episode-meal">
            ${portionStr}${ep.preparation ? ' · ' + ep.preparation : ''}
            ${ep.isEstimated ? ' <span style="color: #f59e0b; font-size: 0.6rem;">~stima</span>' : ''}
            ${ep.isConfounded ? ep.confounders.map((c) => `<span class="confounder-tag">${c}</span>`).join('') : ''}
          </span>
          <span class="episode-symptom ${ep.hadElevatedSymptoms ? 'elevated' : 'normal'}">
            ${ep.hadElevatedSymptoms ? `🔴 D:${maxPain} G:${maxBloat}` : '🟢 OK'}
          </span>
        `;
        episodesDiv.appendChild(item);
      }

      if (assoc.episodes.length > maxEpisodes) {
        const more = document.createElement('div');
        more.style.cssText = 'text-align: center; font-size: 0.65rem; color: #9ca3af; padding-top: 6px;';
        more.textContent = `Mostrati ${maxEpisodes} di ${assoc.episodes.length} episodi`;
        episodesDiv.appendChild(more);
      }

      card.appendChild(episodesDiv);
    });

    return card;
  }

  // ── Render logic ────────────────────────────────────────────────────────────

  function renderTabContent() {
    tabContent.innerHTML = '';
    if (activeTab === 'export') {
      tabContent.appendChild(renderExportTab());
    } else {
      tabContent.appendChild(renderAnalysisTab());
    }
  }

  // Initial render
  renderTabContent();
}
