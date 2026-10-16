/**
 * src/ui/pages/home.js
 *
 * Pagina principale "Diario / Tracker" di FODMAP Path.
 * Integra:
 * 1. Indicatore fase attuale e baseline da IndexedDB
 * 2. Compositore Pasti reali multi-ingrediente con selezione dal Catalogo Alimenti
 * 3. Selezione rapida con budget settimanale generato dal Catalogo Alimenti
 *    (ogni alimento con budget attivo compare automaticamente) e rotazione T-5, T-6, T-7
 * 4. Modal Check-in rapido Sintomi (dolore, gonfiore, Bristol, note) salvato in IndexedDB
 * 5. Storico recente pasti
 * 6. Generatore dati demo per testare subito grafici e report
 */

import { openDB, addRecord, uuidv4, getAll } from '../../infrastructure/storage/db.js';
import { getProfile } from '../../infrastructure/storage/userProfile.js';
import { getFoods } from '../../domain/foods/foodService.js';
import { getRemainingPortions } from '../../domain/foods/budgetModel.js';
import { migrateLegacyBudgetFoods } from '../../domain/foods/budgetMigration.js';
import { LEGACY_FOOD_SEED } from '../../domain/foods/legacyBudgetSeed.js';

const MEAL_TYPES = [
  { id: 'BREAKFAST', label: 'Colazione', icon: '☕' },
  { id: 'LUNCH', label: 'Pranzo', icon: '☀️' },
  { id: 'SNACK', label: 'Spuntino', icon: '🍎' },
  { id: 'DINNER', label: 'Cena', icon: '🌙' },
];

// La home mostra due griglie (pranzo/cena); ciascuna corrisponde a uno slot del budget.
const MEAL_SLOT = { pranzo: 'LUNCH', cena: 'DINNER' };
const SLOT_MEAL = { LUNCH: 'pranzo', DINNER: 'cena' };
const MEAL_KEYS = ['pranzo', 'cena'];

const HISTORY_RETENTION_DAYS = 90;
const STATE_KEYS_VERSION = 2;

// Alimenti con budget attivo, caricati dal catalogo a ogni render.
let budgetFoods = [];

let appState = {
  weekMondayId: "",
  consumedThisWeek: { pranzo: {}, cena: {} },
  history: {},
  activeMeal: null,
  keysVersion: 1
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLocalISODate(d = new Date()) {
  return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
}

function getMondayString(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return getLocalISODate(new Date(date.setDate(diff)));
}

function pruneHistory() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_RETENTION_DAYS);
  const cutoffStr = getLocalISODate(cutoff);
  Object.keys(appState.history).forEach(date => {
    if (date < cutoffStr) delete appState.history[date];
  });
}

function saveLocalState() {
  localStorage.setItem('fodmap_state', JSON.stringify(appState));
}

function loadLocalState() {
  const saved = localStorage.getItem('fodmap_state');
  if (saved) {
    try { appState = { ...appState, ...JSON.parse(saved) }; } catch (e) {}
  }

  const currentMonday = getMondayString(new Date());
  if (appState.weekMondayId !== currentMonday) {
    appState.weekMondayId = currentMonday;
    appState.consumedThisWeek = { pranzo: {}, cena: {} };
  }

  const today = getLocalISODate();
  if (!appState.history[today]) {
    appState.history[today] = { pranzo: [], cena: [] };
  }

  if (!appState.activeMeal) {
    appState.activeMeal = new Date().getHours() < 15 ? 'pranzo' : 'cena';
  }

  pruneHistory();
  saveLocalState();
}

/**
 * Converte i vecchi identificativi (es. 'uovo_pranzo', 'salmone_fresco')
 * negli ID degli alimenti del catalogo. Eseguita una sola volta.
 */
function migrateLegacyConsumptionKeys() {
  if (appState.keysVersion >= STATE_KEYS_VERSION) return;

  const keyMap = { pranzo: {}, cena: {} };
  LEGACY_FOOD_SEED.forEach(seed => {
    Object.entries(seed.legacyKeys || {}).forEach(([slot, legacyKey]) => {
      const meal = SLOT_MEAL[slot];
      if (meal) keyMap[meal][legacyKey] = seed.id;
    });
  });

  MEAL_KEYS.forEach(meal => {
    const migrated = {};
    Object.entries(appState.consumedThisWeek?.[meal] || {}).forEach(([key, count]) => {
      const id = keyMap[meal][key] || key;
      migrated[id] = (migrated[id] || 0) + count;
    });
    if (!appState.consumedThisWeek) appState.consumedThisWeek = { pranzo: {}, cena: {} };
    appState.consumedThisWeek[meal] = migrated;
  });

  Object.values(appState.history || {}).forEach(day => {
    MEAL_KEYS.forEach(meal => {
      day[meal] = (day[meal] || []).map(key => keyMap[meal][key] || key);
    });
  });

  appState.keysVersion = STATE_KEYS_VERSION;
  saveLocalState();
}

function foodsForMeal(meal) {
  const slot = MEAL_SLOT[meal];
  return budgetFoods.filter(f => f.budget?.weeklyLimits?.[slot] !== undefined);
}

function getRemaining(meal, food) {
  const consumed = appState.consumedThisWeek[meal] || {};
  const remaining = getRemainingPortions(food, MEAL_SLOT[meal], consumed, budgetFoods);
  return remaining === null ? 0 : remaining;
}

function foodLabel(food) {
  return food.budget?.shortLabel || food.name;
}

function registerConsumption(meal, foodId) {
  if (!appState.consumedThisWeek[meal]) appState.consumedThisWeek[meal] = {};
  appState.consumedThisWeek[meal][foodId] = (appState.consumedThisWeek[meal][foodId] || 0) + 1;

  const today = getLocalISODate();
  if (!appState.history[today]) appState.history[today] = { pranzo: [], cena: [] };
  if (!appState.history[today][meal]) appState.history[today][meal] = [];
  appState.history[today][meal].push(foodId);
}

export async function render(rootElement) {
  // 1. Il catalogo e' la fonte unica: migra le vecchie voci della home e carica gli alimenti con budget.
  await migrateLegacyBudgetFoods();
  budgetFoods = await getFoods({ budgetOnly: true });

  loadLocalState();
  migrateLegacyConsumptionKeys();

  const profile = await getProfile();

  const phaseNames = {
    PREPARATION: 'Preparazione / Baseline',
    REDUCTION: 'Fase 1: Riduzione',
    REINTRODUCTION: 'Fase 2: Reintroduzione',
    PERSONALIZATION: 'Fase 3: Personalizzazione'
  };
  const phaseLabel = phaseNames[profile.phase] || 'Fase: Inizio Percorso';

  rootElement.innerHTML = `
    <div class="home-container max-w-2xl mx-auto px-4 py-4 space-y-4 pb-24">
      
      <!-- Banner di stato fase & check-in rapido -->
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

      <!-- Barra Azioni Rapide Pasto -->
      <div class="flex gap-2">
        <button id="btn-open-meal-composer" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-xs active:scale-95 transition-all flex items-center justify-center gap-2 text-xs">
          <span class="text-base">🍽️</span>
          <span>+ Registra Pasto con Ingredienti</span>
        </button>
        <button id="btn-open-history" class="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold py-2.5 px-3.5 rounded-xl shadow-xs active:scale-95 transition-all flex items-center gap-1.5 text-xs">
          <span>📖</span>
          <span>Storico</span>
        </button>
      </div>

      <!-- Pasti Registrati Oggi (IndexedDB) -->
      <section class="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs">
        <div class="flex justify-between items-center mb-2.5">
          <h3 class="text-xs font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
            📋 Pasti Consumati Oggi
          </h3>
          <span id="today-meals-count" class="text-[11px] text-gray-400 font-semibold">0 pasti</span>
        </div>
        <div id="today-meals-list" class="space-y-2 text-xs">
          <p class="text-gray-400 italic py-2 text-center">Nessun pasto ancora registrato oggi.</p>
        </div>
      </section>

      <!-- Suggerimenti & Cronologia -->
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
          Incrocio tra frequenza settimanale e alimenti assenti nei giorni T-5, T-6, T-7:
        </p>
        <div id="suggestions-box" class="flex flex-wrap gap-1.5 mb-2"></div>
        <div id="history-box" class="space-y-1 text-xs text-gray-600 pt-2 border-t border-emerald-100"></div>
      </section>

      <!-- Griglia Rapida Pranzo -->
      <section>
        <div class="flex justify-between items-center mb-2">
          <h3 class="text-sm font-bold text-gray-800 flex items-center gap-1.5">☀️ Tap Rapido Pranzo</h3>
          <span class="text-[11px] text-gray-400">1 tap aggiunge al diario</span>
        </div>
        <div id="pranzo-grid" class="grid grid-cols-2 sm:grid-cols-3 gap-2"></div>
      </section>

      <!-- Griglia Rapida Cena -->
      <section>
        <div class="flex justify-between items-center mb-2">
          <h3 class="text-sm font-bold text-gray-800 flex items-center gap-1.5">🌙 Tap Rapido Cena</h3>
          <span class="text-[11px] text-gray-400">1 tap aggiunge al diario</span>
        </div>
        <div id="cena-grid" class="grid grid-cols-2 sm:grid-cols-3 gap-2"></div>
      </section>

      <!-- Strumenti Rapidi / Dati Demo -->
      <div class="pt-4 border-t border-gray-200 flex flex-wrap gap-2 justify-between items-center text-xs text-gray-500">
        <span>Dati memorizzati 100% in locale nel browser.</span>
        <button id="btn-seed-demo" class="text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg font-semibold border border-emerald-200 active:scale-95 transition-all">
          🧪 Carica Dati Demo
        </button>
      </div>

    </div>

    <!-- Modale Compositore Pasto da Catalogo Alimenti -->
    <dialog id="meal-composer-modal" class="w-11/12 max-w-lg rounded-2xl p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm shadow-2xl m-auto">
      <div class="p-5 bg-white max-h-[85vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-3 pb-2 border-b">
          <h3 class="text-base font-bold text-gray-800">🍽️ Registra Pasto con Ingredienti</h3>
          <button id="btn-close-meal-composer" class="bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full w-7 h-7 flex items-center justify-center font-bold">✕</button>
        </div>

        <form id="form-meal-composer" class="space-y-3.5 text-xs">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Tipo di Pasto</label>
              <select id="composer-meal-type" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50">
                ${MEAL_TYPES.map(m => `<option value="${m.id}">${m.icon} ${m.label}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Orario Pasto</label>
              <input type="datetime-local" id="composer-meal-time" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50">
            </div>
          </div>

          <div class="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-xl">
            <input type="checkbox" id="composer-eating-out" class="accent-emerald-600 rounded">
            <label for="composer-eating-out" class="cursor-pointer text-[11px] font-medium text-gray-700">
              Mangiato fuori casa / Ingredienti stimati
            </label>
          </div>

          <!-- Selezione Alimenti dal Catalogo -->
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Cerca e Aggiungi Alimento dal Catalogo</label>
            <div class="relative">
              <input type="search" id="composer-search-food" placeholder="Digita per cercare un alimento..." class="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl">
              <span class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400">🔍</span>
            </div>
            <div id="composer-search-results" class="max-h-36 overflow-y-auto divide-y divide-gray-100 bg-white border border-gray-200 rounded-xl mt-1 hidden shadow-sm"></div>
          </div>

          <!-- Ingredienti Aggiunti al Pasto -->
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Ingredienti di questo pasto (<span id="items-count">0</span>)</label>
            <div id="composer-selected-items" class="space-y-1.5 p-2 bg-gray-50 border border-gray-200 rounded-xl min-h-[60px]">
              <p class="text-gray-400 italic text-center py-2 text-[11px]">Nessun ingrediente ancora aggiunto. Cerca sopra per inserire alimenti.</p>
            </div>
          </div>

          <div>
            <label class="block font-semibold text-gray-700 mb-1">Note Libere (opzionali)</label>
            <input type="text" id="composer-notes" placeholder="Es. cottura in padella, condito con olio extravergine..." class="w-full p-2 border border-gray-200 rounded-lg">
          </div>

          <div class="pt-2 flex gap-2">
            <button type="button" id="btn-cancel-composer" class="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold">
              Annulla
            </button>
            <button type="submit" class="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs active:scale-95 transition-all">
              Salva Pasto
            </button>
          </div>
        </form>
      </div>
    </dialog>

    <!-- Modal Sintomi Rapido -->
    <dialog id="symptom-modal" class="w-11/12 max-w-md rounded-2xl p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm shadow-2xl m-auto">
      <div class="p-5 bg-white">
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
              <label for="input-pain">Dolore Addominale (0-10)</label>
              <span id="val-pain" class="text-emerald-600 font-bold">0</span>
            </div>
            <input type="range" id="input-pain" min="0" max="10" value="0" class="w-full accent-emerald-600">
          </div>

          <div>
            <div class="flex justify-between font-semibold text-gray-700 mb-1">
              <label for="input-bloat">Gonfiore (0-10)</label>
              <span id="val-bloat" class="text-emerald-600 font-bold">0</span>
            </div>
            <input type="range" id="input-bloat" min="0" max="10" value="0" class="w-full accent-emerald-600">
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
            <label class="block font-semibold text-gray-700 mb-1">Note o Fattori Concomitanti</label>
            <input type="text" id="input-notes" placeholder="Es. stress alto, cena fuori casa..." class="w-full p-2 border rounded-lg bg-gray-50">
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
          <h3 class="text-base font-bold text-gray-800">Storico Pasti Registrati</h3>
          <button id="btn-close-history" class="bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full w-7 h-7 flex items-center justify-center font-bold">✕</button>
        </div>
        <div id="full-history-list" class="max-h-[60vh] overflow-y-auto space-y-2 text-xs"></div>
      </div>
    </dialog>
  `;

  // Aggiorna data odierna nella testata
  const now = new Date();
  document.getElementById('date-display').textContent = now.toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  // Renderizzazione componenti
  function renderAll() {
    renderGrids();
    renderMealToggle();
    renderAlgorithm();
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
    const pGrid = document.getElementById('pranzo-grid');
    const cGrid = document.getElementById('cena-grid');
    if (!pGrid || !cGrid) return;

    pGrid.innerHTML = renderGridHTML('pranzo');
    cGrid.innerHTML = renderGridHTML('cena');

    rootElement.querySelectorAll('[data-action="add"]').forEach(btn => {
      btn.onclick = () => handleAddFood(btn.dataset.meal, btn.dataset.foodId);
    });
    rootElement.querySelectorAll('[data-action="remove"]').forEach(btn => {
      btn.onclick = () => handleRemoveFood(btn.dataset.meal, btn.dataset.foodId);
    });
  }

  function renderGridHTML(meal) {
    const foods = foodsForMeal(meal);
    if (foods.length === 0) {
      return `
        <p class="col-span-full text-center text-xs text-gray-400 italic py-3">
          Nessun alimento con budget per questo pasto.
          <a href="#alimenti" class="text-emerald-600 font-bold underline">Aggiungi un alimento</a>
        </p>`;
    }
    return foods.map(food => createCardHTML(meal, food)).join('');
  }

  function createCardHTML(meal, food) {
    const remaining = getRemaining(meal, food);
    let bg = "bg-white border-gray-200";
    let text = "text-gray-800";
    let badge = "bg-emerald-100 text-emerald-700";

    if (remaining === 0) {
      bg = "bg-gray-50 border-gray-200 opacity-60";
      badge = "bg-gray-200 text-gray-500";
    } else if (remaining < 0) {
      bg = "bg-red-50 border-red-300";
      text = "text-red-700";
      badge = "bg-red-200 text-red-800";
    }

    const safeId = escapeHtml(food.id);

    return `
      <div class="border rounded-xl p-2.5 shadow-2xs relative flex flex-col justify-between ${bg} transition-all">
        <div class="flex justify-between items-start mb-1">
          <span class="text-xl">${escapeHtml(food.budget?.emoji || '🍽️')}</span>
          <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full ${badge}">
            ${remaining < 0 ? 'Sforato' : 'Rimasti'}: ${remaining}
          </span>
        </div>
        <div class="font-semibold text-xs mb-1.5 leading-tight truncate ${text}">${escapeHtml(foodLabel(food))}</div>
        <div class="flex gap-1.5">
          <button data-action="remove" data-meal="${meal}" data-food-id="${safeId}" class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-1 rounded-lg text-xs font-bold active:scale-95 transition-transform">-</button>
          <button data-action="add" data-meal="${meal}" data-food-id="${safeId}" class="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white py-1 rounded-lg text-xs font-bold shadow-2xs active:scale-95 transition-transform">+</button>
        </div>
      </div>
    `;
  }

  function renderAlgorithm() {
    const currentMeal = appState.activeMeal || 'pranzo';
    const pastEaten = new Set();
    let historyHTML = "";
    const foodById = new Map(budgetFoods.map(f => [f.id, f]));

    [5, 6, 7].forEach(days => {
      let d = new Date();
      d.setDate(d.getDate() - days);
      const dateStr = getLocalISODate(d);
      const record = appState.history[dateStr];

      let text = "Nessun dato";
      if (record) {
        const allEaten = [...(record.pranzo || []), ...(record.cena || [])].map(id => {
          pastEaten.add(id);
          const food = foodById.get(id);
          return food ? foodLabel(food) : 'Alimento rimosso';
        });
        if (allEaten.length > 0) text = allEaten.join(", ");
      }
      historyHTML += `<div class="grid grid-cols-[35px_1fr] gap-1 text-[11px]"><span class="font-bold text-gray-400">T-${days}</span> <span class="truncate">${escapeHtml(text)}</span></div>`;
    });

    const hBox = document.getElementById('history-box');
    if (hBox) hBox.innerHTML = historyHTML;

    const suggestions = [];
    foodsForMeal(currentMeal).forEach(food => {
      const remaining = getRemaining(currentMeal, food);
      if (remaining > 0 && !pastEaten.has(food.id)) {
        suggestions.push(`<span class="bg-white border border-emerald-200 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-2xs">${escapeHtml(food.budget?.emoji || '')} ${escapeHtml(foodLabel(food))}</span>`);
      }
    });

    const sBox = document.getElementById('suggestions-box');
    if (sBox) {
      sBox.innerHTML = suggestions.length > 0
        ? suggestions.join("")
        : `<span class="text-xs italic text-emerald-600">Nessuna priorità specifica, segui il budget rimasto.</span>`;
    }
  }

  // Lista pasti odierni salvati in IndexedDB
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

      countSpan.textContent = `${todayMeals.length} pasti`;

      if (todayMeals.length === 0) {
        listDiv.innerHTML = '<p class="text-gray-400 italic py-2 text-center text-xs">Nessun pasto ancora registrato oggi.</p>';
        return;
      }

      listDiv.innerHTML = todayMeals.map(m => {
        const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
        const typeObj = MEAL_TYPES.find(t => t.id === m.mealType) || { label: m.mealType, icon: '🍽️' };
        const items = m.items || [];
        const itemsNames = items.map(i => `${escapeHtml(i.foodName)} (${i.consumedPortion?.amount || 1}${escapeHtml(i.consumedPortion?.unit || 'porz')})`).join(', ');

        return `
          <div class="p-2.5 bg-gray-50 border border-gray-100 rounded-xl flex justify-between items-start gap-2">
            <div>
              <div class="flex items-center gap-1.5">
                <span class="text-sm">${typeObj.icon}</span>
                <span class="font-bold text-gray-800 text-xs">${typeObj.label}</span>
                <span class="text-[10px] text-gray-400 font-medium">ore ${timeStr}</span>
                ${m.isEatingOut ? '<span class="text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-bold">fuori casa</span>' : ''}
              </div>
              <p class="text-[11px] text-gray-600 mt-0.5">${itemsNames || 'Nessun ingrediente'}</p>
              ${m.notes ? `<p class="text-[10px] text-gray-400 italic mt-0.5">${escapeHtml(m.notes)}</p>` : ''}
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.warn('Errore lettura pasti odierni:', e);
    }
  }

  // Aggiunta pasto rapido dai bottoni del tracker
  async function handleAddFood(meal, foodId) {
    const food = budgetFoods.find(f => f.id === foodId);
    if (!food) return;

    registerConsumption(meal, foodId);
    saveLocalState();
    renderAll();

    // Persistenza nello store `meals`
    try {
      const portion = food.tolerance?.maxToleratedPortion || { amount: 100, unit: 'g' };
      const mealRecord = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        mealType: MEAL_SLOT[meal],
        isEatingOut: false,
        notes: '',
        items: [{
          foodId: food.id,
          foodName: food.name,
          fodmapGroupsSnapshot: food.primaryFodmapGroup || ['LOW_FODMAP_SAFE'],
          consumedPortion: { amount: portion.amount || 100, unit: portion.unit || 'g' },
          preparationUsed: 'standard',
          isEstimated: false
        }]
      };
      await addRecord('meals', mealRecord);
      refreshTodayMeals();
    } catch (err) {
      console.warn('Errore salvataggio pasto in IndexedDB:', err);
    }
  }

  function handleRemoveFood(meal, foodId) {
    if (appState.consumedThisWeek[meal]?.[foodId] > 0) {
      appState.consumedThisWeek[meal][foodId]--;
    }
    const today = getLocalISODate();
    const todayArr = appState.history[today]?.[meal] || [];
    const index = todayArr.lastIndexOf(foodId);
    if (index > -1) todayArr.splice(index, 1);

    saveLocalState();
    renderAll();
  }

  // Toggle meal
  document.getElementById('toggle-pranzo')?.addEventListener('click', () => {
    appState.activeMeal = 'pranzo';
    saveLocalState();
    renderAll();
  });
  document.getElementById('toggle-cena')?.addEventListener('click', () => {
    appState.activeMeal = 'cena';
    saveLocalState();
    renderAll();
  });

  // Modal Compositore Pasto con Ingredienti dal Catalogo
  const composerModal = document.getElementById('meal-composer-modal');
  const searchInput = document.getElementById('composer-search-food');
  const searchResultsDiv = document.getElementById('composer-search-results');
  const selectedItemsDiv = document.getElementById('composer-selected-items');
  const itemsCountSpan = document.getElementById('items-count');
  let composerSelectedItems = [];

  document.getElementById('btn-open-meal-composer')?.addEventListener('click', () => {
    composerSelectedItems = [];
    renderComposerSelectedItems();
    searchInput.value = '';
    searchResultsDiv.classList.add('hidden');
    document.getElementById('composer-notes').value = '';
    document.getElementById('composer-eating-out').checked = false;

    // Imposta orario attuale formattato per datetime-local (YYYY-MM-DDTHH:mm)
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const localDateTime = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    document.getElementById('composer-meal-time').value = localDateTime;

    composerModal.showModal();
  });

  document.getElementById('btn-close-meal-composer')?.addEventListener('click', () => composerModal.close());
  document.getElementById('btn-cancel-composer')?.addEventListener('click', () => composerModal.close());
  composerModal.addEventListener('click', (e) => { if (e.target === composerModal) composerModal.close(); });

  // Ricerca alimenti nel catalogo per il compositore
  let searchTimeout = null;
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if (!q) {
      searchResultsDiv.classList.add('hidden');
      return;
    }

    searchTimeout = setTimeout(async () => {
      const foods = await getFoods({ searchQuery: q });
      if (foods.length === 0) {
        searchResultsDiv.innerHTML = `
          <div class="p-3 text-center text-gray-400 text-xs">
            Nessun alimento con questo nome nel catalogo.
            <a href="#alimenti" class="text-emerald-600 block mt-1 font-bold underline">+ Crea nuovo in Alimenti</a>
          </div>
        `;
      } else {
        searchResultsDiv.innerHTML = foods.map((f, index) => `
          <div class="p-2.5 hover:bg-emerald-50 cursor-pointer flex justify-between items-center composer-search-item" data-index="${index}">
            <div>
              <span class="font-bold text-gray-800 text-xs">${escapeHtml(f.name)}</span>
              <span class="text-[10px] text-gray-400 block">${escapeHtml((f.primaryFodmapGroup || []).join(', '))}</span>
            </div>
            <span class="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-1 rounded-md">+ Aggiungi</span>
          </div>
        `).join('');

        searchResultsDiv.querySelectorAll('.composer-search-item').forEach(el => {
          el.addEventListener('click', () => {
            const f = foods[parseInt(el.dataset.index, 10)];
            if (!f) return;
            const portion = f.tolerance?.maxToleratedPortion || { amount: 100, unit: 'g' };
            composerSelectedItems.push({
              foodId: f.id,
              foodName: f.name,
              fodmapGroupsSnapshot: f.primaryFodmapGroup || ['LOW_FODMAP_SAFE'],
              consumedPortion: { amount: portion.amount || 100, unit: portion.unit || 'g' },
              preparationUsed: 'standard',
              isEstimated: false
            });
            renderComposerSelectedItems();
            searchInput.value = '';
            searchResultsDiv.classList.add('hidden');
          });
        });
      }
      searchResultsDiv.classList.remove('hidden');
    }, 200);
  });

  function renderComposerSelectedItems() {
    itemsCountSpan.textContent = composerSelectedItems.length;
    if (composerSelectedItems.length === 0) {
      selectedItemsDiv.innerHTML = `<p class="text-gray-400 italic text-center py-2 text-[11px]">Nessun ingrediente ancora aggiunto. Cerca sopra per inserire alimenti.</p>`;
      return;
    }

    selectedItemsDiv.innerHTML = composerSelectedItems.map((item, idx) => `
      <div class="flex items-center justify-between p-2 bg-white border border-gray-200 rounded-lg text-xs">
        <div class="flex-1 mr-2">
          <span class="font-bold text-gray-800">${escapeHtml(item.foodName)}</span>
          <span class="text-[10px] text-gray-400 block">${escapeHtml(item.fodmapGroupsSnapshot.join(', '))}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <input type="number" min="1" value="${item.consumedPortion.amount || 100}" class="w-16 p-1 border border-gray-200 rounded text-center text-xs font-semibold composer-item-amount" data-idx="${idx}">
          <span class="text-gray-500 text-xs">${escapeHtml(item.consumedPortion.unit || 'g')}</span>
          <button type="button" class="text-red-500 hover:text-red-700 font-bold px-1.5 py-0.5 ml-1 composer-remove-item" data-idx="${idx}">✕</button>
        </div>
      </div>
    `).join('');

    selectedItemsDiv.querySelectorAll('.composer-item-amount').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (composerSelectedItems[idx]) {
          composerSelectedItems[idx].consumedPortion.amount = parseInt(e.target.value, 10) || 100;
        }
      });
    });

    selectedItemsDiv.querySelectorAll('.composer-remove-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        composerSelectedItems.splice(idx, 1);
        renderComposerSelectedItems();
      });
    });
  }

  // Salvataggio form compositore
  document.getElementById('form-meal-composer')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (composerSelectedItems.length === 0) {
      alert("Aggiungi almeno un ingrediente per registrare il pasto.");
      return;
    }

    const mealType = document.getElementById('composer-meal-type').value;
    const timeVal = document.getElementById('composer-meal-time').value;
    const isEatingOut = document.getElementById('composer-eating-out').checked;
    const notes = document.getElementById('composer-notes').value.trim();

    const timestamp = timeVal ? new Date(timeVal).toISOString() : new Date().toISOString();

    const mealRecord = {
      id: uuidv4(),
      timestamp,
      mealType,
      isEatingOut,
      notes,
      items: composerSelectedItems.map(item => ({
        ...item,
        isEstimated: isEatingOut
      }))
    };

    try {
      await addRecord('meals', mealRecord);

      // Coerenza: un pasto del compositore consuma anche il budget settimanale degli alimenti con budget attivo.
      const meal = SLOT_MEAL[mealType];
      if (meal) {
        composerSelectedItems.forEach(item => {
          if (budgetFoods.some(f => f.id === item.foodId)) {
            registerConsumption(meal, item.foodId);
          }
        });
        saveLocalState();
        renderAll();
      }

      composerModal.close();
      await refreshTodayMeals();
      alert("Pasto registrato con successo nel diario!");
    } catch (err) {
      console.error("Errore salvataggio pasto compositore:", err);
      alert("Si è verificato un errore durante il salvataggio.");
    }
  });

  // History modal
  const histModal = document.getElementById('history-modal');
  document.getElementById('btn-open-history')?.addEventListener('click', async () => {
    const list = document.getElementById('full-history-list');
    if (!list) return;

    try {
      const allMeals = await getAll('meals');
      const sortedMeals = (allMeals || []).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

      if (sortedMeals.length === 0) {
        list.innerHTML = '<p class="text-gray-400 italic text-center py-4 text-xs">Nessun pasto registrato.</p>';
      } else {
        list.innerHTML = sortedMeals.map(m => {
          const dateObj = m.timestamp ? new Date(m.timestamp) : new Date();
          const dateStr = dateObj.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
          const timeStr = dateObj.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
          const typeObj = MEAL_TYPES.find(t => t.id === m.mealType) || { label: m.mealType, icon: '🍽️' };
          const itemsStr = (m.items || []).map(i => `${escapeHtml(i.foodName)} (${i.consumedPortion?.amount || 1}${escapeHtml(i.consumedPortion?.unit || 'porz')})`).join(', ');

          return `
            <div class="bg-gray-50 rounded-xl p-2.5 border border-gray-100 text-xs">
              <div class="flex justify-between items-center border-b border-gray-200 pb-1 mb-1.5">
                <span class="font-bold text-gray-700 capitalize">${typeObj.icon} ${typeObj.label} · ${dateStr} ${timeStr}</span>
                ${m.isEatingOut ? '<span class="text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-bold">fuori casa</span>' : ''}
              </div>
              <p class="text-gray-600">${itemsStr || 'Nessun ingrediente'}</p>
              ${m.notes ? `<p class="text-[10px] text-gray-400 italic mt-0.5">${escapeHtml(m.notes)}</p>` : ''}
            </div>
          `;
        }).join('');
      }
    } catch (e) {
      console.warn("Errore caricamento storico:", e);
    }

    histModal?.showModal();
  });

  document.getElementById('btn-close-history')?.addEventListener('click', () => histModal?.close());
  histModal?.addEventListener('click', (e) => { if (e.target === histModal) histModal.close(); });

  // Symptom modal & ranges
  const symModal = document.getElementById('symptom-modal');
  const painInput = document.getElementById('input-pain');
  const bloatInput = document.getElementById('input-bloat');
  const painVal = document.getElementById('val-pain');
  const bloatVal = document.getElementById('val-bloat');

  painInput?.addEventListener('input', () => { if (painVal) painVal.textContent = painInput.value; });
  bloatInput?.addEventListener('input', () => { if (bloatVal) bloatVal.textContent = bloatInput.value; });

  document.getElementById('btn-quick-symptom')?.addEventListener('click', () => symModal?.showModal());
  document.getElementById('btn-close-symptom')?.addEventListener('click', () => symModal?.close());
  symModal?.addEventListener('click', (e) => { if (e.target === symModal) symModal.close(); });

  document.getElementById('btn-no-symptoms')?.addEventListener('click', async () => {
    if (painInput) painInput.value = 0;
    if (bloatInput) bloatInput.value = 0;
    await saveSymptomData(0, 0, null, 'Nessun sintomo', true);
    symModal?.close();
  });

  document.getElementById('form-symptom')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pain = parseInt(painInput?.value || 0, 10);
    const bloat = parseInt(bloatInput?.value || 0, 10);
    const bristol = document.getElementById('input-bristol')?.value;
    const notes = document.getElementById('input-notes')?.value || '';

    await saveSymptomData(pain, bloat, bristol ? parseInt(bristol, 10) : null, notes, pain === 0 && bloat === 0);
    symModal?.close();
  });

  async function saveSymptomData(pain, bloat, bristol, notes, noSymptoms) {
    const timestamp = new Date().toISOString();
    try {
      const symRecord = {
        id: uuidv4(),
        timestamp,
        type: 'CHECKIN_OCCASIONALE',
        abdominalPainIntensity: pain,
        bloatingIntensity: bloat,
        noSymptomsFlag: noSymptoms,
        generalComparisonToBaseline: pain > 3 || bloat > 3 ? 'WORSE' : 'BETTER',
        notes: notes
      };
      await addRecord('symptoms', symRecord);

      if (bristol) {
        const bType = parseInt(bristol, 10);
        let urgencyEnum = 'NONE';
        if (bType >= 6) {
          urgencyEnum = 'SEVERE';
        } else if (bType === 5 || bType === 1) {
          urgencyEnum = 'MODERATE';
        }

        const bowelRecord = {
          id: uuidv4(),
          timestamp,
          bristolType: bType,
          urgency: urgencyEnum,
          painDuringDefecation: pain,
          straining: bType <= 2 ? 'MODERATE' : 'NORMAL',
          incompleteEvacuation: false,
          mucusPresent: false,
          notes: notes
        };
        await addRecord('bowel_events', bowelRecord);
      }

      alert('Check-in registrato con successo!');
    } catch (err) {
      console.error('Errore salvataggio sintomo:', err);
      alert('Errore nel salvataggio del sintomo.');
    }
  }

  // Demo seeder
  document.getElementById('btn-seed-demo')?.addEventListener('click', async () => {
    if (!confirm('Vuoi generare 14 giorni di dati demo realistici (pasti + sintomi + challenge) per testare grafici e report?')) return;
    await seedDemoData();
    alert('Dati demo caricati! Ora puoi aprire "Progressi & Report" per visualizzare le analisi e generare il PDF o CSV.');
    location.hash = '#progressi';
  });

  // Render iniziale
  renderAll();
}

/** Generatore di dati demo realistici per testare la Fase 3 */
async function seedDemoData() {
  const now = new Date();

  const sampleFoods = [
    { id: 'pasta_frumento', name: 'Pasta di grano', fodmap: ['FRUCTANS_GRAIN'] },
    { id: 'riso_basmati', name: 'Riso basmati', fodmap: ['LOW_FODMAP_SAFE'] },
    { id: 'pollo_griglia', name: 'Petto di pollo', fodmap: ['LOW_FODMAP_SAFE'] },
    { id: 'cipolla_soffritto', name: 'Soffritto con cipolla', fodmap: ['FRUCTANS_VEG_GARLIC'] },
    { id: 'latte_vaccino', name: 'Latte vaccino', fodmap: ['LACTOSE'] },
    { id: 'mozzarella', name: 'Mozzarella', fodmap: ['LACTOSE'] },
    { id: 'mela_fuji', name: 'Mela Fuji', fodmap: ['EXCESS_FRUCTOSE', 'SORBITOL'] },
    { id: 'fagioli_borlotti', name: 'Fagioli borlotti', fodmap: ['GOS'] },
    { id: 'salmone', name: 'Salmone al forno', fodmap: ['LOW_FODMAP_SAFE'] },
    { id: 'funghi_champignon', name: 'Funghi champignon', fodmap: ['MANNITOL'] },
  ];

  for (let i = 14; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);

    const lunchTime = new Date(d);
    lunchTime.setHours(13, 0, 0, 0);

    const hasTrigger = i % 3 === 0;
    const food1 = sampleFoods[i % 2 === 0 ? 0 : 3];
    const food2 = sampleFoods[2];

    const mealRecord = {
      id: uuidv4(),
      timestamp: lunchTime.toISOString(),
      mealType: 'LUNCH',
      isEatingOut: i % 4 === 0,
      items: [
        {
          foodId: food1.id,
          foodName: food1.name,
          fodmapGroupsSnapshot: food1.fodmap,
          consumedPortion: { amount: 100, unit: 'g' },
          preparationUsed: 'cotto',
          isEstimated: false
        },
        {
          foodId: food2.id,
          foodName: food2.name,
          fodmapGroupsSnapshot: food2.fodmap,
          consumedPortion: { amount: 150, unit: 'g' },
          preparationUsed: 'griglia',
          isEstimated: false
        }
      ]
    };
    await addRecord('meals', mealRecord);

    const symTime = new Date(d);
    symTime.setHours(17, 0, 0, 0);

    const pain = hasTrigger ? (4 + (i % 4)) : (i % 2);
    const bloat = hasTrigger ? (5 + (i % 4)) : (i % 3);

    await addRecord('symptoms', {
      id: uuidv4(),
      timestamp: symTime.toISOString(),
      type: 'CHECKIN_POST_PASTO',
      abdominalPainIntensity: pain,
      bloatingIntensity: bloat,
      noSymptomsFlag: pain === 0 && bloat === 0,
      generalComparisonToBaseline: pain > 3 ? 'WORSE' : 'BETTER'
    });

    const bowelTime = new Date(d);
    bowelTime.setHours(8, 30, 0, 0);
    const bristol = hasTrigger ? 6 : 4;
    await addRecord('bowel_events', {
      id: uuidv4(),
      timestamp: bowelTime.toISOString(),
      bristolType: bristol,
      urgency: bristol >= 6 ? 'SEVERE' : 'NONE',
      painDuringDefecation: hasTrigger ? 4 : 0,
      straining: 'NORMAL',
      incompleteEvacuation: false,
      mucusPresent: false
    });
  }
}
