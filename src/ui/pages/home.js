/**
 * src/ui/pages/home.js
 *
 * Home di Fudy: diario rapido a card.
 * Un tap su + registra UNA occorrenza dell'alimento in IndexedDB;
 * un tap su - elimina l'ultima registrazione di quell'alimento di oggi.
 * Ogni card mostra un bollino consumato/limite con barra di avanzamento.
 */

import { addRecord, deleteRecord, uuidv4, getAll } from '../../infrastructure/storage/db.js';
import { getProfile } from '../../infrastructure/storage/userProfile.js';

const MEAL_TYPES = [
  { id: 'BREAKFAST', label: 'Colazione', icon: '☕' },
  { id: 'LUNCH', label: 'Pranzo', icon: '☀️' },
  { id: 'SNACK', label: 'Spuntino', icon: '🍎' },
  { id: 'DINNER', label: 'Cena', icon: '🌙' },
];

const MEAL_KEY_TO_TYPE = { pranzo: 'LUNCH', cena: 'DINNER' };
const MEAL_TYPE_TO_KEY = { LUNCH: 'pranzo', DINNER: 'cena' };

const BUDGET = {
  pranzo: {
    carne_bianca: { label: "Carne Bianca", emoji: "🍗", limit: 3, fodmap: ['LOW_FODMAP_SAFE'] },
    uovo_pranzo: { label: "Uova", emoji: "🥚", limit: 2, fodmap: ['LOW_FODMAP_SAFE'] },
    mozzarella: { label: "Mozzarella", emoji: "🧀", limit: 1, fodmap: ['LACTOSE'] },
    gamberi_calamari: { label: "Gamberi/Cal.", emoji: "🦐", limit: 1, fodmap: ['LOW_FODMAP_SAFE'] },
    pasta_frumento: { label: "Pasta Tradiz.", emoji: "🍝", limit: 2, fodmap: ['FRUCTANS_GRAIN'] },
    legumi_misti: { label: "Legumi", emoji: "🫘", limit: 1, fodmap: ['GOS'] }
  },
  cena: {
    pesce_magro: { label: "Pesce Magro", emoji: "🐟", limit: 2, fodmap: ['LOW_FODMAP_SAFE'] },
    pesce_azzurro: { label: "Pesce Azzurro", emoji: "🎣", limit: 1, fodmap: ['LOW_FODMAP_SAFE'] },
    salmone_fresco: { label: "Salmone Fresco", emoji: "🍣", limit: 2, fodmap: ['LOW_FODMAP_SAFE'] },
    salmone_affumicato: { label: "Salm. Affum.", emoji: "🥓", limit: 1, fodmap: ['LOW_FODMAP_SAFE'], sharedGroup: 'salmone' },
    carne_rossa: { label: "Carne Rossa", emoji: "🥩", limit: 1, fodmap: ['LOW_FODMAP_SAFE'] },
    uovo_cena: { label: "Uova", emoji: "🥚", limit: 1, fodmap: ['LOW_FODMAP_SAFE'] },
    mela_frutta: { label: "Mela / Pera", emoji: "🍎", limit: 1, fodmap: ['EXCESS_FRUCTOSE', 'SORBITOL'] },
    funghi_verdure: { label: "Funghi / Cavolf.", emoji: "🍄", limit: 1, fodmap: ['MANNITOL'] }
  }
};

// Il salmone fresco condivide il tetto settimanale (2) con quello affumicato.
const SHARED_GROUPS = {
  salmone: { foods: ['salmone_fresco', 'salmone_affumicato'], limit: 2, meal: 'cena' }
};

const HISTORY_RETENTION_DAYS = 90;

let appState = {
  weekMondayId: "",
  consumedThisWeek: { pranzo: {}, cena: {} },
  history: {},
  activeMeal: null
};

// -- Date helper --

function getLocalISODate(d = new Date()) {
  return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
}

function getMondayString(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return getLocalISODate(new Date(date.setDate(diff)));
}

// -- Stato locale (cache dei contatori; il diario vero è in IndexedDB) --

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
  if (!appState.history[today]) appState.history[today] = { pranzo: [], cena: [] };
  if (!appState.activeMeal) appState.activeMeal = new Date().getHours() < 15 ? 'pranzo' : 'cena';

  const cutoff = getLocalISODate(new Date(Date.now() - HISTORY_RETENTION_DAYS * 86400000));
  Object.keys(appState.history).forEach(date => {
    if (date < cutoff) delete appState.history[date];
  });

  saveLocalState();
}

/**
 * Aggiorna i contatori locali dopo che IndexedDB ha confermato la scrittura.
 * delta = +1 (aggiunta) oppure -1 (rimozione). dateKey = data della registrazione.
 */
function applyLocalDelta(meal, foodId, delta, dateKey = getLocalISODate()) {
  if (!appState.consumedThisWeek[meal]) appState.consumedThisWeek[meal] = {};
  const current = appState.consumedThisWeek[meal][foodId] || 0;
  appState.consumedThisWeek[meal][foodId] = Math.max(0, current + delta);

  if (!appState.history[dateKey]) appState.history[dateKey] = { pranzo: [], cena: [] };
  if (delta > 0) {
    appState.history[dateKey][meal].push(foodId);
  } else {
    const arr = appState.history[dateKey][meal];
    const index = arr.lastIndexOf(foodId);
    if (index > -1) arr.splice(index, 1);
  }
  saveLocalState();
}

// -- Budget: unico punto di verità per bollino, rimasti e suggerimenti --

/**
 * Restituisce { consumed, limit, remaining, isShared } per la card.
 * consumed/limit alimentano il bollino; remaining i colori e i suggerimenti.
 */
function getBudgetState(meal, foodId, config) {
  const counts = appState.consumedThisWeek[meal] || {};
  const ownConsumed = counts[foodId] || 0;
  const limit = Math.max(0, Number(config.limit) || 0);

  const group = config.sharedGroup ? SHARED_GROUPS[config.sharedGroup] : null;
  if (group) {
    const groupTotal = group.foods.reduce((sum, id) => sum + (counts[id] || 0), 0);
    return {
      consumed: groupTotal,
      limit: group.limit,
      remaining: Math.min(limit - ownConsumed, group.limit - groupTotal),
      isShared: true
    };
  }

  return { consumed: ownConsumed, limit, remaining: limit - ownConsumed, isShared: false };
}

// -- Record rapidi: scrittura e cancellazione speculare in IndexedDB --

function buildQuickRecord(meal, foodId, when = new Date()) {
  const config = BUDGET[meal][foodId];
  return {
    id: uuidv4(),
    timestamp: when.toISOString(),
    mealType: MEAL_KEY_TO_TYPE[meal],
    isEatingOut: false,
    notes: '',
    source: 'QUICK_TAP',
    items: [{
      foodId,
      foodName: config.label,
      fodmapGroupsSnapshot: config.fodmap,
      occurrences: 1
    }]
  };
}

/**
 * Trova l'ultima registrazione di oggi di quel foodId per quel pasto.
 * Serve a rendere il tasto - l'inverso esatto del tasto +.
 */
async function findLatestQuickRecord(meal, foodId) {
  const today = getLocalISODate();
  const mealType = MEAL_KEY_TO_TYPE[meal];
  const allMeals = await getAll('meals');
  return (allMeals || [])
    .filter(m => m.timestamp && m.timestamp.startsWith(today) && m.mealType === mealType
      && m.source === 'QUICK_TAP'
      && (m.items || []).some(i => i.foodId === foodId))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] || null;
}

/**
 * Elimina un record pasto e, se appartiene alla settimana corrente e deriva
 * da un tap rapido, aggiorna anche i contatori locali della card.
 */
async function deleteMealRecord(record) {
  await deleteRecord('meals', record.id);
  if (record.source !== 'QUICK_TAP' || !record.timestamp) return;

  const meal = MEAL_TYPE_TO_KEY[record.mealType];
  const item = (record.items || [])[0];
  if (!meal || !item || !BUDGET[meal]?.[item.foodId]) return;

  const recordWeek = getMondayString(new Date(record.timestamp));
  if (recordWeek !== appState.weekMondayId) return;

  applyLocalDelta(meal, item.foodId, -1, getLocalISODate(new Date(record.timestamp)));
}

// -- Pagina --

export async function render(rootElement) {
  loadLocalState();
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

      <section>
        <div class="flex justify-between items-center mb-2">
          <h3 class="text-sm font-bold text-gray-800 flex items-center gap-1.5">☀️ Tap Rapido Pranzo</h3>
          <span class="text-[11px] text-gray-400">+ aggiunge, − toglie l'ultimo</span>
        </div>
        <div id="pranzo-grid" class="grid grid-cols-2 sm:grid-cols-3 gap-2"></div>
      </section>

      <section>
        <div class="flex justify-between items-center mb-2">
          <h3 class="text-sm font-bold text-gray-800 flex items-center gap-1.5">🌙 Tap Rapido Cena</h3>
          <span class="text-[11px] text-gray-400">+ aggiunge, − toglie l'ultimo</span>
        </div>
        <div id="cena-grid" class="grid grid-cols-2 sm:grid-cols-3 gap-2"></div>
      </section>

      <div class="pt-4 border-t border-gray-200 flex flex-wrap gap-2 justify-between items-center text-xs text-gray-500">
        <span>Dati memorizzati 100% in locale nel browser.</span>
        <button id="btn-seed-demo" class="text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg font-semibold border border-emerald-200 active:scale-95 transition-all">
          🧪 Carica Dati Demo
        </button>
      </div>

    </div>

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
    const pGrid = document.getElementById('pranzo-grid');
    const cGrid = document.getElementById('cena-grid');
    if (!pGrid || !cGrid) return;

    pGrid.innerHTML = Object.entries(BUDGET.pranzo).map(([id, config]) => createCardHTML('pranzo', id, config)).join('');
    cGrid.innerHTML = Object.entries(BUDGET.cena).map(([id, config]) => createCardHTML('cena', id, config)).join('');

    rootElement.querySelectorAll('[data-action="add"]').forEach(btn => {
      btn.onclick = () => handleAddFood(btn.dataset.meal, btn.dataset.foodId);
    });
    rootElement.querySelectorAll('[data-action="remove"]').forEach(btn => {
      btn.onclick = () => handleRemoveFood(btn.dataset.meal, btn.dataset.foodId);
    });
  }

  function createCardHTML(meal, foodId, config) {
    const state = getBudgetState(meal, foodId, config);
    const { consumed, limit, remaining, isShared } = state;
    const progress = limit > 0 ? Math.min((consumed / limit) * 100, 100) : 100;

    let bg = "bg-white border-gray-200";
    let text = "text-gray-800";
    let badge = "bg-emerald-100 text-emerald-700";
    let bar = "bg-emerald-500";
    let statusLabel = `${consumed}/${limit}`;

    if (remaining === 0) {
      bg = "bg-gray-50 border-gray-200 opacity-80";
      badge = "bg-gray-200 text-gray-600";
      bar = "bg-gray-400";
      statusLabel = `${consumed}/${limit} ✓`;
    } else if (remaining < 0) {
      bg = "bg-red-50 border-red-300";
      text = "text-red-700";
      badge = "bg-red-200 text-red-800";
      bar = "bg-red-500";
      statusLabel = `${consumed}/${limit} +${Math.abs(remaining)}`;
    }

    const ariaLabel =
      `${config.label}: consumati ${consumed} su ${limit}${isShared ? ' (budget condiviso col gruppo salmone)' : ''}; ` +
      `${remaining >= 0 ? `ne rimangono ${remaining}` : `sforato di ${Math.abs(remaining)}`}`;

    return `
      <div class="border rounded-xl p-2.5 shadow-2xs relative flex flex-col justify-between ${bg} transition-all">
        <div class="flex justify-between items-center gap-2 mb-1">
          <span class="text-xl" aria-hidden="true">${config.emoji}</span>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${badge}"
                aria-label="${ariaLabel}" title="${ariaLabel}">
            ${statusLabel}
          </span>
        </div>
        <div class="h-1 rounded-full bg-black/10 overflow-hidden mb-1.5" aria-hidden="true">
          <div class="h-full ${bar} transition-all" style="width: ${progress}%"></div>
        </div>
        <div class="font-semibold text-xs mb-1.5 leading-tight truncate ${text}">${config.label}</div>
        <div class="flex gap-1.5">
          <button data-action="remove" data-meal="${meal}" data-food-id="${foodId}" aria-label="Rimuovi un ${config.label}"
                  class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-1 rounded-lg text-xs font-bold active:scale-95 transition-transform">−</button>
          <button data-action="add" data-meal="${meal}" data-food-id="${foodId}" aria-label="Aggiungi un ${config.label}"
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
        const allEaten = [...(record.pranzo || []), ...(record.cena || [])].map(id => {
          pastEaten.add(id);
          return BUDGET.pranzo[id]?.label || BUDGET.cena[id]?.label || id;
        });
        if (allEaten.length > 0) text = allEaten.join(", ");
      }
      historyHTML += `<div class="grid grid-cols-[35px_1fr] gap-1 text-[11px]"><span class="font-bold text-gray-400">T-${daysAgo}</span> <span class="truncate">${text}</span></div>`;
    });

    const hBox = document.getElementById('history-box');
    if (hBox) hBox.innerHTML = historyHTML;

    const suggestions = Object.entries(BUDGET[currentMeal] || {})
      .filter(([id, config]) => getBudgetState(currentMeal, id, config).remaining > 0 && !pastEaten.has(id))
      .map(([, config]) => `<span class="bg-white border border-emerald-200 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-2xs">${config.emoji} ${config.label}</span>`);

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
          await deleteMealRecord(record);
          renderAll();
        } catch (err) {
          console.warn('Errore eliminazione registrazione:', err);
          alert('Non sono riuscita a eliminare la registrazione. Riprova.');
        }
      };
    });
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

  async function handleAddFood(meal, foodId) {
    try {
      await addRecord('meals', buildQuickRecord(meal, foodId));
    } catch (err) {
      console.warn('Errore salvataggio consumo:', err);
      alert('Salvataggio non riuscito: riprova prima di aggiungere altro.');
      return;
    }
    applyLocalDelta(meal, foodId, +1);
    renderAll();
  }

  async function handleRemoveFood(meal, foodId) {
    let record;
    try {
      record = await findLatestQuickRecord(meal, foodId);
    } catch (err) {
      console.warn('Errore lettura registrazioni:', err);
      alert('Non riesco a leggere il diario: riprova.');
      return;
    }
    if (!record) return; // niente da togliere: card e diario restano coerenti

    try {
      await deleteMealRecord(record);
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
    saveLocalState();
    renderAll();
  });
  document.getElementById('toggle-cena')?.addEventListener('click', () => {
    appState.activeMeal = 'cena';
    saveLocalState();
    renderAll();
  });

  // -- Modal Sintomi --

  const symptomModal = document.getElementById('symptom-modal');
  const formSymptom = document.getElementById('form-symptom');
  const painInput = document.getElementById('input-pain');
  const bloatInput = document.getElementById('input-bloat');

  painInput?.addEventListener('input', () => {
    document.getElementById('val-pain').textContent = painInput.value;
  });
  bloatInput?.addEventListener('input', () => {
    document.getElementById('val-bloat').textContent = bloatInput.value;
  });

  document.getElementById('btn-quick-symptom')?.addEventListener('click', () => symptomModal.showModal());
  document.getElementById('btn-close-symptom')?.addEventListener('click', () => symptomModal.close());
  symptomModal?.addEventListener('click', (e) => { if (e.target === symptomModal) symptomModal.close(); });

  async function saveSymptom(pain, bloat, bristol, notes) {
    const timestamp = new Date().toISOString();
    await addRecord('symptoms', {
      id: uuidv4(),
      timestamp,
      type: 'CHECK_IN',
      abdominalPainIntensity: pain,
      bloatingIntensity: bloat,
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
  }

  formSymptom?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await saveSymptom(
        Number(painInput.value),
        Number(bloatInput.value),
        document.getElementById('input-bristol').value,
        document.getElementById('input-notes').value
      );
      formSymptom.reset();
      document.getElementById('val-pain').textContent = '0';
      document.getElementById('val-bloat').textContent = '0';
      symptomModal.close();
    } catch (err) {
      console.warn('Errore salvataggio sintomo:', err);
      alert('Salvataggio non riuscito: riprova.');
    }
  });

  document.getElementById('btn-no-symptoms')?.addEventListener('click', async () => {
    try {
      await saveSymptom(0, 0, '', '');
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
      const pranzoIds = Object.keys(BUDGET.pranzo);
      const cenaIds = Object.keys(BUDGET.cena);
      const pick = (arr, n) => arr.filter(() => Math.random() < 0.6).slice(0, n);

      for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
        const day = new Date();
        day.setDate(day.getDate() - daysAgo);
        const dateKey = getLocalISODate(day);

        for (const foodId of pick(pranzoIds, 2)) {
          const when = new Date(day); when.setHours(12, 30, 0, 0);
          await addRecord('meals', buildQuickRecord('pranzo', foodId, when));
          if (getMondayString(when) === appState.weekMondayId) applyLocalDelta('pranzo', foodId, +1, dateKey);
        }
        for (const foodId of pick(cenaIds, 2)) {
          const when = new Date(day); when.setHours(19, 45, 0, 0);
          await addRecord('meals', buildQuickRecord('cena', foodId, when));
          if (getMondayString(when) === appState.weekMondayId) applyLocalDelta('cena', foodId, +1, dateKey);
        }

        if (daysAgo % 2 === 0) {
          const whenS = new Date(day); whenS.setHours(21, 0, 0, 0);
          await addRecord('symptoms', {
            id: uuidv4(),
            timestamp: whenS.toISOString(),
            type: 'CHECK_IN',
            abdominalPainIntensity: Math.floor(Math.random() * 4),
            bloatingIntensity: Math.floor(Math.random() * 5),
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
