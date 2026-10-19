/**
 * src/ui/pages/home.js
 *
 * Home di Fudy: diario rapido a card.
 * Le card sono l'unico metodo di inserimento dei consumi: un tap su +
 * registra UNA occorrenza dell'alimento in IndexedDB, un tap su -
 * elimina l'ultima registrazione di quel tipo fatta oggi.
 *
 * Single source of truth: contatori settimanali e storico derivano
 * SEMPRE dai record del diario in IndexedDB (ricalcolati al caricamento).
 * Il check-in sintomi e' multidimensionale e mostra i fattori gia' indicati
 * per la giornata, cosi' un nuovo check-in non li cancella in silenzio.
 * Il banner di fase usa solo le date indicate nel profilo: nessuna data
 * viene inventata o salvata dalla home.
 */

import { addRecord, deleteRecord, updateRecord, getRecord, uuidv4, getAll } from '../../infrastructure/storage/db.js';
import { getProfile } from '../../infrastructure/storage/userProfile.js';
import { getCards, migrateLegacyCards } from '../../domain/foods/cardService.js';
import { FODMAP_GROUPS } from '../../domain/foods/foodService.js';
import { describePhase } from '../../domain/insights/phaseTimer.js';
import { FACTOR_KEYS, recordToFlags, flagsToRecord } from '../../domain/insights/dayFactors.js';
import {
  CARD_SECTIONS,
  SECTION_KEYS,
  SECTION_MEAL_TYPE,
  MEAL_TYPE_SECTION,
  getCardBudgetState,
} from '../../domain/foods/cardModel.js';

const MEAL_TYPES = [
  { id: 'BREAKFAST', label: 'Colazione', icon: '☕' },
  { id: 'LUNCH', label: 'Pranzo', icon: '☀️' },
  { id: 'SNACK', label: 'Spuntino / Altro', icon: '🧺' },
  { id: 'DINNER', label: 'Cena', icon: '🌙' },
];

const HISTORY_RETENTION_DAYS = 90;
const STACKING_WARN_GROUPS = 2;

let appState = {
  weekMondayId: "",
  consumedThisWeek: { pranzo: {}, cena: {}, altro: {} },
  history: {},
  activeMeal: null
};

function getLocalISODate(d = new Date()) {
  return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
}

function getMondayString(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return getLocalISODate(new Date(date.setDate(diff)));
}

// -- Preferenza leggera (unica cosa in localStorage) --

function loadPrefs() {
  const saved = localStorage.getItem('fudy_prefs');
  if (saved) {
    try { appState.activeMeal = JSON.parse(saved).activeMeal || null; } catch (e) {}
  }
  if (!appState.activeMeal) appState.activeMeal = new Date().getHours() < 15 ? 'pranzo' : 'cena';
}

function savePrefs() {
  localStorage.setItem('fudy_prefs', JSON.stringify({ activeMeal: appState.activeMeal }));
}

// -- Derivazione dello stato dal diario (IndexedDB = unica fonte) --

function emptyDay() {
  return { pranzo: [], cena: [], altro: [] };
}

async function rebuildStateFromDiary() {
  const allMeals = (await getAll('meals')) || [];
  const currentMonday = getMondayString(new Date());
  appState.weekMondayId = currentMonday;

  const consumed = { pranzo: {}, cena: {}, altro: {} };
  const history = {};
  const cutoff = getLocalISODate(new Date(Date.now() - HISTORY_RETENTION_DAYS * 86400000));

  for (const m of allMeals) {
    if (m.source !== 'QUICK_TAP' || !m.timestamp) continue;
    const d = new Date(m.timestamp);
    const dateKey = getLocalISODate(d);
    if (dateKey < cutoff) continue;

    const section = MEAL_TYPE_SECTION[m.mealType];
    if (!section) continue;
    const inThisWeek = getMondayString(d) === currentMonday;

    if (!history[dateKey]) history[dateKey] = emptyDay();
    for (const item of (m.items || [])) {
      history[dateKey][section].push(item.foodId);
      if (inThisWeek) {
        consumed[section][item.foodId] = (consumed[section][item.foodId] || 0) + (item.occurrences || 1);
      }
    }
  }

  appState.consumedThisWeek = consumed;
  appState.history = history;
}

function applyLocalDelta(section, foodId, delta, dateKey = getLocalISODate(), touchesCurrentWeek = true) {
  if (touchesCurrentWeek) {
    const current = appState.consumedThisWeek[section][foodId] || 0;
    appState.consumedThisWeek[section][foodId] = Math.max(0, current + delta);
  }

  if (!appState.history[dateKey]) appState.history[dateKey] = emptyDay();
  if (delta > 0) {
    appState.history[dateKey][section].push(foodId);
  } else {
    const arr = appState.history[dateKey][section];
    const index = arr.lastIndexOf(foodId);
    if (index > -1) arr.splice(index, 1);
  }
}

function buildQuickRecord(section, card, when = new Date()) {
  return {
    id: uuidv4(),
    timestamp: when.toISOString(),
    mealType: SECTION_MEAL_TYPE[section],
    notes: '',
    source: 'QUICK_TAP',
    items: [{
      foodId: card.id,
      foodName: card.name,
      fodmapGroupsSnapshot: card.primaryFodmapGroup || ['LOW_FODMAP_SAFE'],
      sugarsSnapshot: card.sugars || ['NONE'],
      occurrences: 1
    }]
  };
}

async function findLatestQuickRecord(section, foodId) {
  const today = getLocalISODate();
  const mealType = SECTION_MEAL_TYPE[section];
  const allMeals = await getAll('meals');
  return (allMeals || [])
    .filter(m => m.timestamp && m.timestamp.startsWith(today) && m.mealType === mealType
      && m.source === 'QUICK_TAP'
      && (m.items || []).some(i => i.foodId === foodId))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] || null;
}

async function deleteMealRecord(record, cardsById) {
  await deleteRecord('meals', record.id);
  if (record.source !== 'QUICK_TAP' || !record.timestamp) return;

  const section = MEAL_TYPE_SECTION[record.mealType];
  const item = (record.items || [])[0];
  if (!section || !item || !cardsById[item.foodId]) return;

  const touchesCurrentWeek = getMondayString(new Date(record.timestamp)) === appState.weekMondayId;
  applyLocalDelta(section, item.foodId, -1, getLocalISODate(new Date(record.timestamp)), touchesCurrentWeek);
}

// -- Banner di fase: solo date indicate dall'utente --

function phaseBannerHTML(info, label) {
  if (!info) return '';
  const fmt = (ms) => new Date(ms).toLocaleDateString('it-IT');
  if (!info.startKnown) {
    const why = info.startFuture ? 'La data di inizio indicata e\' nel futuro.' : 'Nessuna data di inizio indicata.';
    return `
    <div class="rounded-xl border px-3 py-2 text-[11px] leading-snug bg-gray-50 border-gray-200 text-gray-800">
      <span class="font-bold">${label}</span>
      <span class="block opacity-80">${why} <a href="#onboarding" class="underline font-semibold">Aggiorna il profilo</a> per vedere le settimane trascorse.</span>
    </div>`;
  }
  const lines = [];
  if (info.startEstimated) lines.push('Data di inizio approssimativa.');
  if (info.plannedEnd != null) {
    lines.push(info.plannedEndPassed
      ? `Il termine che avevi indicato (${fmt(info.plannedEnd)}) e' passato: puoi prorogarlo o cambiare fase dal profilo. Nessun passaggio e' automatico.`
      : `Termine che hai indicato: ${fmt(info.plannedEnd)}.`);
  }
  if (info.reductionReview) {
    lines.push('Riduzione oltre le 6 settimane: rivaluta benefici e sostenibilita con il tuo professionista, anche se hai prorogato il termine.');
  }
  const tone = info.reductionReview ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-100 text-emerald-900';
  return `
    <div class="rounded-xl border px-3 py-2 text-[11px] leading-snug ${tone}">
      <span class="font-bold">${label}: settimana ${info.week}</span>
      ${lines.map((l) => `<span class="block opacity-80">${l}</span>`).join('')}
    </div>`;
}

// -- Pagina --

export async function render(rootElement) {
  loadPrefs();

  const profile = await getProfile();
  try {
    await migrateLegacyCards();
  } catch (err) {
    console.warn('Migrazione card legacy non riuscita:', err);
  }
  const cards = await getCards();
  const cardsById = Object.fromEntries(cards.map((c) => [c.id, c]));

  try {
    await rebuildStateFromDiary();
  } catch (err) {
    console.warn('Lettura diario non riuscita:', err);
  }

  const phaseNames = {
    PREPARATION: 'Preparazione / Baseline',
    REDUCTION: 'Fase 1: Riduzione',
    REINTRODUCTION: 'Fase 2: Reintroduzione',
    PERSONALIZATION: 'Fase 3: Personalizzazione'
  };
  const phaseLabel = phaseNames[profile.phase] || 'Fase: Inizio Percorso';
  const phaseInfo = describePhase(profile);

  const sectionTitles = {
    pranzo: '☀️ Tap Rapido Pranzo',
    cena: '🌙 Tap Rapido Cena',
    altro: '🧺 Tap Rapido Altro'
  };

  const sectionsHTML = CARD_SECTIONS.map((section) => `
      <section>
        <div class="flex justify-between items-center mb-2">
          <h3 class="text-sm font-bold text-gray-800 flex items-center gap-1.5">${sectionTitles[section.key]}</h3>
          <span class="text-[11px] text-gray-400">+ aggiunge, − toglie l'ultimo</span>
        </div>
        <div id="${section.key}-grid" class="grid grid-cols-2 sm:grid-cols-3 gap-2"></div>
        <a href="#alimenti" class="block mt-2 text-center text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-dashed border-emerald-300 rounded-xl py-2 hover:bg-emerald-100 transition-colors">
          ＋ Gestisci o crea alimenti (sezione ${section.label})
        </a>
      </section>
  `).join('');

  const CONFOUNDER_CHOICES = [
    { id: 'stressLevel', label: '😰 Stress alto' },
    { id: 'alcoholIntake', label: '🍷 Alcol' },
    { id: 'travelOrRoutineChange', label: '✈️ Viaggio / cambio routine' },
    { id: 'heavyMealConsumed', label: '🍽️ Pasto molto abbondante o grasso' },
    { id: 'intercurrentIllness', label: '💊 Farmaci nuovi o malattia intercorrente' },
  ];

  const confounderCheckboxesHTML = CONFOUNDER_CHOICES.map((c) => `
      <label class="inline-flex items-center gap-2 cursor-pointer bg-white border border-gray-200 rounded-lg px-2 py-1.5">
        <input type="checkbox" name="conf-${c.id}" class="accent-amber-600 rounded">
        <span>${c.label}</span>
      </label>`).join('');

  rootElement.innerHTML = `
    <div class="home-container max-w-2xl mx-auto px-4 py-4 space-y-4 pb-24">

      <div class="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-4 text-white shadow-md flex justify-between items-center">
        <div>
          <span class="text-[11px] font-bold uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full inline-block mb-1">
            ${phaseLabel}
          </span>
          <h2 class="text-lg font-extrabold leading-tight">Diario Alimentare & Sintomi</h2>
          <p class="text-xs text-emerald-100 mt-0.5" id="date-display"></p>
        </div>
        <button id="btn-quick-symptom" class="bg-white text-emerald-700 hover:bg-emerald-50 active:scale-95 transition-all text-xs font-bold px-3.5 py-2.5 rounded-xl shadow flex items-center gap-1.5 whitespace-nowrap">
          <span>⚡</span>
          <span>Sintomi</span>
        </button>
      </div>

      ${phaseBannerHTML(phaseInfo, phaseLabel)}

      <div class="flex gap-2">
        <button id="btn-open-history" class="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold py-2.5 px-3.5 rounded-xl shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 text-xs">
          <span>📖</span>
          <span>Storico completo</span>
        </button>
      </div>

      <section class="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs">
        <div class="flex justify-between items-center mb-2.5">
          <h3 class="text-xs font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
            📋 Consumi di Oggi
          </h3>
          <span id="today-meals-count" class="text-[11px] text-gray-400 font-semibold">0 registrazioni</span>
        </div>
        <div id="today-meals-list" class="space-y-2 text-xs">
          <p class="text-gray-400 italic py-2 text-center">Nessuna registrazione oggi. Usa le card qui sotto.</p>
        </div>
        <div id="stack-note" class="hidden mt-2.5 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-2 text-[11px] text-gray-700"></div>
      </section>

      <section class="bg-emerald-50/80 border border-emerald-100 rounded-2xl p-4 shadow-sm">
        <div class="flex justify-between items-center mb-2">
          <h3 class="text-xs font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1.5">
            💡 Consigli di Rotazione
          </h3>
          <div class="flex bg-white rounded-full p-0.5 shadow-inner text-[11px] font-bold">
            <button id="toggle-pranzo" class="px-2.5 py-1 rounded-full transition-colors">☀️ Pranzo</button>
            <button id="toggle-cena" class="px-2.5 py-1 rounded-full transition-colors">🌙 Cena</button>
          </div>
        </div>
        <p class="text-[11px] text-emerald-700 mb-2.5 leading-snug">
          Incrocio tra budget rimasto e alimenti assenti nei giorni T-5, T-6, T-7:
        </p>
        <div id="suggestions-box" class="flex flex-wrap gap-1.5 mb-2"></div>
        <div id="history-box" class="space-y-1 text-xs text-gray-600 pt-2 border-t border-emerald-100"></div>
      </section>

      ${sectionsHTML}

      <div class="pt-4 border-t border-gray-200 flex flex-wrap gap-2 justify-between items-center text-xs text-gray-500">
        <span>Dati memorizzati 100% in locale nel browser.</span>
        <button id="btn-seed-demo" class="text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg font-semibold border border-emerald-200 active:scale-95 transition-all">
          🧪 Carica Dati Demo
        </button>
      </div>

    </div>

    <!-- Modal Sintomi Rapido -->
    <dialog id="symptom-modal" class="w-11/12 max-w-md rounded-2xl p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm shadow-2xl m-auto">
      <div class="p-5 bg-white max-h-[85vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-3 pb-2 border-b">
          <div>
            <h3 class="text-base font-bold text-gray-800">⚡ Check-in Sintomi</h3>
            <p class="text-xs text-gray-500">Registra come ti senti in questo momento</p>
          </div>
          <button id="btn-close-symptom" class="bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full w-7 h-7 flex items-center justify-center font-bold">✕</button>
        </div>

        <form id="form-symptom" class="space-y-4 text-xs">
          <div>
            <div class="flex justify-between font-semibold text-gray-700 mb-1">
              <label for="input-pain">Dolore addominale / intestinale (0-10)</label>
              <span id="val-pain" class="text-emerald-600 font-bold">0</span>
            </div>
            <input type="range" id="input-pain" min="0" max="10" value="0" class="w-full accent-emerald-600">
          </div>

          <div>
            <div class="flex justify-between font-semibold text-gray-700 mb-1">
              <label for="input-bloat">Gonfiore / distensione (0-10)</label>
              <span id="val-bloat" class="text-emerald-600 font-bold">0</span>
            </div>
            <input type="range" id="input-bloat" min="0" max="10" value="0" class="w-full accent-emerald-600">
          </div>

          <div>
            <div class="flex justify-between font-semibold text-gray-700 mb-1">
              <label for="input-pelvic">Dolore pelvico, non collegato alla pancia (0-10)</label>
              <span id="val-pelvic" class="text-emerald-600 font-bold">0</span>
            </div>
            <input type="range" id="input-pelvic" min="0" max="10" value="0" class="w-full accent-rose-500">
          </div>

          <div>
            <label class="block font-semibold text-gray-700 mb-1">Alvo e tensione</label>
            <div class="grid grid-cols-1 gap-1.5 p-2 bg-gray-50 border border-gray-200 rounded-xl text-[11px]">
              <label class="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="input-endobelly" class="accent-emerald-600 rounded">
                <span>Pancia molto tesa / "endo-belly" visibile</span>
              </label>
              <label class="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="input-dyschezia" class="accent-emerald-600 rounded">
                <span>Dolore o difficoltà durante l'evacuazione</span>
              </label>
            </div>
          </div>

          <div>
            <label class="block font-semibold text-gray-700 mb-1">Scala delle Feci Bristol (1-7)</label>
            <select id="input-bristol" class="w-full p-2 border rounded-lg bg-gray-50 text-gray-700">
              <option value="">Nessuna evacuazione</option>
              <option value="1">Tipo 1: Grumi duri e separati (stipsi severa)</option>
              <option value="2">Tipo 2: A forma di salsiccia, ma grumosa</option>
              <option value="3">Tipo 3: Come una salsiccia, con crepe</option>
              <option value="4" selected>Tipo 4: Come una salsiccia, liscia e morbida (normale)</option>
              <option value="5">Tipo 5: Pezzi morbidi con bordi netti</option>
              <option value="6">Tipo 6: Pezzi vaporosi, margini frastagliati (sub-diarrea)</option>
              <option value="7">Tipo 7: Acquosa, senza pezzi solidi (diarrea)</option>
            </select>
          </div>

          <div>
            <label class="block font-semibold text-gray-700 mb-1">Fattori del giorno che possono interferire</label>
            <p class="text-[10px] text-gray-400 mb-1">Valgono per tutta la giornata: se li hai già indicati li ritrovi spuntati e puoi modificarli. Servono a non attribuire ai cibi sintomi dovuti ad altro.</p>
            <div class="grid grid-cols-1 gap-1.5 p-2 bg-amber-50/60 border border-amber-100 rounded-xl text-[11px]">
              ${confounderCheckboxesHTML}
            </div>
          </div>

          <div>
            <label class="block font-semibold text-gray-700 mb-1">Note libere</label>
            <input type="text" id="input-notes" placeholder="Es. cena fuori casa, sonno scarso..." class="w-full p-2 border rounded-lg bg-gray-50">
          </div>

          <div class="pt-2 flex gap-2">
            <button type="button" id="btn-no-symptoms" class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl transition-all">
              Tutto OK (0/10)
            </button>
            <button type="submit" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl shadow-md active:scale-95 transition-all">
              Salva Sintomo
            </button>
          </div>
        </form>
      </div>
    </dialog>

    <!-- Modal Storico Completo -->
    <dialog id="history-modal" class="w-11/12 max-w-md rounded-2xl p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm shadow-2xl m-auto">
      <div class="p-4 bg-white">
        <div class="flex justify-between items-center mb-3 pb-2 border-b">
          <h3 class="text-base font-bold text-gray-800">Storico Registrazioni</h3>
          <button id="btn-close-history" class="bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full w-7 h-7 flex items-center justify-center font-bold">✕</button>
        </div>
        <div id="full-history-list" class="max-h-[60vh] overflow-y-auto space-y-2 text-xs"></div>
      </div>
    </dialog>
  `;

  document.getElementById('date-display').textContent = new Date().toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  // -- Rendering componenti --

  function cardsBySection(sectionKey) {
    return cards.filter((c) => SECTION_KEYS[c.mealSection] === sectionKey);
  }

  function renderAll() {
    renderGrids();
    renderMealToggle();
    renderRotation();
    refreshTodayMeals();
  }

  function renderMealToggle() {
    const isPranzo = appState.activeMeal === 'pranzo';
    const btnP = document.getElementById('toggle-pranzo');
    const btnC = document.getElementById('toggle-cena');
    if (btnP && btnC) {
      btnP.className = `px-2.5 py-1 rounded-full transition-colors ${isPranzo ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-400'}`;
      btnC.className = `px-2.5 py-1 rounded-full transition-colors ${!isPranzo ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-400'}`;
    }
  }

  function renderGrids() {
    for (const section of CARD_SECTIONS) {
      const grid = document.getElementById(`${section.key}-grid`);
      if (!grid) continue;
      const sectionCards = cardsBySection(section.key);
      grid.innerHTML = sectionCards.length > 0
        ? sectionCards.map((card) => createCardHTML(section.key, card, sectionCards)).join('')
        : `<p class="col-span-full text-[11px] text-gray-400 italic py-2">Nessun alimento in questa sezione. Crealo dalla pagina "Inserisci alimento".</p>`;
    }

    rootElement.querySelectorAll('[data-action="add"]').forEach(btn => {
      btn.onclick = () => handleAddFood(btn.dataset.section, btn.dataset.foodId);
    });
    rootElement.querySelectorAll('[data-action="remove"]').forEach(btn => {
      btn.onclick = () => handleRemoveFood(btn.dataset.section, btn.dataset.foodId);
    });
  }

  function createCardHTML(section, card, sectionCards) {
    const counts = appState.consumedThisWeek[section] || {};
    const state = getCardBudgetState(card, counts, sectionCards);

    let bg = "bg-white border-gray-200";
    let text = "text-gray-800";
    let badge = "bg-emerald-100 text-emerald-700";
    let bar = "bg-emerald-500";
    let statusLabel;
    let ariaLabel;
    let statusBarHTML = '';

    if (!state.hasLimit) {
      statusLabel = `${state.consumed}×`;
      ariaLabel = `${card.name}: consumato ${state.consumed} volta/e questa settimana, nessun limite impostato`;
    } else {
      const { limit, remaining } = state;
      const progress = limit > 0 ? Math.min((state.consumed / limit) * 100, 100) : 100;
      statusLabel = `${state.consumed}/${limit}`;
      if (remaining === 0) {
        bg = "bg-gray-50 border-gray-200 opacity-80";
        badge = "bg-gray-200 text-gray-600";
        bar = "bg-gray-400";
        statusLabel = `${state.consumed}/${limit} ✓`;
      } else if (remaining < 0) {
        bg = "bg-red-50 border-red-300";
        text = "text-red-700";
        badge = "bg-red-200 text-red-800";
        bar = "bg-red-500";
        statusLabel = `${state.consumed}/${limit} +${Math.abs(remaining)}`;
      }
      ariaLabel =
        `${card.name}: consumati ${state.consumed} su ${limit}${state.isShared ? ' (budget condiviso di gruppo)' : ''}; ` +
        `${remaining >= 0 ? `ne rimangono ${remaining}` : `sforato di ${Math.abs(remaining)}`}`;
      statusBarHTML = `
        <div class="h-1 rounded-full bg-black/10 overflow-hidden mb-1.5" aria-hidden="true">
          <div class="h-full ${bar} transition-all" style="width: ${progress}%"></div>
        </div>`;
    }

    return `
      <div class="border rounded-xl p-2.5 shadow-2xs relative flex flex-col justify-between ${bg} transition-all">
        <div class="flex justify-between items-center gap-2 mb-1">
          <span class="text-xl" aria-hidden="true">${card.emoji || '🍽️'}</span>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${badge}"
                aria-label="${ariaLabel}" title="${ariaLabel}">
            ${statusLabel}
          </span>
        </div>
        ${statusBarHTML}
        <div class="font-semibold text-xs mb-1.5 leading-tight truncate ${text}">${card.name}</div>
        <div class="flex gap-1.5">
          <button data-action="remove" data-section="${section}" data-food-id="${card.id}" aria-label="Rimuovi un ${card.name}"
                  class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-1 rounded-lg text-xs font-bold active:scale-95 transition-transform">−</button>
          <button data-action="add" data-section="${section}" data-food-id="${card.id}" aria-label="Aggiungi un ${card.name}"
                  class="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white py-1 rounded-lg text-xs font-bold shadow-2xs active:scale-95 transition-transform">+</button>
        </div>
      </div>
    `;
  }

  function renderRotation() {
    const currentMeal = appState.activeMeal || 'pranzo';
    const pastEaten = new Set();
    let historyHTML = "";

    [5, 6, 7].forEach(daysAgo => {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      const record = appState.history[getLocalISODate(d)];

      let text = "Nessun dato";
      if (record) {
        const allEaten = ['pranzo', 'cena', 'altro'].flatMap(sec =>
          (record[sec] || []).map(id => {
            pastEaten.add(id);
            return cardsById[id]?.name || id;
          })
        );
        if (allEaten.length > 0) text = allEaten.join(", ");
      }
      historyHTML += `<div class="grid grid-cols-[35px_1fr] gap-1 text-[11px]"><span class="font-bold text-gray-400">T-${daysAgo}</span> <span class="truncate">${text}</span></div>`;
    });

    const hBox = document.getElementById('history-box');
    if (hBox) hBox.innerHTML = historyHTML;

    const mealCards = cardsBySection(currentMeal);
    const counts = appState.consumedThisWeek[currentMeal] || {};
    const suggestions = mealCards
      .filter((card) => {
        const state = getCardBudgetState(card, counts, mealCards);
        return state.hasLimit && state.remaining > 0 && !pastEaten.has(card.id);
      })
      .map((card) => `<span class="bg-white border border-emerald-200 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-2xs">${card.emoji || ''} ${card.name}</span>`);

    const sBox = document.getElementById('suggestions-box');
    if (sBox) {
      sBox.innerHTML = suggestions.length > 0
        ? suggestions.join("")
        : `<span class="text-xs italic text-emerald-600">Nessuna priorità specifica, segui il budget rimasto.</span>`;
    }
  }

  function renderMealRow(m, withDate) {
    const ts = m.timestamp ? new Date(m.timestamp) : null;
    const timeStr = ts ? ts.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
    const dateStr = ts ? ts.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) : '';
    const typeObj = MEAL_TYPES.find(t => t.id === m.mealType) || { label: m.mealType, icon: '🍽️' };
    const itemsNames = (m.items || []).map(i => i.foodName).join(', ');

    return `
      <div class="p-2.5 bg-gray-50 border border-gray-100 rounded-xl flex justify-between items-start gap-2" data-meal-id="${m.id}">
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-sm">${typeObj.icon}</span>
            <span class="font-bold text-gray-800 text-xs">${typeObj.label}</span>
            <span class="text-[10px] text-gray-400 font-medium">${withDate ? dateStr + ' · ' : ''}ore ${timeStr}</span>
          </div>
          <p class="text-[11px] text-gray-600 mt-0.5 truncate">${itemsNames || 'Registrazione'}</p>
        </div>
        <button class="shrink-0 text-gray-300 hover:text-red-500 font-bold px-1.5" data-delete-meal="${m.id}" aria-label="Elimina registrazione">🗑</button>
      </div>
    `;
  }

  function bindDeleteButtons(container) {
    container.querySelectorAll('[data-delete-meal]').forEach(btn => {
      btn.onclick = async () => {
        try {
          const allMeals = await getAll('meals');
          const record = (allMeals || []).find(m => m.id === btn.dataset.deleteMeal);
          if (!record) return;
          await deleteMealRecord(record, cardsById);
          renderAll();
        } catch (err) {
          console.warn('Errore eliminazione registrazione:', err);
          alert('Non sono riuscita a eliminare la registrazione. Riprova.');
        }
      };
    });
  }

  // Riepilogo neutro: conta i gruppi FODMAP diversi registrati oggi. Non misura
  // quantita' ne' vicinanza temporale, quindi non e' una misura di stacking.
  function updateStackNote(todayMeals) {
    const note = document.getElementById('stack-note');
    if (!note) return;

    const groups = new Set();
    for (const m of todayMeals) {
      for (const item of (m.items || [])) {
        for (const g of (item.fodmapGroupsSnapshot || [])) {
          if (g !== 'LOW_FODMAP_SAFE') groups.add(g);
        }
      }
    }

    if (groups.size < STACKING_WARN_GROUPS) {
      note.classList.add('hidden');
      note.textContent = '';
      return;
    }

    const names = [...groups].map((g) => FODMAP_GROUPS.find((fg) => fg.id === g)?.label.split(' ')[0] || g);
    note.classList.remove('hidden');
    note.textContent = `Oggi hai registrato ${groups.size} gruppi FODMAP diversi (${names.join(', ')}). E' solo un riepilogo: non indica le quantita' ne' il tempo tra le fonti. Se compaiono sintomi, annotali nel check-in.`;
  }

  async function refreshTodayMeals() {
    const listDiv = document.getElementById('today-meals-list');
    const countSpan = document.getElementById('today-meals-count');
    if (!listDiv) return;

    try {
      const allMeals = await getAll('meals');
      const todayPrefix = getLocalISODate();
      const todayMeals = (allMeals || [])
        .filter(m => m.timestamp && m.timestamp.startsWith(todayPrefix))
        .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

      countSpan.textContent = `${todayMeals.length} registrazioni`;
      updateStackNote(todayMeals);

      if (todayMeals.length === 0) {
        listDiv.innerHTML = '<p class="text-gray-400 italic py-2 text-center text-xs">Nessuna registrazione oggi. Usa le card qui sotto.</p>';
        return;
      }

      listDiv.innerHTML = todayMeals.map(m => renderMealRow(m, false)).join('');
      bindDeleteButtons(listDiv);
    } catch (e) {
      console.warn('Errore lettura consumi odierni:', e);
    }
  }

  // -- Tasti + e − : l'interfaccia cambia solo dopo l'esito del database --

  async function handleAddFood(section, foodId) {
    const card = cardsById[foodId];
    if (!card) return;
    try {
      await addRecord('meals', buildQuickRecord(section, card));
    } catch (err) {
      console.warn('Errore salvataggio consumo:', err);
      alert('Salvataggio non riuscito: riprova prima di aggiungere altro.');
      return;
    }
    applyLocalDelta(section, foodId, +1);
    renderAll();
  }

  async function handleRemoveFood(section, foodId) {
    let record;
    try {
      record = await findLatestQuickRecord(section, foodId);
    } catch (err) {
      console.warn('Errore lettura registrazioni:', err);
      alert('Non riesco a leggere il diario: riprova.');
      return;
    }
    if (!record) return;

    try {
      await deleteMealRecord(record, cardsById);
    } catch (err) {
      console.warn('Errore cancellazione consumo:', err);
      alert('Cancellazione non riuscita: riprova.');
      return;
    }
    renderAll();
  }

  // -- Toggle pranzo/cena --

  document.getElementById('toggle-pranzo')?.addEventListener('click', () => {
    appState.activeMeal = 'pranzo';
    savePrefs();
    renderAll();
  });
  document.getElementById('toggle-cena')?.addEventListener('click', () => {
    appState.activeMeal = 'cena';
    savePrefs();
    renderAll();
  });

  // -- Modal Sintomi (multidimensionale + fattori del giorno) --

  const symptomModal = document.getElementById('symptom-modal');
  const formSymptom = document.getElementById('form-symptom');
  const painInput = document.getElementById('input-pain');
  const bloatInput = document.getElementById('input-bloat');
  const pelvicInput = document.getElementById('input-pelvic');

  painInput?.addEventListener('input', () => {
    document.getElementById('val-pain').textContent = painInput.value;
  });
  bloatInput?.addEventListener('input', () => {
    document.getElementById('val-bloat').textContent = bloatInput.value;
  });
  pelvicInput?.addEventListener('input', () => {
    document.getElementById('val-pelvic').textContent = pelvicInput.value;
  });

  function applyFlagsToForm(flags) {
    for (const key of FACTOR_KEYS) {
      const box = document.querySelector(`[name="conf-${key}"]`);
      if (box) box.checked = !!flags[key];
    }
  }

  function readConfoundersFromForm() {
    const flags = {};
    for (const key of FACTOR_KEYS) {
      flags[key] = document.querySelector(`[name="conf-${key}"]`)?.checked || false;
    }
    return flags;
  }

  // Mostra i fattori gia' indicati oggi: salvare un nuovo check-in non li cancella in silenzio.
  document.getElementById('btn-quick-symptom')?.addEventListener('click', async () => {
    try {
      const stored = await getRecord('confounders', getLocalISODate());
      applyFlagsToForm(recordToFlags(stored));
    } catch (err) {
      console.warn('Lettura fattori del giorno non riuscita:', err);
    }
    symptomModal.showModal();
  });
  document.getElementById('btn-close-symptom')?.addEventListener('click', () => symptomModal.close());
  symptomModal?.addEventListener('click', (e) => { if (e.target === symptomModal) symptomModal.close(); });

  async function saveConfoundersForToday(flags) {
    const today = getLocalISODate();
    const existing = await getRecord('confounders', today);
    await updateRecord('confounders', flagsToRecord(today, flags, existing || {}));
  }

  async function saveCheckin({ pain, bloat, pelvic, endoBelly, dyschezia, bristol, confounders, notes }) {
    const timestamp = new Date().toISOString();
    await addRecord('symptoms', {
      id: uuidv4(),
      timestamp,
      type: 'CHECK_IN',
      abdominalPainIntensity: pain,
      bloatingIntensity: bloat,
      pelvicPainIntensity: pelvic,
      endoBellyDistension: !!endoBelly,
      dyschezia: !!dyschezia,
      notes: notes || ''
    });
    if (bristol) {
      await addRecord('bowel_events', {
        id: uuidv4(),
        timestamp,
        bristolType: Number(bristol),
        notes: ''
      });
    }
    await saveConfoundersForToday(confounders);
  }

  async function handleCheckinSubmit(e) {
    e.preventDefault();
    try {
      await saveCheckin({
        pain: Number(painInput.value),
        bloat: Number(bloatInput.value),
        pelvic: Number(pelvicInput.value),
        endoBelly: document.getElementById('input-endobelly').checked,
        dyschezia: document.getElementById('input-dyschezia').checked,
        bristol: document.getElementById('input-bristol').value,
        confounders: readConfoundersFromForm(),
        notes: document.getElementById('input-notes').value,
      });
      formSymptom.reset();
      document.getElementById('val-pain').textContent = '0';
      document.getElementById('val-bloat').textContent = '0';
      document.getElementById('val-pelvic').textContent = '0';
      symptomModal.close();
    } catch (err) {
      console.warn('Errore salvataggio sintomo:', err);
      alert('Salvataggio non riuscito: riprova.');
    }
  }

  formSymptom?.addEventListener('submit', handleCheckinSubmit);

  document.getElementById('btn-no-symptoms')?.addEventListener('click', async () => {
    try {
      await saveCheckin({
        pain: 0, bloat: 0, pelvic: 0,
        endoBelly: false, dyschezia: false,
        bristol: '', confounders: readConfoundersFromForm(), notes: ''
      });
      symptomModal.close();
    } catch (err) {
      console.warn('Errore salvataggio check-in:', err);
    }
  });

  // -- Modal Storico --

  const historyModal = document.getElementById('history-modal');
  document.getElementById('btn-open-history')?.addEventListener('click', async () => {
    const listDiv = document.getElementById('full-history-list');
    listDiv.innerHTML = '<p class="text-gray-400 italic text-center py-4">Caricamento…</p>';
    historyModal.showModal();
    try {
      const allMeals = (await getAll('meals') || [])
        .filter(m => m.timestamp)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      listDiv.innerHTML = allMeals.length > 0
        ? allMeals.map(m => renderMealRow(m, true)).join('')
        : '<p class="text-gray-400 italic text-center py-4">Nessuna registrazione presente.</p>';
      bindDeleteButtons(listDiv);
    } catch (err) {
      console.warn('Errore apertura storico:', err);
      listDiv.innerHTML = '<p class="text-red-400 italic text-center py-4">Errore di lettura del diario.</p>';
    }
  });
  document.getElementById('btn-close-history')?.addEventListener('click', () => historyModal.close());
  historyModal?.addEventListener('click', (e) => { if (e.target === historyModal) historyModal.close(); });

  // -- Dati demo --

  document.getElementById('btn-seed-demo')?.addEventListener('click', async () => {
    if (!confirm('Genero una settimana di registrazioni dimostrative (pasti rapidi e qualche sintomo). Procedere?')) return;

    try {
      const pool = CARD_SECTIONS.map((section) => ({
        key: section.key,
        cards: cardsBySection(section.key),
      })).filter((entry) => entry.cards.length > 0);

      for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
        const day = new Date();
        day.setDate(day.getDate() - daysAgo);
        const dateKey = getLocalISODate(day);

        for (const entry of pool) {
          const perSection = entry.key === 'altro' ? 1 : 2;
          const chosen = entry.cards.filter(() => Math.random() < 0.5).slice(0, perSection);
          for (const card of chosen) {
            const when = new Date(day);
            when.setHours(entry.key === 'pranzo' ? 12 : entry.key === 'cena' ? 19 : 16, 30, 0, 0);
            await addRecord('meals', buildQuickRecord(entry.key, card, when));
            applyLocalDelta(entry.key, card.id, +1, dateKey, getMondayString(when) === appState.weekMondayId);
          }
        }

        if (daysAgo % 2 === 0) {
          const whenS = new Date(day); whenS.setHours(21, 0, 0, 0);
          await addRecord('symptoms', {
            id: uuidv4(),
            timestamp: whenS.toISOString(),
            type: 'CHECK_IN',
            abdominalPainIntensity: Math.floor(Math.random() * 4),
            bloatingIntensity: Math.floor(Math.random() * 5),
            pelvicPainIntensity: Math.floor(Math.random() * 3),
            notes: 'demo'
          });
        }
      }
      renderAll();
      alert('Dati demo caricati. Puoi eliminarli singolarmente dallo storico.');
    } catch (err) {
      console.warn('Errore caricamento dati demo:', err);
      alert('Errore durante il caricamento dei dati demo.');
    }
  });

  renderAll();
}
