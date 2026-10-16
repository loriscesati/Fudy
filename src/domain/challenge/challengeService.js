/**
 * src/domain/challenge/challengeService.js
 *
 * Servizio di dominio per i Challenge di Reintroduzione FODMAP e Washout.
 * Conforme a SPECIFICHE_FUNZIONALI.md e ARCHITETTURA_TECNICA.md.
 *
 * Macchina a stati:
 * - PLANNED
 * - DAY_1_ACTIVE (Dose 1: ~1/4 porzione)
 * - DAY_2_ACTIVE (Dose 2: ~1/2 porzione)
 * - DAY_3_ACTIVE (Dose 3: porzione piena)
 * - WASHOUT_PERIOD (Volontario o guidato post-challenge / post-sintomi)
 * - COMPLETED_PENDING_REVIEW
 * - FINALIZED
 * - ABORTED_SYMPTOMS
 */

import { openDB, uuidv4, addRecord, updateRecord, getRecord, getAll } from '../../infrastructure/storage/db.js';
import { getFoodById, saveFood } from '../foods/foodService.js';

export const CHALLENGE_FODMAP_GROUPS = [
  { id: 'LACTOSE', name: 'Lattosio', testExample: 'Latte vaccino o yogurt', defaultDoses: { day1: 50, day2: 100, day3: 200, unit: 'ml' } },
  { id: 'EXCESS_FRUCTOSE', name: 'Fruttosio in eccesso', testExample: 'Miele o Mango', defaultDoses: { day1: 15, day2: 30, day3: 50, unit: 'g' } },
  { id: 'SORBITOL', name: 'Sorbitolo', testExample: 'Avocado o Prugne', defaultDoses: { day1: 40, day2: 80, day3: 120, unit: 'g' } },
  { id: 'MANNITOL', name: 'Mannitolo', testExample: 'Funghi champignon o Cavolfiore', defaultDoses: { day1: 30, day2: 60, day3: 100, unit: 'g' } },
  { id: 'FRUCTANS_GRAIN', name: 'Fruttani (Grano/Cereali)', testExample: 'Pane di frumento comune o pasta', defaultDoses: { day1: 30, day2: 60, day3: 100, unit: 'g' } },
  { id: 'FRUCTANS_VEG_GARLIC', name: 'Fruttani (Aglio/Cipolla)', testExample: 'Cipolla cotta o spicchio d\'aglio', defaultDoses: { day1: 15, day2: 30, day3: 60, unit: 'g' } },
  { id: 'GOS', name: 'Galatto-oligosaccaridi (GOS)', testExample: 'Ceci o Fagioli cotti', defaultDoses: { day1: 40, day2: 80, day3: 120, unit: 'g' } },
];

/**
 * Recupera il challenge attualmente attivo (o in washout), se presente.
 */
export async function getActiveChallenge() {
  const challenges = await getAll('challenges');
  return (challenges || []).find(c => 
    c.state !== 'FINALIZED' && c.state !== 'ABORTED_SYMPTOMS'
  ) || null;
}

/**
 * Recupera lo storico di tutti i challenge
 */
export async function getAllChallenges() {
  const challenges = await getAll('challenges');
  return (challenges || []).sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
}

/**
 * Avvia un nuovo Challenge controllato a 3 dosi per uno specifico alimento
 */
export async function startChallenge({ fodmapGroup, testFoodId, testFoodName, doses }) {
  const existingActive = await getActiveChallenge();
  if (existingActive) {
    throw new Error('C\'è già un challenge o un percorso di washout in corso. Concludi quello attuale prima di iniziarne uno nuovo.');
  }

  const todayStr = new Date().toISOString();
  const challengeId = uuidv4();

  const challenge = {
    id: challengeId,
    fodmapGroup,
    testFoodId: testFoodId || 'custom',
    testFoodName: testFoodName || 'Alimento di test',
    startDate: todayStr,
    state: 'DAY_1_ACTIVE',
    currentDay: 1,
    doses: doses || {
      day1: { amount: 30, unit: 'g', description: '1/4 dose test' },
      day2: { amount: 60, unit: 'g', description: '1/2 dose intermedia' },
      day3: { amount: 100, unit: 'g', description: 'Dose piena' }
    },
    dayLogs: [
      { day: 1, date: todayStr.slice(0, 10), doseConsumed: false, maxPain: null, maxBloating: null, notes: '' },
      { day: 2, date: '', doseConsumed: false, maxPain: null, maxBloating: null, notes: '' },
      { day: 3, date: '', doseConsumed: false, maxPain: null, maxBloating: null, notes: '' }
    ],
    washout: {
      isVoluntary: false,
      startDate: null,
      targetDays: 3,
      reason: 'standard_post_challenge'
    },
    outcome: null,
    confirmedByPatient: false,
    updatedToleranceApplied: false
  };

  await addRecord('challenges', challenge);
  return challenge;
}

/**
 * Avvia un percorso di Washout volontario (riposo intestinale autonomo)
 */
export async function startVoluntaryWashout({ targetDays = 3, reason = 'Riposo intestinale e recupero stabilità' }) {
  const existingActive = await getActiveChallenge();
  if (existingActive) {
    throw new Error('C\'è già una sessione attiva.');
  }

  const todayStr = new Date().toISOString();
  const challengeId = uuidv4();

  const session = {
    id: challengeId,
    fodmapGroup: 'LOW_FODMAP_SAFE',
    testFoodId: 'washout_period',
    testFoodName: 'Periodo di Washout Guidato',
    startDate: todayStr,
    state: 'WASHOUT_PERIOD',
    currentDay: null,
    doses: null,
    dayLogs: [],
    washout: {
      isVoluntary: true,
      startDate: todayStr,
      targetDays: targetDays || 3,
      reason: reason
    },
    outcome: null,
    confirmedByPatient: false,
    updatedToleranceApplied: false
  };

  await addRecord('challenges', session);
  return session;
}

/**
 * Registra il consumo della dose del giorno attivo e la risposta sintomatica
 */
export async function recordDayProgress(challengeId, { day, doseConsumed, pain, bloat, notes = '' }) {
  const challenge = await getRecord('challenges', challengeId);
  if (!challenge) throw new Error('Challenge non trovato.');

  const dayIndex = day - 1;
  const todayStr = new Date().toISOString();

  if (!challenge.dayLogs[dayIndex]) {
    challenge.dayLogs[dayIndex] = { day, date: todayStr.slice(0, 10), doseConsumed: false, maxPain: null, maxBloating: null };
  }

  const log = challenge.dayLogs[dayIndex];
  log.date = todayStr.slice(0, 10);
  log.doseConsumed = doseConsumed;
  log.maxPain = pain;
  log.maxBloating = bloat;
  log.notes = notes;

  // Criterio clinico di arresto precoce: dolore o gonfiore severo (≥ 5 su 10)
  const isSevere = (pain >= 5) || (bloat >= 6);

  if (isSevere) {
    challenge.state = 'WASHOUT_PERIOD';
    challenge.outcome = 'SEVERE_SYMPTOMS_FAILED';
    challenge.washout = {
      isVoluntary: false,
      startDate: todayStr,
      targetDays: 4, // Washout esteso se ci sono sintomi severi
      reason: `Interrotto al Giorno ${day} per sintomi sopra soglia (Dolore: ${pain}/10, Gonfiore: ${bloat}/10)`
    };
  } else if (day === 1) {
    challenge.state = 'DAY_2_ACTIVE';
    challenge.currentDay = 2;
  } else if (day === 2) {
    challenge.state = 'DAY_3_ACTIVE';
    challenge.currentDay = 3;
  } else if (day === 3) {
    // 3 Dosi completate con successo -> avvio del Washout standard di consolidamento
    challenge.state = 'WASHOUT_PERIOD';
    challenge.washout = {
      isVoluntary: false,
      startDate: todayStr,
      targetDays: 3,
      reason: 'Washout post-dosi completate (attesa consolidamento stabilità)'
    };
  }

  await updateRecord('challenges', challenge);
  return challenge;
}

/**
 * Conclude formalmente il periodo di Washout o finalizza l'esito del challenge
 */
export async function finalizeChallenge(challengeId, { customOutcome = null, updateFoodStatus = true }) {
  const challenge = await getRecord('challenges', challengeId);
  if (!challenge) throw new Error('Challenge non trovato.');

  let outcome = customOutcome;
  if (!outcome) {
    if (challenge.outcome === 'SEVERE_SYMPTOMS_FAILED') {
      outcome = 'SEVERE_SYMPTOMS_FAILED';
    } else {
      const logs = challenge.dayLogs || [];
      const maxPain = Math.max(...logs.map(l => l.maxPain ?? 0), 0);
      const maxBloat = Math.max(...logs.map(l => l.maxBloating ?? 0), 0);

      if (maxPain <= 2 && maxBloat <= 3) {
        outcome = 'TOLERATED_HIGH_DOSE';
      } else if (maxPain <= 4 && maxBloat <= 5) {
        outcome = 'MILD_SYMPTOMS_ACCEPTABLE';
      } else {
        outcome = 'TOLERATED_MEDIUM_DOSE';
      }
    }
  }

  challenge.outcome = outcome;
  challenge.state = 'FINALIZED';
  challenge.confirmedByPatient = true;

  // Se associato a un alimento nel catalogo `foods`, aggiorna la sua scheda di tolleranza
  if (updateFoodStatus && challenge.testFoodId && challenge.testFoodId !== 'custom' && challenge.testFoodId !== 'washout_period') {
    try {
      const food = await getFoodById(challenge.testFoodId);
      if (food) {
        if (!food.tolerance) food.tolerance = {};
        
        if (outcome === 'TOLERATED_HIGH_DOSE') {
          food.tolerance.status = 'FREELY_TOLERATED';
          food.tolerance.maxToleratedPortion = challenge.doses?.day3 || { amount: 150, unit: 'g' };
        } else if (outcome === 'TOLERATED_MEDIUM_DOSE' || outcome === 'MILD_SYMPTOMS_ACCEPTABLE') {
          food.tolerance.status = 'DOSE_LIMITED';
          food.tolerance.maxToleratedPortion = challenge.doses?.day2 || { amount: 60, unit: 'g' };
        } else if (outcome === 'SEVERE_SYMPTOMS_FAILED') {
          food.tolerance.status = 'NOT_TOLERATED';
        }
        
        food.tolerance.evidenceLevel = 'CONTROLLED_CHALLENGE';
        food.tolerance.lastTestedDate = new Date().toISOString();
        food.tolerance.personalNotes = `Validato via Challenge a 3 dosi in data ${new Date().toLocaleDateString('it-IT')}`;
        await saveFood(food);
        challenge.updatedToleranceApplied = true;
      }
    } catch (e) {
      console.warn('Errore aggiornamento tolleranza alimento:', e);
    }
  }

  await updateRecord('challenges', challenge);
  return challenge;
}

/**
 * Annulla forzatamente il challenge o washout in corso
 */
export async function abortChallenge(challengeId, reason = 'Annullato dall\'utente') {
  const challenge = await getRecord('challenges', challengeId);
  if (!challenge) return;
  challenge.state = 'ABORTED_SYMPTOMS';
  challenge.outcome = 'ABORTED_EARLY';
  if (!challenge.washout) challenge.washout = {};
  challenge.washout.reason = reason;
  await updateRecord('challenges', challenge);
}
