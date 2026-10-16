/**
 * src/ui/pages/alimenti.js
 *
 * Pagina "Catalogo Alimenti" di FODMAP Path.
 * Permette di:
 * 1. Cercare e filtrare alimenti per nome, categoria, gruppo FODMAP e tolleranza;
 * 2. Visualizzare la scheda alimento con porzione e gruppi associati;
 * 3. Inserire e modificare alimenti personalizzati;
 * 4. Importare direttamente un file JSON con il proprio database alimenti personale.
 */

import {
  getFoods,
  saveFood,
  archiveFood,
  importFoodsBatch,
  FODMAP_GROUPS,
  FOOD_CATEGORIES,
  TOLERANCE_STATUSES,
} from '../../domain/foods/foodService.js';

export async function render(rootElement) {
  let currentSearch = '';
  let currentCategory = 'ALL';
  let currentFodmap = 'ALL';
  let currentTolerance = 'ALL';
  let foodsList = [];

  rootElement.innerHTML = `
    <div class="alimenti-container max-w-2xl mx-auto px-4 py-4 space-y-4 pb-24">
      
      <!-- Testata Catalogo -->
      <div class="flex justify-between items-center">
        <div>
          <h2 class="text-xl font-bold text-emerald-700 leading-tight">Catalogo Alimenti</h2>
          <p class="text-xs text-gray-500">Archivio personale e mappa delle tolleranze</p>
        </div>
        <div class="flex gap-2">
          <button id="btn-import-foods" class="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-2 rounded-xl transition-all flex items-center gap-1">
            <span>📥</span>
            <span>Importa</span>
          </button>
          <button id="btn-new-food" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-xs active:scale-95 transition-all flex items-center gap-1">
            <span>+</span>
            <span>Nuovo</span>
          </button>
        </div>
      </div>

      <!-- Input file nascosto per importazione database JSON personale -->
      <input type="file" id="file-import-input" accept=".json" class="hidden">

      <!-- Barra di Ricerca -->
      <div class="relative">
        <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
          🔍
        </span>
        <input
          type="search"
          id="search-foods"
          placeholder="Cerca alimento (es. Riso, Mela, Avena...)"
          class="w-full pl-9 pr-4 py-2 text-xs bg-white border border-gray-200 rounded-xl shadow-2xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
      </div>

      <!-- Filtri Rapidi -->
      <div class="flex gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
        <select id="filter-category" class="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-700 text-xs font-medium">
          <option value="ALL">Tutte le Categorie</option>
          ${FOOD_CATEGORIES.map((c) => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join('')}
        </select>

        <select id="filter-fodmap" class="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-700 text-xs font-medium">
          <option value="ALL">Tutti i FODMAP</option>
          ${FODMAP_GROUPS.map((g) => `<option value="${g.id}">${g.label}</option>`).join('')}
        </select>

        <select id="filter-tolerance" class="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-700 text-xs font-medium">
          <option value="ALL">Tutte le Tolleranze</option>
          ${TOLERANCE_STATUSES.map((t) => `<option value="${t.id}">${t.label}</option>`).join('')}
        </select>
      </div>

      <!-- Contatore e Lista Alimenti -->
      <div>
        <div class="flex justify-between items-center mb-2 px-1 text-xs text-gray-400 font-medium">
          <span id="foods-count">Caricamento...</span>
        </div>
        <div id="foods-list-container" class="space-y-2"></div>
      </div>

    </div>

    <!-- Modale Inserimento / Modifica Alimento -->
    <dialog id="food-modal" class="w-11/12 max-w-lg rounded-2xl p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm shadow-2xl m-auto">
      <div class="p-5 bg-white max-h-[85vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-3 pb-2 border-b">
          <h3 id="food-modal-title" class="text-base font-bold text-gray-800">Nuovo Alimento</h3>
          <button id="btn-close-food-modal" class="bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full w-7 h-7 flex items-center justify-center font-bold">✕</button>
        </div>

        <form id="food-form" class="space-y-3.5 text-xs">
          <input type="hidden" id="food-edit-id">

          <!-- Nome e Sinonimi -->
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Nome Alimento *</label>
            <input type="text" id="food-name" required placeholder="Es. Mela Fuji, Pane di segale..." class="w-full p-2 border border-gray-200 rounded-lg">
          </div>

          <div>
            <label class="block font-semibold text-gray-700 mb-1">Sinonimi / Nomi alternativi (separati da virgola)</label>
            <input type="text" id="food-synonyms" placeholder="Es. mela rossa, fuji" class="w-full p-2 border border-gray-200 rounded-lg">
          </div>

          <!-- Categoria e Porzione -->
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Categoria</label>
              <select id="food-category" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50">
                ${FOOD_CATEGORIES.map((c) => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Porzione Consigliata</label>
              <div class="flex gap-1">
                <input type="number" id="food-portion-amount" value="100" min="1" class="w-2/3 p-2 border border-gray-200 rounded-lg">
                <select id="food-portion-unit" class="w-1/3 p-2 border border-gray-200 rounded-lg bg-gray-50">
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="pezzo">pz</option>
                  <option value="cucchiaio">cucch.</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Gruppi FODMAP (Checkbox multiple) -->
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Gruppi FODMAP Presenti</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2 bg-gray-50 border border-gray-200 rounded-xl">
              ${FODMAP_GROUPS.map((g) => `
                <label class="inline-flex items-center gap-1.5 text-[11px] cursor-pointer">
                  <input type="checkbox" name="food-fodmap" value="${g.id}" class="accent-emerald-600 rounded">
                  <span>${g.label}</span>
                </label>
              `).join('')}
            </div>
          </div>

          <!-- Stato Tolleranza Personale -->
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Tolleranza Personale</label>
              <select id="food-tolerance" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50">
                ${TOLERANCE_STATUSES.map((t) => `<option value="${t.id}">${t.label}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Fonte Informazione</label>
              <select id="food-source" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50">
                <option value="USER_INPUT">Personale / Test mio</option>
                <option value="DIETITIAN_NOTE">Indicazione Dietista</option>
                <option value="FOOD_LABEL">Etichetta Prodotto</option>
                <option value="PUBLIC_LITERATURE">Studio / Tabella pubblica</option>
              </select>
            </div>
          </div>

          <!-- Note Personali -->
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Note Personali</label>
            <textarea id="food-notes" rows="2" placeholder="Es. tollerato solo cotto, evitare a stomaco vuoto..." class="w-full p-2 border border-gray-200 rounded-lg"></textarea>
          </div>

          <!-- Bottoni Azione -->
          <div class="pt-2 flex gap-2">
            <button type="button" id="btn-delete-food" class="hidden px-3 py-2 bg-red-50 text-red-600 rounded-xl font-semibold hover:bg-red-100">
              Elimina
            </button>
            <div class="flex-1 flex gap-2 justify-end">
              <button type="button" id="btn-cancel-food" class="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold">
                Annulla
              </button>
              <button type="submit" class="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs active:scale-95 transition-all">
                Salva Alimento
              </button>
            </div>
          </div>
        </form>
      </div>
    </dialog>
  `;

  const listContainer = document.getElementById('foods-list-container');
  const countDisplay = document.getElementById('foods-count');
  const foodModal = document.getElementById('food-modal');
  const foodForm = document.getElementById('food-form');

  // Caricamento e rendering lista alimenti
  async function refreshList() {
    foodsList = await getFoods({
      searchQuery: currentSearch,
      category: currentCategory,
      fodmapGroup: currentFodmap,
      toleranceStatus: currentTolerance,
    });

    countDisplay.textContent = `${foodsList.length} alimenti trovati`;

    if (foodsList.length === 0) {
      listContainer.innerHTML = `
        <div class="p-8 text-center bg-white border border-gray-200 rounded-2xl">
          <span class="text-3xl block mb-2">🍽️</span>
          <p class="font-bold text-gray-700 text-sm">Nessun alimento trovato</p>
          <p class="text-xs text-gray-400 mt-1 mb-4">
            ${currentSearch || currentCategory !== 'ALL' || currentFodmap !== 'ALL'
              ? 'Nessun risultato per i filtri selezionati.'
              : 'Il tuo catalogo è attualmente vuoto. Puoi aggiungere il tuo primo alimento o importare un database personale in formato JSON.'}
          </p>
          <button id="btn-empty-add" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition-all">
            + Aggiungi il primo alimento
          </button>
        </div>
      `;
      document.getElementById('btn-empty-add')?.addEventListener('click', openNewModal);
      return;
    }

    listContainer.innerHTML = foodsList.map((food) => {
      const catObj = FOOD_CATEGORIES.find((c) => c.id === food.category) || { icon: '🍽️', label: food.category };
      const tolObj = TOLERANCE_STATUSES.find((t) => t.id === (food.tolerance?.status || 'UNTESTED')) || TOLERANCE_STATUSES[0];
      const groups = food.primaryFodmapGroup || [];
      const portion = food.tolerance?.maxToleratedPortion;

      return `
        <div class="bg-white border border-gray-200 rounded-xl p-3 shadow-2xs hover:border-emerald-300 transition-all flex justify-between items-center cursor-pointer food-item-row" data-id="${food.id}">
          <div class="flex items-center gap-3">
            <span class="text-2xl">${catObj.icon}</span>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-gray-800 text-xs">${food.name}</span>
                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-md ${tolObj.badgeClass}">
                  ${tolObj.label}
                </span>
              </div>
              <div class="flex flex-wrap gap-1 mt-1">
                ${groups.map((g) => {
                  const gObj = FODMAP_GROUPS.find((fg) => fg.id === g);
                  const isSafe = g === 'LOW_FODMAP_SAFE';
                  return `<span class="text-[9px] px-1.5 py-0.5 rounded-full ${isSafe ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'} font-medium">${gObj ? gObj.label.split(' ')[0] : g}</span>`;
                }).join('')}
                ${portion ? `<span class="text-[9px] text-gray-400 px-1 py-0.5 font-medium">· porz: ${portion.amount}${portion.unit}</span>` : ''}
              </div>
            </div>
          </div>
          <span class="text-gray-300 hover:text-gray-500 text-sm font-bold pl-2">✎</span>
        </div>
      `;
    }).join('');

    // Click riga per modifica
    rootElement.querySelectorAll('.food-item-row').forEach((row) => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-id');
        openEditModal(id);
      });
    });
  }

  // Modale apertura per nuovo alimento
  function openNewModal() {
    document.getElementById('food-modal-title').textContent = 'Nuovo Alimento';
    document.getElementById('food-edit-id').value = '';
    foodForm.reset();
    document.getElementById('food-portion-amount').value = 100;
    document.getElementById('food-portion-unit').value = 'g';
    document.getElementById('food-tolerance').value = 'UNTESTED';
    document.getElementById('food-source').value = 'USER_INPUT';
    document.getElementById('btn-delete-food').classList.add('hidden');

    // Default: spunta LOW_FODMAP_SAFE
    document.querySelectorAll('input[name="food-fodmap"]').forEach((cb) => {
      cb.checked = cb.value === 'LOW_FODMAP_SAFE';
    });

    foodModal.showModal();
  }

  // Modale apertura per modifica
  function openEditModal(id) {
    const food = foodsList.find((f) => f.id === id);
    if (!food) return;

    document.getElementById('food-modal-title').textContent = 'Modifica Alimento';
    document.getElementById('food-edit-id').value = food.id;
    document.getElementById('food-name').value = food.name;
    document.getElementById('food-synonyms').value = (food.synonyms || []).join(', ');
    document.getElementById('food-category').value = food.category || 'VEGETABLE';
    document.getElementById('food-portion-amount').value = food.tolerance?.maxToleratedPortion?.amount || 100;
    document.getElementById('food-portion-unit').value = food.tolerance?.maxToleratedPortion?.unit || 'g';
    document.getElementById('food-tolerance').value = food.tolerance?.status || 'UNTESTED';
    document.getElementById('food-source').value = food.dataSource?.origin || 'USER_INPUT';
    document.getElementById('food-notes').value = food.tolerance?.personalNotes || '';

    const foodGroups = food.primaryFodmapGroup || [];
    document.querySelectorAll('input[name="food-fodmap"]').forEach((cb) => {
      cb.checked = foodGroups.includes(cb.value);
    });

    const btnDelete = document.getElementById('btn-delete-food');
    btnDelete.classList.remove('hidden');
    btnDelete.onclick = async () => {
      if (confirm(`Vuoi rimuovere "${food.name}" dal catalogo?`)) {
        await archiveFood(food.id);
        foodModal.close();
        await refreshList();
      }
    };

    foodModal.showModal();
  }

  // Listener Form Salvataggio
  foodForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('food-edit-id').value;
    const name = document.getElementById('food-name').value;
    const synonyms = document.getElementById('food-synonyms').value;
    const category = document.getElementById('food-category').value;
    const amount = parseInt(document.getElementById('food-portion-amount').value, 10) || 100;
    const unit = document.getElementById('food-portion-unit').value;
    const toleranceStatus = document.getElementById('food-tolerance').value;
    const source = document.getElementById('food-source').value;
    const notes = document.getElementById('food-notes').value;

    const selectedFodmaps = Array.from(
      document.querySelectorAll('input[name="food-fodmap"]:checked')
    ).map((cb) => cb.value);

    await saveFood({
      id: id || undefined,
      name,
      synonyms,
      category,
      primaryFodmapGroup: selectedFodmaps.length > 0 ? selectedFodmaps : ['LOW_FODMAP_SAFE'],
      portionAmount: amount,
      portionUnit: unit,
      dataSource: { origin: source },
      tolerance: {
        status: toleranceStatus,
        maxToleratedPortion: { amount, unit, description: 'porzione abituale' },
        personalNotes: notes,
      },
    });

    foodModal.close();
    await refreshList();
  });

  // Chiusura modale
  document.getElementById('btn-close-food-modal')?.addEventListener('click', () => foodModal.close());
  document.getElementById('btn-cancel-food')?.addEventListener('click', () => foodModal.close());
  foodModal.addEventListener('click', (e) => {
    if (e.target === foodModal) foodModal.close();
  });

  // Tasto Nuovo Alimento
  document.getElementById('btn-new-food')?.addEventListener('click', openNewModal);

  // Ricerca e filtri
  document.getElementById('search-foods')?.addEventListener('input', (e) => {
    currentSearch = e.target.value;
    refreshList();
  });

  document.getElementById('filter-category')?.addEventListener('change', (e) => {
    currentCategory = e.target.value;
    refreshList();
  });

  document.getElementById('filter-fodmap')?.addEventListener('change', (e) => {
    currentFodmap = e.target.value;
    refreshList();
  });

  document.getElementById('filter-tolerance')?.addEventListener('change', (e) => {
    currentTolerance = e.target.value;
    refreshList();
  });

  // Importazione file database JSON personale
  const fileInput = document.getElementById('file-import-input');
  document.getElementById('btn-import-foods')?.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const foodsArray = Array.isArray(data) ? data : data.foods;

      if (!foodsArray || !Array.isArray(foodsArray)) {
        alert("Il file JSON selezionato non contiene un array valido di alimenti (atteso array diretto o chiave 'foods').");
        return;
      }

      if (confirm(`Trovati ${foodsArray.length} alimenti nel file. Vuoi importarli nel tuo catalogo?`)) {
        const count = await importFoodsBatch(foodsArray);
        alert(`Importazione completata con successo! Inseriti ${count} alimenti.`);
        await refreshList();
      }
    } catch (err) {
      console.error('Errore importazione file:', err);
      alert('Errore durante la lettura del file JSON: ' + err.message);
    } finally {
      fileInput.value = '';
    }
  });

  // Caricamento iniziale
  await refreshList();
}
