// src/ui/onboarding.js
// Gestione del Profilo Utente & Parametri Baseline Clinici
// Permette la consultazione e la modifica in ogni momento dei parametri personali.

import { getProfile, setProfile } from '../infrastructure/storage/userProfile.js';

function createSlider(id, label, defaultValue = 5) {
  const container = document.createElement('div');
  container.className = 'mb-4';
  const lbl = document.createElement('label');
  lbl.htmlFor = id;
  lbl.className = 'block text-xs font-semibold text-gray-700 mb-1';
  lbl.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '10';
  input.value = defaultValue;
  input.id = id;
  input.className = 'w-full accent-emerald-600';
  const valueSpan = document.createElement('span');
  valueSpan.className = 'text-xs font-bold text-emerald-700 ml-1.5';
  valueSpan.textContent = defaultValue;
  input.addEventListener('input', () => (valueSpan.textContent = input.value));
  container.appendChild(lbl);
  container.appendChild(input);
  container.appendChild(valueSpan);
  return container;
}

function stepPhase(existing = {}) {
  const div = document.createElement('div');
  div.className = 'space-y-2';
  const label = document.createElement('label');
  label.className = 'block text-xs font-semibold text-gray-700 mb-1';
  label.textContent = 'Fase attuale della dieta Low-FODMAP:';
  const select = document.createElement('select');
  select.id = 'phase-select';
  select.className = 'w-full p-2.5 border border-gray-200 rounded-xl text-xs font-medium bg-gray-50';
  const options = [
    { value: 'PREPARATION', text: 'Preparazione / Baseline (osservazione)' },
    { value: 'REDUCTION', text: 'Fase 1: Riduzione rigorosa (Eliminazione)' },
    { value: 'REINTRODUCTION', text: 'Fase 2: Reintroduzione guidata' },
    { value: 'PERSONALIZATION', text: 'Fase 3: Personalizzazione / Mantenimento' },
  ];
  options.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.text;
    if (existing.phase === o.value) opt.selected = true;
    select.appendChild(opt);
  });
  div.appendChild(label);
  div.appendChild(select);
  return div;
}

function stepGoal(existing = {}) {
  const div = document.createElement('div');
  const label = document.createElement('p');
  label.className = 'block text-xs font-semibold text-gray-700 mb-2';
  label.textContent = 'Obiettivi primari di benessere (seleziona uno o più):';
  const goals = [
    'Gonfiore e distensione addominale',
    'Dolore addominale crampiforme',
    'Diarrea / Feci liquide',
    'Stipsi / Evacuazione difficoltosa',
    'Regolarità intestinale complessiva',
    'Identificazione trigger alimentari specifici',
  ];
  const curGoals = existing.goals || [];
  goals.forEach((g, i) => {
    const id = `goal-${i}`;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.value = g;
    cb.className = 'accent-emerald-600 rounded';
    if (curGoals.includes(g)) cb.checked = true;
    const lbl = document.createElement('label');
    lbl.htmlFor = id;
    lbl.className = 'ml-2 text-xs text-gray-700 cursor-pointer';
    lbl.textContent = g;
    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center mb-1.5 p-1.5 hover:bg-gray-50 rounded-lg';
    wrapper.appendChild(cb);
    wrapper.appendChild(lbl);
    div.appendChild(wrapper);
  });
  return div;
}

function stepDiagnosis(existing = {}) {
  const div = document.createElement('div');
  const label = document.createElement('p');
  label.className = 'block text-xs font-semibold text-gray-700 mb-2';
  label.textContent = 'Diagnosi mediche o condizioni accertate:';
  const diags = ['IBS (Sindrome Intestino Irritabile)', 'Endometriosi / Dolore pelvico ciclico', 'Celiachia accertata', 'Intolleranza al lattosio'];
  const curDiags = existing.diagnoses || [];
  diags.forEach((d, i) => {
    const id = `diag-${i}`;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.value = d;
    cb.className = 'accent-emerald-600 rounded';
    if (curDiags.includes(d)) cb.checked = true;
    const lbl = document.createElement('label');
    lbl.htmlFor = id;
    lbl.className = 'ml-2 text-xs text-gray-700 cursor-pointer';
    lbl.textContent = d;
    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center mb-1.5 p-1.5 hover:bg-gray-50 rounded-lg';
    wrapper.appendChild(cb);
    wrapper.appendChild(lbl);
    div.appendChild(wrapper);
  });
  return div;
}

function stepBaselineSymptoms(existing = {}) {
  const div = document.createElement('div');
  const p = document.createElement('p');
  p.className = 'text-xs text-gray-500 mb-3';
  p.textContent = 'Questi valori rappresentano il tuo punto di partenza medio pre-dieta: verranno utilizzati nei grafici e nei report per misurare il reale miglioramento percentuale.';
  div.appendChild(p);
  const painVal = existing.baseline?.pain ?? 5;
  const bloatVal = existing.baseline?.bloat ?? 5;
  div.appendChild(createSlider('baseline-pain', 'Dolore addominale medio di partenza (0‑10)', painVal));
  div.appendChild(createSlider('baseline-bloat', 'Gonfiore addominale medio di partenza (0‑10)', bloatVal));
  return div;
}

function stepMedications(existing = {}) {
  const div = document.createElement('div');
  const label = document.createElement('label');
  label.htmlFor = 'medications';
  label.className = 'block text-xs font-semibold text-gray-700 mb-1';
  label.textContent = 'Farmaci, fermenti o integratori assunti abitualmente:';
  const textarea = document.createElement('textarea');
  textarea.id = 'medications';
  textarea.className = 'w-full p-2.5 border border-gray-200 rounded-xl text-xs bg-gray-50';
  textarea.rows = 2;
  textarea.placeholder = 'Es. Probiotici, antispastici, integratori di fibre, magnesio...';
  textarea.value = (existing.medications || []).join(', ');
  div.appendChild(label);
  div.appendChild(textarea);
  return div;
}

export async function render(root) {
  root.innerHTML = '';

  const profile = await getProfile();

  const container = document.createElement('section');
  container.className = 'max-w-2xl mx-auto px-4 py-4 space-y-4 pb-24 text-gray-800';

  const headerDiv = document.createElement('div');
  headerDiv.className = 'flex justify-between items-center pb-2 border-b border-gray-200';
  headerDiv.innerHTML = `
    <div>
      <h2 class="text-xl font-bold text-emerald-700 leading-tight">Profilo & Parametri Baseline</h2>
      <p class="text-xs text-gray-500">Configura o adatta la tua fase, obiettivi e parametri di riferimento</p>
    </div>
  `;
  container.appendChild(headerDiv);

  const steps = [
    { title: '1. Fase del Percorso', fn: () => stepPhase(profile) },
    { title: '2. Obiettivi di Salute', fn: () => stepGoal(profile) },
    { title: '3. Condizioni e Diagnosi', fn: () => stepDiagnosis(profile) },
    { title: '4. Sintomi Baseline di Riferimento', fn: () => stepBaselineSymptoms(profile) },
    { title: '5. Terapie & Integratori', fn: () => stepMedications(profile) },
  ];

  let currentIndex = 0;
  const stepContainer = document.createElement('div');
  stepContainer.className = 'bg-white p-5 border border-gray-200 rounded-2xl shadow-2xs space-y-3';
  container.appendChild(stepContainer);

  const navDiv = document.createElement('div');
  navDiv.className = 'flex justify-between items-center pt-2';
  const backBtn = document.createElement('button');
  backBtn.textContent = '← Indietro';
  backBtn.className = 'px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl disabled:opacity-40';
  backBtn.disabled = true;

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Avanti →';
  nextBtn.className = 'px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs active:scale-95 transition-all';

  navDiv.appendChild(backBtn);
  navDiv.appendChild(nextBtn);
  container.appendChild(navDiv);

  function renderStep(idx) {
    stepContainer.innerHTML = '';
    const stepTitle = document.createElement('h3');
    stepTitle.className = 'text-xs font-extrabold uppercase tracking-wide text-emerald-800 mb-3';
    stepTitle.textContent = steps[idx].title;
    stepContainer.appendChild(stepTitle);

    const stepFn = steps[idx].fn;
    stepContainer.appendChild(stepFn());
    backBtn.disabled = idx === 0;
    nextBtn.textContent = idx === steps.length - 1 ? 'Salva Modifiche Profilo' : 'Avanti →';
  }

  backBtn.addEventListener('click', () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderStep(currentIndex);
    }
  });

  nextBtn.addEventListener('click', async () => {
    if (currentIndex < steps.length - 1) {
      currentIndex++;
      renderStep(currentIndex);
    } else {
      const updatedProfile = { ...profile };
      
      const phaseSelect = document.getElementById('phase-select');
      if (phaseSelect) updatedProfile.phase = phaseSelect.value;
      
      const goalsChecked = document.querySelectorAll('input[type=checkbox][id^=goal-]:checked');
      if (goalsChecked.length > 0) {
        updatedProfile.goals = Array.from(goalsChecked).map((c) => c.value);
      }

      const diagsChecked = document.querySelectorAll('input[type=checkbox][id^=diag-]:checked');
      updatedProfile.diagnoses = Array.from(diagsChecked).map((c) => c.value);

      const painInp = document.getElementById('baseline-pain');
      const bloatInp = document.getElementById('baseline-bloat');
      if (painInp && bloatInp) {
        updatedProfile.baseline = {
          pain: parseInt(painInp.value, 10),
          bloat: parseInt(bloatInp.value, 10),
        };
      }

      const medsInp = document.getElementById('medications');
      if (medsInp) {
        updatedProfile.medications = medsInp.value.split(',').map((s) => s.trim()).filter(Boolean);
      }

      try {
        await setProfile(updatedProfile);
        alert('Profilo e parametri baseline aggiornati con successo!');
        location.hash = '#home';
      } catch (e) {
        console.error('Error saving profile', e);
        alert('Errore nel salvataggio dei dati.');
      }
    }
  });

  renderStep(currentIndex);
  root.appendChild(container);
}
