/**
 * src/ui/pages/challenge.js
 *
 * Schermata "Challenge & Washout" di FODMAP Path.
 * Permette di:
 * 1. Visualizzare lo stato attivo (Dose Giorno 1, 2, 3 o Fase Washout con timer);
 * 2. Avviare un nuovo Challenge FODMAP a 3 dosi con dosaggi pre-impostati;
 * 3. Avviare un percorso di Washout volontario (riposo digestivo low-FODMAP);
 * 4. Registrare il check-in giornaliero della dose con interruzione automatica su sintomi severi;
 * 5. Consultare lo storico dei challenge e aggiornare la tolleranza dell'alimento.
 */

import {
  getActiveChallenge,
  getAllChallenges,
  startChallenge,
  startVoluntaryWashout,
  recordDayProgress,
  finalizeChallenge,
  abortChallenge,
  CHALLENGE_FODMAP_GROUPS,
} from '../../domain/challenge/challengeService.js';

import { getFoods } from '../../domain/foods/foodService.js';

const OUTCOME_DESCRIPTIONS = {
  TOLERATED_HIGH_DOSE: { label: 'Tollerato ad alta dose', badge: 'bg-emerald-100 text-emerald-800', icon: '✅' },
  TOLERATED_MEDIUM_DOSE: { label: 'Tollerato a dose media', badge: 'bg-blue-100 text-blue-800', icon: '🔵' },
  MILD_SYMPTOMS_ACCEPTABLE: { label: 'Sintomi lievi accettabili', badge: 'bg-amber-100 text-amber-800', icon: '🟡' },
  SEVERE_SYMPTOMS_FAILED: { label: 'Non tollerato (Sintomi severi)', badge: 'bg-red-100 text-red-800', icon: '❌' },
  ABORTED_EARLY: { label: 'Interrotto precocemente', badge: 'bg-gray-100 text-gray-700', icon: '⏹️' }
};

export async function render(rootElement) {
  let activeChallenge = await getActiveChallenge();
  let pastChallenges = await getAllChallenges();
  let availableFoods = await getFoods();

  rootElement.innerHTML = `
    <div class="challenge-page max-w-2xl mx-auto px-4 py-4 space-y-4 pb-24 text-gray-800">
      
      <!-- Testata Sezione -->
      <div class="flex justify-between items-center">
        <div>
          <h2 class="text-xl font-bold text-emerald-700 leading-tight">Challenge & Washout</h2>
          <p class="text-xs text-gray-500">Protocollo controllato di reintroduzione e riposo intestinale</p>
        </div>
      </div>

      <!-- Sezione Dinamica: Stato Attivo oppure Selezione Nuovo Test -->
      <div id="active-session-container"></div>

      <!-- Storico Challenge e Percorsi Precedenti -->
      <section class="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs">
        <h3 class="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          📜 Storico Reintroduzioni & Washout (<span id="history-count">0</span>)
        </h3>
        <div id="challenge-history-list" class="space-y-2 text-xs"></div>
      </section>

    </div>

    <!-- Modale Avvio Nuovo Challenge -->
    <dialog id="new-challenge-modal" class="w-11/12 max-w-md rounded-2xl p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm shadow-2xl m-auto">
      <div class="p-5 bg-white max-h-[85vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-3 pb-2 border-b">
          <h3 class="text-base font-bold text-gray-800">🧪 Avvia Challenge 3 Dosi</h3>
          <button id="btn-close-modal" class="bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full w-7 h-7 flex items-center justify-center font-bold">✕</button>
        </div>

        <form id="form-start-challenge" class="space-y-3.5 text-xs">
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Gruppo FODMAP da Testare</label>
            <select id="challenge-group-select" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 text-xs font-medium">
              ${CHALLENGE_FODMAP_GROUPS.map(g => `<option value="${g.id}">${g.name} (es. ${g.testExample})</option>`).join('')}
            </select>
          </div>

          <div>
            <label class="block font-semibold text-gray-700 mb-1">Seleziona Alimento di Test</label>
            <select id="challenge-food-select" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 text-xs font-medium">
              <option value="custom">Alimento Personalizzato / Libero</option>
              ${availableFoods.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
            </select>
          </div>

          <div id="custom-food-name-div">
            <label class="block font-semibold text-gray-700 mb-1">Nome Alimento</label>
            <input type="text" id="challenge-custom-name" placeholder="Es. Latte vaccino intero, Mele, Pane di grano..." class="w-full p-2 border border-gray-200 rounded-lg">
          </div>

          <div class="p-3 bg-emerald-50 border border-emerald-100 rounded-xl space-y-2 text-[11px] text-emerald-800">
            <div class="flex justify-between items-center">
              <span class="font-bold">Personalizza le 3 Dosi di Test:</span>
              <select id="challenge-dose-unit" class="p-1 text-xs border border-emerald-200 rounded bg-white text-emerald-900 font-semibold">
                <option value="g">g (grammi)</option>
                <option value="ml">ml (millilitri)</option>
                <option value="pezzo">pezzi</option>
              </select>
            </div>
            <div class="grid grid-cols-3 gap-1.5 text-center mt-1">
              <div class="bg-white p-2 rounded-lg border border-emerald-200 shadow-2xs">
                <span class="text-gray-500 block text-[10px] font-semibold mb-1">Giorno 1 (1/4)</span>
                <input type="number" id="input-dose-1" min="1" value="30" class="w-full p-1 border border-gray-200 rounded text-center font-bold text-xs">
              </div>
              <div class="bg-white p-2 rounded-lg border border-emerald-200 shadow-2xs">
                <span class="text-gray-500 block text-[10px] font-semibold mb-1">Giorno 2 (1/2)</span>
                <input type="number" id="input-dose-2" min="1" value="60" class="w-full p-1 border border-gray-200 rounded text-center font-bold text-xs">
              </div>
              <div class="bg-white p-2 rounded-lg border border-emerald-200 shadow-2xs">
                <span class="text-gray-500 block text-[10px] font-semibold mb-1">Giorno 3 (Piena)</span>
                <input type="number" id="input-dose-3" min="1" value="100" class="w-full p-1 border border-gray-200 rounded text-center font-bold text-xs">
              </div>
            </div>
          </div>

          <div class="pt-2 flex gap-2">
            <button type="button" id="btn-cancel-challenge" class="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold">
              Annulla
            </button>
            <button type="submit" class="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs active:scale-95 transition-all">
              Avvia Challenge
            </button>
          </div>
        </form>
      </div>
    </dialog>

    <!-- Modale Avvio Washout Volontario -->
    <dialog id="washout-modal" class="w-11/12 max-w-md rounded-2xl p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm shadow-2xl m-auto">
      <div class="p-5 bg-white">
        <div class="flex justify-between items-center mb-3 pb-2 border-b">
          <h3 class="text-base font-bold text-gray-800">🌱 Avvia Percorso di Washout</h3>
          <button id="btn-close-washout-modal" class="bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full w-7 h-7 flex items-center justify-center font-bold">✕</button>
        </div>

        <form id="form-start-washout" class="space-y-3 text-xs">
          <p class="text-gray-600 text-xs leading-relaxed">
            Il <strong>Washout</strong> è un intervallo di riposo intestinale a rigoroso basso contenuto di FODMAP (senza test o cibi trigger) per far rientrare eventuali sintomi e ritrovare la stabilità basale.
          </p>

          <div>
            <label class="block font-semibold text-gray-700 mb-1">Durata Prevista del Riposo</label>
            <select id="washout-days-select" class="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 text-xs font-semibold">
              <option value="3">3 Giorni (Standard)</option>
              <option value="4">4 Giorni (Consigliato post-sintomi)</option>
              <option value="5">5 Giorni (Stabilità profonda)</option>
              <option value="7">7 Giorni (1 Settimana completa)</option>
            </select>
          </div>

          <div>
            <label class="block font-semibold text-gray-700 mb-1">Motivazione o Obiettivo del Percorso</label>
            <input type="text" id="washout-reason-input" value="Recupero stabilità digestiva e azzeramento sintomi" class="w-full p-2 border border-gray-200 rounded-lg">
          </div>

          <div class="pt-2 flex gap-2">
            <button type="button" id="btn-cancel-washout" class="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold">
              Annulla
            </button>
            <button type="submit" class="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs active:scale-95 transition-all">
              Avvia Washout
            </button>
          </div>
        </form>
      </div>
    </dialog>
  `;

  const sessionContainer = document.getElementById('active-session-container');
  const historyList = document.getElementById('challenge-history-list');
  const historyCount = document.getElementById('history-count');
  const challengeModal = document.getElementById('new-challenge-modal');
  const washoutModal = document.getElementById('washout-modal');

  // Renderizza la vista corrente
  async function renderActiveSession() {
    activeChallenge = await getActiveChallenge();
    pastChallenges = await getAllChallenges();

    historyCount.textContent = pastChallenges.length;
    renderHistory();

    if (!activeChallenge) {
      // Nessuna sessione attiva: mostra pannello di scelta per avviare Challenge o Washout
      sessionContainer.innerHTML = `
        <div class="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-5 shadow-2xs space-y-4">
          <div>
            <span class="text-xs font-bold uppercase tracking-wide text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-full inline-block mb-1">
              Pronto per la Reintroduzione?
            </span>
            <h3 class="text-base font-extrabold text-gray-900 leading-tight">Nessuna sessione attiva al momento</h3>
            <p class="text-xs text-gray-600 mt-1 leading-relaxed">
              Assicurati di essere in una fase di sintomi stabili prima di avviare un challenge controllato. In alternativa, puoi avviare un percorso di washout volontario.
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button id="btn-open-challenge-modal" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold p-3 rounded-xl shadow-xs active:scale-95 transition-all text-left flex items-start gap-3">
              <span class="text-2xl mt-0.5">🧪</span>
              <div>
                <span class="block text-xs font-extrabold">Avvia Challenge 3 Dosi</span>
                <span class="block text-[10px] text-emerald-100 font-normal mt-0.5">Testa un gruppo FODMAP a dosi crescenti</span>
              </div>
            </button>

            <button id="btn-open-washout-modal" class="bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-800 font-bold p-3 rounded-xl shadow-2xs active:scale-95 transition-all text-left flex items-start gap-3">
              <span class="text-2xl mt-0.5">🌱</span>
              <div>
                <span class="block text-xs font-extrabold">Avvia Washout Volontario</span>
                <span class="block text-[10px] text-gray-500 font-normal mt-0.5">Periodo di riposo digestivo low-FODMAP</span>
              </div>
            </button>
          </div>
        </div>
      `;

      document.getElementById('btn-open-challenge-modal')?.addEventListener('click', () => {
        challengeModal.showModal();
      });
      document.getElementById('btn-open-washout-modal')?.addEventListener('click', () => {
        washoutModal.showModal();
      });

      return;
    }

    // Se c'è una sessione attiva: mostra lo stato in corso
    if (activeChallenge.state === 'WASHOUT_PERIOD') {
      renderWashoutActive(activeChallenge);
    } else {
      renderChallengeActive(activeChallenge);
    }
  }

  // Vista specifica quando il Washout è attivo (Guidato o Volontario)
  function renderWashoutActive(session) {
    const isVoluntary = session.washout?.isVoluntary;
    const startDate = session.washout?.startDate ? new Date(session.washout.startDate) : new Date(session.startDate);
    const targetDays = session.washout?.targetDays || 3;
    const now = new Date();

    const elapsedMs = Math.max(0, now - startDate);
    const elapsedDays = Math.min(targetDays, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
    const remainingDays = Math.max(0, targetDays - elapsedDays);

    sessionContainer.innerHTML = `
      <div class="bg-teal-50 border border-teal-200 rounded-2xl p-5 shadow-2xs space-y-4">
        <div class="flex justify-between items-start">
          <div>
            <span class="text-[10px] font-bold uppercase tracking-wider bg-teal-200 text-teal-900 px-2 py-0.5 rounded-full inline-block mb-1">
              ${isVoluntary ? '🌱 Washout Volontario' : '⏳ Washout di Consolidamento'}
            </span>
            <h3 class="text-base font-extrabold text-teal-950">Periodo di Riposo Intestinale</h3>
            <p class="text-xs text-teal-800 mt-0.5">${session.washout?.reason || 'Mantenere dieta rigorosamente a basso FODMAP'}</p>
          </div>
          <button id="btn-abort-session" class="text-xs text-red-500 hover:text-red-700 font-bold px-2 py-1">
            Interrompi
          </button>
        </div>

        <!-- Timer / Barra Avanzamento Giorni -->
        <div class="bg-white p-3.5 rounded-xl border border-teal-100 shadow-2xs space-y-2">
          <div class="flex justify-between text-xs font-bold text-gray-700">
            <span>Avanzamento Riposo</span>
            <span class="text-teal-700">${elapsedDays} di ${targetDays} giorni (${remainingDays === 0 ? 'Completato!' : remainingDays + ' gg rimanenti'})</span>
          </div>
          <div class="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
            <div class="bg-teal-500 h-full rounded-full transition-all" style="width: ${Math.round((elapsedDays / targetDays) * 100)}%;"></div>
          </div>
          <p class="text-[11px] text-gray-500 italic">
            In questi giorni evita assolutamente alimenti ad alto contenuto di FODMAP per permettere al colon di ritrovare la piena stabilità asintomatica.
          </p>
        </div>

        <div class="flex gap-2">
          <button id="btn-complete-washout" class="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-xs active:scale-95 transition-all">
            ✓ Concludi Washout e Torna Stabile
          </button>
        </div>
      </div>
    `;

    document.getElementById('btn-abort-session')?.addEventListener('click', async () => {
      if (confirm('Vuoi interrompere il periodo di washout anticipatamente?')) {
        await abortChallenge(session.id, 'Interrotto dall\'utente');
        await renderActiveSession();
      }
    });

    document.getElementById('btn-complete-washout')?.addEventListener('click', async () => {
      await finalizeChallenge(session.id, { customOutcome: 'TOLERATED_HIGH_DOSE', updateFoodStatus: false });
      alert('Periodo di washout concluso con successo! Il tuo diario è ora pronto per nuove reintroduzioni.');
      await renderActiveSession();
    });
  }

  // Vista specifica quando un Challenge a 3 Dosi è attivo
  function renderChallengeActive(challenge) {
    const currentDay = challenge.currentDay || 1;
    const currentDose = challenge.doses?.[`day${currentDay}`] || { amount: 30, unit: 'g', description: `Dose Giorno ${currentDay}` };

    sessionContainer.innerHTML = `
      <div class="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-5 shadow-2xs space-y-4">
        <div class="flex justify-between items-start">
          <div>
            <span class="text-[10px] font-bold uppercase tracking-wider bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full inline-block mb-1">
              🧪 Challenge Reintroduzione Attivo
            </span>
            <h3 class="text-base font-extrabold text-emerald-950">${challenge.testFoodName}</h3>
            <p class="text-xs text-emerald-800">Gruppo FODMAP: <strong>${challenge.fodmapGroup}</strong></p>
          </div>
          <button id="btn-abort-challenge" class="text-xs text-red-500 hover:text-red-700 font-bold px-2 py-1">
            Annulla Test
          </button>
        </div>

        <!-- Progress Bar 3 Giorni -->
        <div class="grid grid-cols-3 gap-2 text-center text-xs">
          ${[1, 2, 3].map(d => {
            const isDone = d < currentDay;
            const isCurrent = d === currentDay;
            const dose = challenge.doses?.[`day${d}`] || { amount: '?' };
            return `
              <div class="p-2.5 rounded-xl border ${isCurrent ? 'bg-white border-emerald-500 ring-2 ring-emerald-400 font-bold text-emerald-900' : isDone ? 'bg-emerald-100/60 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-400'}">
                <span class="block text-[10px] uppercase">Giorno ${d}</span>
                <span class="text-xs">${dose.amount} ${dose.unit || 'g'}</span>
                <span class="block text-[9px] mt-0.5">${isDone ? '✓ Fatto' : isCurrent ? '▶ In corso' : 'In attesa'}</span>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Box Registrazione Dose del Giorno Corrente -->
        <div class="bg-white p-4 rounded-xl border border-emerald-100 shadow-2xs space-y-3">
          <div class="flex justify-between items-center">
            <span class="font-bold text-gray-800 text-xs">Oggi: Giorno ${currentDay}</span>
            <span class="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-md">
              Dose da assumere: ${currentDose.amount} ${currentDose.unit || 'g'}
            </span>
          </div>

          <div class="space-y-3 pt-1">
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label class="block font-semibold text-gray-700 mb-0.5">Dolore (0-10)</label>
                <input type="number" id="day-pain" min="0" max="10" value="0" class="w-full p-2 border border-gray-200 rounded-lg text-center font-bold text-xs">
              </div>
              <div>
                <label class="block font-semibold text-gray-700 mb-0.5">Gonfiore (0-10)</label>
                <input type="number" id="day-bloat" min="0" max="10" value="0" class="w-full p-2 border border-gray-200 rounded-lg text-center font-bold text-xs">
              </div>
            </div>

            <div>
              <label class="block font-semibold text-gray-700 mb-0.5 text-xs">Note sintomi riscontrati</label>
              <input type="text" id="day-notes" placeholder="Es. nessun fastidio, lieve meteorismo serale..." class="w-full p-2 border border-gray-200 rounded-lg text-xs">
            </div>

            <div class="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
              ⚠️ <strong>Regola di sicurezza:</strong> Se il dolore o gonfiore supera 4/10, il test verrà automaticamente interrotto e partirà subito il protocollo di washout.
            </div>

            <button id="btn-submit-day-progress" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-xs active:scale-95 transition-all">
              ✓ Conferma Dose Giorno ${currentDay} e Sintomi
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-abort-challenge')?.addEventListener('click', async () => {
      if (confirm('Vuoi annullare questo challenge?')) {
        await abortChallenge(challenge.id, 'Annullato manualmente');
        await renderActiveSession();
      }
    });

    document.getElementById('btn-submit-day-progress')?.addEventListener('click', async () => {
      const pain = parseInt(document.getElementById('day-pain').value, 10) || 0;
      const bloat = parseInt(document.getElementById('day-bloat').value, 10) || 0;
      const notes = document.getElementById('day-notes').value.trim();

      const updated = await recordDayProgress(challenge.id, {
        day: currentDay,
        doseConsumed: true,
        pain,
        bloat,
        notes
      });

      if (updated.state === 'WASHOUT_PERIOD') {
        if (updated.outcome === 'SEVERE_SYMPTOMS_FAILED') {
          alert('Attenzione: Sintomi rilevanti registrati. Come da protocollo clinico, il test è stato interrotto ed è stato avviato il periodo di Washout per recuperare stabilità.');
        } else {
          alert('Congratulazioni! Hai completato le 3 dosi con successo. È ora attivo il periodo di Washout per consolidare la tolleranza.');
        }
      } else {
        alert(`Giorno ${currentDay} registrato! Puoi proseguire con la dose del Giorno ${updated.currentDay}.`);
      }

      await renderActiveSession();
    });
  }

  // Render dello storico dei challenge
  function renderHistory() {
    if (pastChallenges.length === 0) {
      historyList.innerHTML = '<p class="text-gray-400 italic text-center py-3 text-xs">Nessun challenge o washout completato in archivio.</p>';
      return;
    }

    historyList.innerHTML = pastChallenges.map(c => {
      const dateStr = c.startDate ? new Date(c.startDate).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
      const outcomeObj = OUTCOME_DESCRIPTIONS[c.outcome] || { label: c.outcome || c.state, badge: 'bg-gray-100 text-gray-700', icon: '📋' };

      return `
        <div class="p-3 bg-gray-50 border border-gray-100 rounded-xl flex justify-between items-center">
          <div>
            <div class="flex items-center gap-1.5">
              <span class="font-bold text-gray-800 text-xs">${c.testFoodName}</span>
              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-md ${outcomeObj.badge}">
                ${outcomeObj.icon} ${outcomeObj.label}
              </span>
            </div>
            <p class="text-[10px] text-gray-500 mt-0.5">
              ${c.fodmapGroup !== 'LOW_FODMAP_SAFE' ? `Gruppo: ${c.fodmapGroup} · ` : ''}Iniziato il ${dateStr}
            </p>
          </div>
          <span class="text-[11px] text-gray-400 font-semibold">${c.state === 'FINALIZED' ? 'Completato' : c.state}</span>
        </div>
      `;
    }).join('');
  }

  // Modale Challenge: aggiornamento dosaggi consigliati in base al gruppo scelto
  const groupSelect = document.getElementById('challenge-group-select');
  function updateDoseLabels() {
    const selected = CHALLENGE_FODMAP_GROUPS.find(g => g.id === groupSelect.value);
    if (selected) {
      const def = selected.defaultDoses;
      const inp1 = document.getElementById('input-dose-1');
      const inp2 = document.getElementById('input-dose-2');
      const inp3 = document.getElementById('input-dose-3');
      const unitSel = document.getElementById('challenge-dose-unit');
      if (inp1) inp1.value = def.day1;
      if (inp2) inp2.value = def.day2;
      if (inp3) inp3.value = def.day3;
      if (unitSel) unitSel.value = def.unit || 'g';
    }
  }
  groupSelect?.addEventListener('change', updateDoseLabels);
  updateDoseLabels();

  // Switch cibo custom / da catalogo
  const foodSelect = document.getElementById('challenge-food-select');
  const customDiv = document.getElementById('custom-food-name-div');
  foodSelect?.addEventListener('change', () => {
    if (foodSelect.value === 'custom') {
      customDiv.classList.remove('hidden');
    } else {
      customDiv.classList.add('hidden');
    }
  });

  // Submit Modale Nuovo Challenge
  document.getElementById('form-start-challenge')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fodmapGroup = groupSelect.value;
    const foodId = foodSelect.value;
    let foodName = '';

    if (foodId === 'custom') {
      foodName = document.getElementById('challenge-custom-name').value.trim() || 'Alimento di test';
    } else {
      const selected = availableFoods.find(f => f.id === foodId);
      foodName = selected ? selected.name : 'Alimento di test';
    }

    const d1 = parseInt(document.getElementById('input-dose-1')?.value, 10) || 30;
    const d2 = parseInt(document.getElementById('input-dose-2')?.value, 10) || 60;
    const d3 = parseInt(document.getElementById('input-dose-3')?.value, 10) || 100;
    const unit = document.getElementById('challenge-dose-unit')?.value || 'g';

    try {
      await startChallenge({
        fodmapGroup,
        testFoodId: foodId,
        testFoodName: foodName,
        doses: {
          day1: { amount: d1, unit: unit, description: '1/4 dose test' },
          day2: { amount: d2, unit: unit, description: '1/2 dose test' },
          day3: { amount: d3, unit: unit, description: 'Dose piena' },
        }
      });
      challengeModal.close();
      await renderActiveSession();
    } catch (err) {
      alert(err.message);
    }
  });

  // Submit Modale Washout Volontario
  document.getElementById('form-start-washout')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const days = parseInt(document.getElementById('washout-days-select').value, 10) || 3;
    const reason = document.getElementById('washout-reason-input').value.trim();

    try {
      await startVoluntaryWashout({ targetDays: days, reason });
      washoutModal.close();
      await renderActiveSession();
    } catch (err) {
      alert(err.message);
    }
  });

  // Chiusura modali
  document.getElementById('btn-close-modal')?.addEventListener('click', () => challengeModal.close());
  document.getElementById('btn-cancel-challenge')?.addEventListener('click', () => challengeModal.close());
  document.getElementById('btn-close-washout-modal')?.addEventListener('click', () => washoutModal.close());
  document.getElementById('btn-cancel-washout')?.addEventListener('click', () => washoutModal.close());

  // Render iniziale
  await renderActiveSession();
}
