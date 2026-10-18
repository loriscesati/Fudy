/**
 * src/ui/pages/alimenti.js — "Inserisci alimento"
 *
 * Unico punto di creazione e gestione degli alimenti dell'app.
 * Qui nascono le card: ogni alimento viene classificato una sola volta
 * (gruppi FODMAP + tipologia di zuccheri, sezione, budget opzionale)
 * e da quel momento i consumi si registrano solo con i tap + e −
 * nella home. Non esistono altri modi di inserire alimenti "a caso".
 */

import { FODMAP_GROUPS } from '../../domain/foods/foodService.js';
import { getCards, saveCard, archiveCard, getCardById } from '../../domain/foods/cardService.js';
import { CARD_SECTIONS, SUGAR_TYPES } from '../../domain/foods/cardModel.js';

const EMOJI_CHOICES = [
  '🍏','🍎','🍐','🍊','🍌','🍉','🍇','🍓','🫐','🍑','🥭','🍍',
  '🥝','🍅','🥕','🥦','🥬','🥒','🫑','🌽','🥔','🍠','🧄','🧅',
  '🍄','🥜','🌰','🍞','🧀','🥚','🥩','🍗','🐟','🦐','🍕','🥗',
  '🥘','🍝','🍚','🫘','🥛','☕','🍵','🧃','🍪','🍫','🍯','🍽️'
];

function describeBudget(card) {
  const parts = [];
  if (card.weeklyLimit) parts.push(`max ${card.weeklyLimit}/sett`);
  if (card.sharedGroup) {
    parts.push(card.groupLimit ? `gruppo "${card.sharedGroup}" max ${card.groupLimit}` : `gruppo "${card.sharedGroup}"`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'senza limite';
}

export async function render(rootElement) {
  let cards = [];

  rootElement.innerHTML = `
    <div class="alimenti-container max-w-2xl mx-auto px-4 py-4 space-y-4 pb-24">

      <div class="flex justify-between items-start gap-3">
        <div>
          <h2 class="text-xl font-bold text-emerald-700 leading-tight">Inserisci Alimento</h2>
          <p class="text-xs text-gray-500 mt-0.5 leading-snug">
            Le card create qui sono l'unico modo per registrare ciò che mangi.
            Classifica subito FODMAP e zuccheri: le statistiche dipendono da questi dati.
          </p>
        </div>
        <button id="btn-new-card" class="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-xs active:scale-95 transition-all flex items-center gap-1">
          <span>+</span>
          <span>Nuova</span>
        </button>
      </div>

      <div id="cards-container" class="space-y-4"></div>
    </div>

    <!-- Modale Creazione / Modifica Card -->
    <dialog id="card-modal" class="w-11/12 max-w-lg rounded-2xl p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm shadow-2xl m-auto">
      <div class="p-5 bg-white max-h-[85vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-3 pb-2 border-b">
          <h3 id="card-modal-title" class="text-base font-bold text-gray-800">Nuovo Alimento</h3>
          <button id="btn-close-card-modal" class="bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full w-7 h-7 flex items-center justify-center font-bold">✕</button>
        </div>

        <form id="card-form" class="space-y-3.5 text-xs">
          <input type="hidden" id="card-edit-id">

          <div>
            <label class="block font-semibold text-gray-700 mb-1">Nome dell'alimento *</label>
            <input type="text" id="card-name" required placeholder="Es. Banana, Pane senza glutine, Yogurt greco..."
                   class="w-full p-2 border border-gray-200 rounded-lg">
          </div>

          <div>
            <label class="block font-semibold text-gray-700 mb-1">Icona</label>
            <div id="emoji-picker" class="grid grid-cols-8 gap-1 p-2 bg-gray-50 border border-gray-200 rounded-xl max-h-28 overflow-y-auto"></div>
          </div>

          <div>
            <label class="block font-semibold text-gray-700 mb-1">Sezione *</label>
            <div class="grid grid-cols-3 gap-1.5">
              ${CARD_SECTIONS.map((s) => `
                <label class="cursor-pointer">
                  <input type="radio" name="card-section" value="${s.id}" class="peer sr-only" ${s.id === 'OTHER' ? 'checked' : ''}>
                  <div class="text-center px-2 py-1.5 rounded-lg border border-gray-200 bg-gray-50 peer-checked:bg-emerald-600 peer-checked:text-white peer-checked:border-emerald-600 transition-all">
                    <div class="text-base">${s.icon}</div>
                    <div class="font-semibold">${s.label}</div>
                  </div>
                </label>
              `).join('')}
            </div>
          </div>

          <div>
            <label class="block font-semibold text-gray-700 mb-1">Gruppi FODMAP presenti *</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2 bg-gray-50 border border-gray-200 rounded-xl">
              ${FODMAP_GROUPS.map((g) => `
                <label class="inline-flex items-center gap-1.5 text-[11px] cursor-pointer">
                  <input type="checkbox" name="card-fodmap" value="${g.id}" class="accent-emerald-600 rounded">
                  <span>${g.label}</span>
                </label>
              `).join('')}
            </div>
          </div>

          <div>
            <label class="block font-semibold text-gray-700 mb-1">Tipologia di zuccheri *</label>
            <p class="text-[10px] text-gray-400 mb-1">"Nessuno zucchero rilevante" esclude le altre opzioni.</p>
            <div class="grid grid-cols-1 gap-1.5 p-2 bg-gray-50 border border-gray-200 rounded-xl">
              ${SUGAR_TYPES.map((t) => `
                <label class="inline-flex items-center gap-1.5 text-[11px] cursor-pointer">
                  <input type="checkbox" name="card-sugars" value="${t.id}" class="accent-emerald-600 rounded">
                  <span>${t.label}</span>
                </label>
              `).join('')}
            </div>
          </div>

          <div class="p-2 bg-emerald-50/60 border border-emerald-100 rounded-xl space-y-2">
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="card-has-limit" class="accent-emerald-600 rounded">
              <span class="font-semibold text-gray-700">Budget settimanale</span>
            </label>
            <div id="limit-fields" class="hidden space-y-2">
              <div>
                <label class="block font-semibold text-gray-700 mb-1">Quante volte a settimana al massimo?</label>
                <input type="number" id="card-weekly-limit" min="1" max="30" value="2" class="w-24 p-2 border border-gray-200 rounded-lg">
              </div>
              <div>
                <label class="block font-semibold text-gray-700 mb-1">Budget condiviso (opzionale)</label>
                <input type="text" id="card-shared-group" list="shared-group-list" placeholder="Es. salmone, frutta zuccherina..."
                       class="w-full p-2 border border-gray-200 rounded-lg">
                <datalist id="shared-group-list"></datalist>
                <p class="text-[10px] text-gray-400 mt-0.5">Più alimenti con lo stesso nome di gruppo si contendono lo stesso tetto.</p>
              </div>
              <div id="group-limit-row" class="hidden">
                <label class="block font-semibold text-gray-700 mb-1">Tetto comune del gruppo (a settimana)</label>
                <input type="number" id="card-group-limit" min="1" max="30" value="3" class="w-24 p-2 border border-gray-200 rounded-lg">
              </div>
            </div>
          </div>

          <div class="pt-2 flex gap-2">
            <button type="button" id="btn-archive-card" class="hidden px-3 py-2 bg-red-50 text-red-600 rounded-xl font-semibold hover:bg-red-100">
              Archivia
            </button>
            <div class="flex-1 flex gap-2 justify-end">
              <button type="button" id="btn-cancel-card" class="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold">
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

  const cardModal = document.getElementById('card-modal');
  const cardForm = document.getElementById('card-form');
  const hasLimitCheck = document.getElementById('card-has-limit');
  const limitFields = document.getElementById('limit-fields');
  const sharedInput = document.getElementById('card-shared-group');
  const groupLimitRow = document.getElementById('group-limit-row');

  function syncBudgetUI() {
    limitFields.classList.toggle('hidden', !hasLimitCheck.checked);
    groupLimitRow.classList.toggle('hidden', !hasLimitCheck.checked || sharedInput.value.trim() === '');
  }
  hasLimitCheck.addEventListener('change', syncBudgetUI);
  sharedInput.addEventListener('input', syncBudgetUI);

  // La casella "Nessuno zucchero rilevante" e' esclusiva
  function bindSugarExclusivity() {
    const boxes = [...document.querySelectorAll('input[name="card-sugars"]')];
    boxes.forEach((box) => {
      box.addEventListener('change', () => {
        const noneBox = boxes.find((b) => b.value === 'NONE');
        if (box.value === 'NONE' && box.checked) {
          boxes.forEach((b) => { if (b !== noneBox) b.checked = false; });
        } else if (box.checked && noneBox) {
          noneBox.checked = false;
        }
      });
    });
  }

  function renderEmojiPicker(selected) {
    const container = document.getElementById('emoji-picker');
    container.innerHTML = EMOJI_CHOICES.map((emoji) => `
      <button type="button" data-emoji="${emoji}"
              class="text-lg p-1 rounded-lg hover:bg-emerald-100 transition-colors ${emoji === selected ? 'bg-emerald-600 text-white' : ''}">
        ${emoji}
      </button>
    `).join('');
    container.querySelectorAll('[data-emoji]').forEach((btn) => {
      btn.onclick = () => {
        container.querySelectorAll('[data-emoji]').forEach((b) => b.classList.remove('bg-emerald-600', 'text-white'));
        btn.classList.add('bg-emerald-600', 'text-white');
      };
    });
  }

  function getSelectedEmoji() {
    return document.querySelector('#emoji-picker [data-emoji].bg-emerald-600')?.dataset.emoji || '🍽️';
  }

  function refreshSharedGroupOptions() {
    const list = document.getElementById('shared-group-list');
    const groups = [...new Set(cards.map((c) => c.sharedGroup).filter(Boolean))];
    list.innerHTML = groups.map((g) => `<option value="${g}"></option>`).join('');
  }

  async function refreshList() {
    cards = await getCards();
    const container = document.getElementById('cards-container');
    refreshSharedGroupOptions();

    container.innerHTML = CARD_SECTIONS.map((section) => {
      const sectionCards = cards.filter((c) => c.mealSection === section.id);
      const rows = sectionCards.length > 0
        ? sectionCards.map((card) => `
            <div class="bg-white border border-gray-200 rounded-xl p-3 shadow-2xs hover:border-emerald-300 transition-all flex justify-between items-center cursor-pointer card-row" data-id="${card.id}">
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-2xl">${card.emoji || '🍽️'}</span>
                <div class="min-w-0">
                  <div class="font-bold text-gray-800 text-xs truncate">${card.name}</div>
                  <div class="text-[10px] text-gray-400 mt-0.5">${describeBudget(card)}</div>
                </div>
              </div>
              <span class="text-gray-300 hover:text-gray-500 text-sm font-bold pl-2">✎</span>
            </div>
          `).join('')
        : '<p class="text-[11px] text-gray-400 italic px-1 py-1">Nessun alimento in questa sezione.</p>';

      return `
        <section>
          <h3 class="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            ${section.icon} ${section.label}
            <span class="text-gray-400 normal-case font-normal">(${sectionCards.length})</span>
          </h3>
          <div class="space-y-2">${rows}</div>
        </section>
      `;
    }).join('');

    rootElement.querySelectorAll('.card-row').forEach((row) => {
      row.addEventListener('click', () => openEditModal(row.dataset.id));
    });
  }

  function resetForm() {
    cardForm.reset();
    document.querySelector('input[name="card-section"][value="OTHER"]').checked = true;
    document.querySelectorAll('input[name="card-fodmap"]').forEach((cb) => {
      cb.checked = cb.value === 'LOW_FODMAP_SAFE';
    });
    document.querySelectorAll('input[name="card-sugars"]').forEach((cb) => {
      cb.checked = cb.value === 'NONE';
    });
    hasLimitCheck.checked = false;
    sharedInput.value = '';
    syncBudgetUI();
    renderEmojiPicker('🍽️');
  }

  function openNewModal() {
    document.getElementById('card-modal-title').textContent = 'Nuovo Alimento';
    document.getElementById('card-edit-id').value = '';
    document.getElementById('btn-archive-card').classList.add('hidden');
    resetForm();
    cardModal.showModal();
  }

  async function openEditModal(id) {
    const card = await getCardById(id);
    if (!card) return;

    document.getElementById('card-modal-title').textContent = 'Modifica Alimento';
    document.getElementById('card-edit-id').value = card.id;
    document.getElementById('card-name').value = card.name;
    document.querySelector(`input[name="card-section"][value="${card.mealSection}"]`).checked = true;

    const groups = card.primaryFodmapGroup || [];
    document.querySelectorAll('input[name="card-fodmap"]').forEach((cb) => {
      cb.checked = groups.includes(cb.value);
    });
    const sugars = card.sugars || ['NONE'];
    document.querySelectorAll('input[name="card-sugars"]').forEach((cb) => {
      cb.checked = sugars.includes(cb.value);
    });

    hasLimitCheck.checked = card.weeklyLimit != null || !!card.sharedGroup;
    document.getElementById('card-weekly-limit').value = card.weeklyLimit || 2;
    sharedInput.value = card.sharedGroup || '';
    document.getElementById('card-group-limit').value = card.groupLimit || 3;
    syncBudgetUI();
    renderEmojiPicker(card.emoji || '🍽️');

    const btnArchive = document.getElementById('btn-archive-card');
    btnArchive.classList.remove('hidden');
    btnArchive.onclick = async () => {
      if (confirm(`Archiviare "${card.name}"? Sparirà dalle griglie della home, ma lo storico resta.`)) {
        await archiveCard(card.id);
        cardModal.close();
        await refreshList();
      }
    };

    cardModal.showModal();
  }

  cardForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('card-name').value;
    const section = document.querySelector('input[name="card-section"]:checked')?.value || 'OTHER';
    const fodmaps = [...document.querySelectorAll('input[name="card-fodmap"]:checked')].map((cb) => cb.value);
    const sugars = [...document.querySelectorAll('input[name="card-sugars"]:checked')].map((cb) => cb.value);

    if (fodmaps.length === 0) {
      alert('Seleziona almeno un gruppo FODMAP: serve per le statistiche e i challenge.');
      return;
    }
    if (sugars.length === 0) {
      alert('Indica la tipologia di zuccheri (anche "Nessuno zucchero rilevante").');
      return;
    }

    const hasLimit = hasLimitCheck.checked;
    const sharedGroup = hasLimit ? sharedInput.value.trim() : '';

    try {
      await saveCard({
        id: document.getElementById('card-edit-id').value || undefined,
        name,
        emoji: getSelectedEmoji(),
        mealSection: section,
        primaryFodmapGroup: fodmaps,
        sugars,
        weeklyLimit: hasLimit ? document.getElementById('card-weekly-limit').value : null,
        sharedGroup: sharedGroup || null,
        groupLimit: sharedGroup ? document.getElementById('card-group-limit').value : null,
      });
      cardModal.close();
      await refreshList();
    } catch (err) {
      console.warn('Errore salvataggio alimento:', err);
      alert('Salvataggio non riuscito: riprova.');
    }
  });

  document.getElementById('btn-close-card-modal')?.addEventListener('click', () => cardModal.close());
  document.getElementById('btn-cancel-card')?.addEventListener('click', () => cardModal.close());
  cardModal.addEventListener('click', (e) => { if (e.target === cardModal) cardModal.close(); });
  document.getElementById('btn-new-card')?.addEventListener('click', openNewModal);

  bindSugarExclusivity();
  await refreshList();
}
