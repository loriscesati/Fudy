/**
 * src/domain/insights/associationEngine.js
 *
 * Motore di analisi delle associazioni probabilistiche tra alimenti e sintomi.
 *
 * Principi fondamentali:
 * 1. NESSUN claim diagnostico — solo osservazioni statistiche con livello di evidenza.
 * 2. Finestre temporali fisiologiche: 4h per sintomi gastrici, 6-12h per fermentazione colica.
 * 3. I confondenti (ciclo, stress, farmaci, alcol) riducono il peso statistico.
 * 4. L'analisi è dose-dipendente: porzioni maggiori dello stesso alimento
 *    possono avere correlazioni diverse.
 * 5. Tutto il calcolo avviene localmente, in-memory.
 */

import { openDB } from '../../infrastructure/storage/db.js';

// ── Costanti ──────────────────────────────────────────────────────────────────

/** Finestra temporale di default per correlazione pasto → sintomo (ore) */
const DEFAULT_WINDOW_HOURS = {
  gastric: 4,   // Sintomi gastrici (dolore, nausea, pienezza)
  colonic: 8,   // Fermentazione colica (gonfiore, flatulenza, diarrea)
};

/** Soglie per i livelli di evidenza */
const EVIDENCE_THRESHOLDS = {
  OSSERVAZIONE_ISOLATA: 1,
  POSSIBILE_ASSOCIAZIONE: 2,
  ASSOCIAZIONE_RIPETUTA: 4,
};

/** Fattori confondenti che riducono il peso dell'osservazione */
const CONFOUNDER_WEIGHT_REDUCTION = 0.3; // Un'osservazione con confondente vale il 30% di una pulita

// ── Tipi di evidenza ──────────────────────────────────────────────────────────

/**
 * @typedef {'OSSERVAZIONE_ISOLATA' | 'POSSIBILE_ASSOCIAZIONE' | 'ASSOCIAZIONE_RIPETUTA' |
 *           'CONFONDIMENTO_PROBABILE' | 'CHALLENGE_STRUTTURATO' | 'SOGLIA_VERIFICATA' |
 *           'DA_RITESTARE'} EvidenceLevel
 */

/**
 * @typedef {Object} FoodSymptomAssociation
 * @property {string} foodId - ID dell'alimento
 * @property {string} foodName - Nome dell'alimento
 * @property {string[]} fodmapGroups - Gruppi FODMAP associati
 * @property {number} totalOccurrences - Quante volte l'alimento è stato consumato
 * @property {number} symptomOccurrences - Quante volte è stato seguito da sintomi elevati
 * @property {number} cleanOccurrences - Osservazioni senza confondenti
 * @property {number} confoundedOccurrences - Osservazioni con confondenti presenti
 * @property {number} correlationScore - Score di correlazione ponderato (0-1)
 * @property {number} confidenceLower - Limite inferiore dell'intervallo di confidenza
 * @property {number} confidenceUpper - Limite superiore dell'intervallo di confidenza
 * @property {EvidenceLevel} evidenceLevel - Livello di evidenza
 * @property {string[]} activeConfounders - Confondenti più frequenti nelle co-occorrenze
 * @property {Object[]} episodes - Dettagli degli episodi (pasto + sintomi)
 * @property {number} avgPainWhenConsumed - Dolore medio nelle finestre post-consumo
 * @property {number} avgBloatWhenConsumed - Gonfiore medio nelle finestre post-consumo
 * @property {number} avgPainBaseline - Dolore medio globale (per confronto)
 * @property {number} avgBloatBaseline - Gonfiore medio globale (per confronto)
 */

// ── Lettura dati ──────────────────────────────────────────────────────────────

async function getAllFromStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// ── Funzioni helper ───────────────────────────────────────────────────────────

/**
 * Calcola la differenza in ore tra due timestamp ISO.
 */
function hoursBetween(t1, t2) {
  const d1 = new Date(t1);
  const d2 = new Date(t2);
  return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60);
}

/**
 * Estrae la data YYYY-MM-DD da un timestamp ISO.
 */
function toDateKey(isoTimestamp) {
  return isoTimestamp ? isoTimestamp.slice(0, 10) : '';
}

/**
 * Verifica se una giornata ha confondenti attivi.
 * @param {Object} confounder - Record dei confondenti giornalieri
 * @returns {{ isConfounded: boolean, factors: string[] }}
 */
function checkConfounders(confounder) {
  if (!confounder) return { isConfounded: false, factors: [] };

  const factors = [];
  if (confounder.stressLevel === 'HIGH') factors.push('Stress elevato');
  if (confounder.sleepQuality === 'INSOMNIA') factors.push('Insonnia');
  if (confounder.alcoholIntake) factors.push('Alcol');
  if (confounder.intercurrentIllness) factors.push('Malattia intercorrente');
  if (confounder.heavyMealConsumed) factors.push('Pasto abbondante/grasso');
  if (confounder.travelOrRoutineChange) factors.push('Viaggio/cambio routine');

  return { isConfounded: factors.length > 0, factors };
}

/**
 * Verifica se un giorno ha confondimento mestruale/endometriosi.
 * @param {Object} cycleRecord - Record del ciclo mestruale
 * @returns {{ isConfounded: boolean, factors: string[] }}
 */
function checkCycleConfounder(cycleRecord) {
  if (!cycleRecord) return { isConfounded: false, factors: [] };

  const factors = [];
  if (cycleRecord.menstrualFlow && cycleRecord.menstrualFlow !== 'NONE') {
    factors.push('Flusso mestruale');
  }
  if (cycleRecord.dysmenorrhea > 3) factors.push('Dismenorrea');
  if (cycleRecord.pelvicPainNonCyclic > 3) factors.push('Dolore pelvico');
  if (cycleRecord.endoBellyDistension) factors.push('Endo-belly');
  if (cycleRecord.dyschezia > 3) factors.push('Dischezia ciclica');

  return { isConfounded: factors.length > 0, factors };
}

/**
 * Determina se un sintomo è "elevato" (sopra soglia).
 * Soglia scelta: dolore > 3 oppure gonfiore > 3.
 */
function isSymptomElevated(symptom) {
  return (
    (symptom.abdominalPainIntensity != null && symptom.abdominalPainIntensity > 3) ||
    (symptom.bloatingIntensity != null && symptom.bloatingIntensity > 3)
  );
}

// ── Intervallo di confidenza Wilson ───────────────────────────────────────────

/**
 * Calcola l'intervallo di confidenza Wilson per una proporzione.
 * Più robusto dell'intervallo normale per piccoli campioni.
 *
 * @param {number} successes - Numero di "successi" (sintomi dopo consumo)
 * @param {number} total - Numero totale di osservazioni
 * @param {number} z - Valore z per il livello di confidenza (1.96 per 95%)
 * @returns {{ lower: number, upper: number }}
 */
function wilsonCI(successes, total, z = 1.96) {
  if (total === 0) return { lower: 0, upper: 1 };

  const p = successes / total;
  const denominator = 1 + z * z / total;
  const centre = (p + z * z / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total));

  return {
    lower: Math.max(0, centre - margin),
    upper: Math.min(1, centre + margin),
  };
}

// ── Motore principale ─────────────────────────────────────────────────────────

/**
 * Esegue l'analisi completa delle associazioni alimento-sintomo.
 *
 * @param {Object} options - Opzioni di analisi
 * @param {number} options.windowHoursGastric - Finestra gastrica (default: 4)
 * @param {number} options.windowHoursColonic - Finestra colica (default: 8)
 * @param {number} options.periodDays - Periodo di analisi (0 = tutto)
 * @param {string} options.fodmapGroupFilter - Filtro per gruppo FODMAP specifico
 * @returns {Promise<FoodSymptomAssociation[]>} Associazioni ordinate per score
 */
export async function analyzeAssociations(options = {}) {
  const windowGastric = options.windowHoursGastric ?? DEFAULT_WINDOW_HOURS.gastric;
  const windowColonic = options.windowHoursColonic ?? DEFAULT_WINDOW_HOURS.colonic;
  const periodDays = options.periodDays ?? 0;
  const fodmapFilter = options.fodmapGroupFilter || null;

  // 1. Carica tutti i dati
  const [allMeals, allSymptoms, allConfounders, allCycles, allFoods, allChallenges] =
    await Promise.all([
      getAllFromStore('meals'),
      getAllFromStore('symptoms'),
      getAllFromStore('confounders'),
      getAllFromStore('cycle_logs'),
      getAllFromStore('foods'),
      getAllFromStore('challenges'),
    ]);

  // 2. Filtra per periodo
  let meals = allMeals;
  let symptoms = allSymptoms;
  if (periodDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    const cutoffISO = cutoff.toISOString();
    meals = meals.filter((m) => m.timestamp >= cutoffISO);
    symptoms = symptoms.filter((s) => s.timestamp >= cutoffISO);
  }

  // 3. Indici per accesso rapido
  const confoundersByDate = {};
  for (const c of allConfounders) {
    confoundersByDate[c.date] = c;
  }

  const cyclesByDate = {};
  for (const c of allCycles) {
    cyclesByDate[c.date] = c;
  }

  const foodsById = {};
  for (const f of allFoods) {
    foodsById[f.id] = f;
  }

  // Challenge completati per alimento
  const challengesByFoodId = {};
  for (const ch of allChallenges) {
    if (ch.state === 'FINALIZED') {
      if (!challengesByFoodId[ch.testFoodId]) challengesByFoodId[ch.testFoodId] = [];
      challengesByFoodId[ch.testFoodId].push(ch);
    }
  }

  // Ordina i sintomi per timestamp
  symptoms.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  // 4. Calcola la media globale dei sintomi (baseline di riferimento)
  const allPainValues = symptoms.map((s) => s.abdominalPainIntensity).filter((v) => v != null);
  const allBloatValues = symptoms.map((s) => s.bloatingIntensity).filter((v) => v != null);
  const globalAvgPain = allPainValues.length > 0
    ? allPainValues.reduce((a, b) => a + b, 0) / allPainValues.length
    : 0;
  const globalAvgBloat = allBloatValues.length > 0
    ? allBloatValues.reduce((a, b) => a + b, 0) / allBloatValues.length
    : 0;

  // 5. Per ogni alimento, analizza le co-occorrenze con i sintomi
  /** @type {Map<string, Object>} */
  const foodAnalysis = new Map();

  for (const meal of meals) {
    if (!meal.items || !meal.timestamp) continue;

    const mealDate = toDateKey(meal.timestamp);
    const dayConfounder = confoundersByDate[mealDate];
    const dayCycle = cyclesByDate[mealDate];
    const confCheck = checkConfounders(dayConfounder);
    const cycleCheck = checkCycleConfounder(dayCycle);
    const allConfounders_factors = [...confCheck.factors, ...cycleCheck.factors];
    const isConfounded = confCheck.isConfounded || cycleCheck.isConfounded;

    // Trova i sintomi nella finestra temporale dopo questo pasto
    const windowEnd = windowColonic; // Usa la finestra più ampia
    const symptomsInWindow = symptoms.filter((s) => {
      const delta = hoursBetween(meal.timestamp, s.timestamp);
      return delta >= 0 && delta <= windowEnd;
    });

    const hasElevatedSymptoms = symptomsInWindow.some(isSymptomElevated);

    // Metriche medie dei sintomi in finestra
    const windowPain = symptomsInWindow
      .map((s) => s.abdominalPainIntensity)
      .filter((v) => v != null);
    const windowBloat = symptomsInWindow
      .map((s) => s.bloatingIntensity)
      .filter((v) => v != null);
    const avgWindowPain = windowPain.length > 0
      ? windowPain.reduce((a, b) => a + b, 0) / windowPain.length
      : 0;
    const avgWindowBloat = windowBloat.length > 0
      ? windowBloat.reduce((a, b) => a + b, 0) / windowBloat.length
      : 0;

    // Per ogni ingrediente nel pasto
    for (const item of meal.items) {
      const foodId = item.foodId;
      if (!foodId) continue;

      // Filtra per gruppo FODMAP se richiesto
      const groups = item.fodmapGroupsSnapshot || [];
      if (fodmapFilter && !groups.includes(fodmapFilter)) continue;

      // Inizializza se primo incontro
      if (!foodAnalysis.has(foodId)) {
        foodAnalysis.set(foodId, {
          foodId,
          foodName: item.foodName || '(sconosciuto)',
          fodmapGroups: groups,
          totalOccurrences: 0,
          symptomOccurrences: 0,
          cleanOccurrences: 0,
          cleanSymptomOccurrences: 0,
          confoundedOccurrences: 0,
          confoundedSymptomOccurrences: 0,
          allConfounders: [],
          painSum: 0,
          bloatSum: 0,
          painCount: 0,
          bloatCount: 0,
          episodes: [],
        });
      }

      const analysis = foodAnalysis.get(foodId);
      analysis.totalOccurrences++;

      if (hasElevatedSymptoms) {
        analysis.symptomOccurrences++;
      }

      if (isConfounded) {
        analysis.confoundedOccurrences++;
        if (hasElevatedSymptoms) analysis.confoundedSymptomOccurrences++;
        analysis.allConfounders.push(...allConfounders_factors);
      } else {
        analysis.cleanOccurrences++;
        if (hasElevatedSymptoms) analysis.cleanSymptomOccurrences++;
      }

      // Accumula le medie
      if (windowPain.length > 0) {
        analysis.painSum += avgWindowPain;
        analysis.painCount++;
      }
      if (windowBloat.length > 0) {
        analysis.bloatSum += avgWindowBloat;
        analysis.bloatCount++;
      }

      // Salva l'episodio (per espansione nel dettaglio)
      analysis.episodes.push({
        mealId: meal.id,
        mealTimestamp: meal.timestamp,
        mealType: meal.mealType,
        portion: item.consumedPortion,
        preparation: item.preparationUsed,
        isEstimated: item.isEstimated,
        symptomsInWindow: symptomsInWindow.map((s) => ({
          timestamp: s.timestamp,
          pain: s.abdominalPainIntensity,
          bloat: s.bloatingIntensity,
          comparison: s.generalComparisonToBaseline,
        })),
        hadElevatedSymptoms: hasElevatedSymptoms,
        confounders: allConfounders_factors,
        isConfounded,
      });
    }
  }

  // 6. Calcola score, intervallo di confidenza e livello di evidenza
  /** @type {FoodSymptomAssociation[]} */
  const results = [];

  for (const [foodId, analysis] of foodAnalysis) {
    if (analysis.totalOccurrences === 0) continue;

    // Score ponderato: le osservazioni con confondenti pesano meno
    const weightedSymptoms =
      analysis.cleanSymptomOccurrences +
      analysis.confoundedSymptomOccurrences * CONFOUNDER_WEIGHT_REDUCTION;
    const weightedTotal =
      analysis.cleanOccurrences +
      analysis.confoundedOccurrences * CONFOUNDER_WEIGHT_REDUCTION;

    const correlationScore = weightedTotal > 0 ? weightedSymptoms / weightedTotal : 0;

    // Intervallo di confidenza Wilson
    const ci = wilsonCI(analysis.symptomOccurrences, analysis.totalOccurrences);

    // Livello di evidenza
    let evidenceLevel = determineEvidenceLevel(
      analysis,
      challengesByFoodId[foodId] || [],
      foodsById[foodId]
    );

    // Medie dei sintomi
    const avgPainWhenConsumed = analysis.painCount > 0 ? analysis.painSum / analysis.painCount : 0;
    const avgBloatWhenConsumed = analysis.bloatCount > 0 ? analysis.bloatSum / analysis.bloatCount : 0;

    // Confondenti più frequenti
    const confounderCounts = {};
    for (const c of analysis.allConfounders) {
      confounderCounts[c] = (confounderCounts[c] || 0) + 1;
    }
    const activeConfounders = Object.entries(confounderCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    results.push({
      foodId,
      foodName: analysis.foodName,
      fodmapGroups: analysis.fodmapGroups,
      totalOccurrences: analysis.totalOccurrences,
      symptomOccurrences: analysis.symptomOccurrences,
      cleanOccurrences: analysis.cleanOccurrences,
      confoundedOccurrences: analysis.confoundedOccurrences,
      correlationScore: Math.round(correlationScore * 1000) / 1000,
      confidenceLower: Math.round(ci.lower * 1000) / 1000,
      confidenceUpper: Math.round(ci.upper * 1000) / 1000,
      evidenceLevel,
      activeConfounders,
      episodes: analysis.episodes,
      avgPainWhenConsumed: Math.round(avgPainWhenConsumed * 10) / 10,
      avgBloatWhenConsumed: Math.round(avgBloatWhenConsumed * 10) / 10,
      avgPainBaseline: Math.round(globalAvgPain * 10) / 10,
      avgBloatBaseline: Math.round(globalAvgBloat * 10) / 10,
    });
  }

  // 7. Ordina per score di correlazione (dal più sospetto al meno)
  results.sort((a, b) => b.correlationScore - a.correlationScore);

  return results;
}

/**
 * Determina il livello di evidenza per un'associazione.
 */
function determineEvidenceLevel(analysis, challenges, food) {
  // Se esiste un challenge strutturato completato
  if (challenges.length > 0) {
    const latestChallenge = challenges.sort((a, b) =>
      (b.startDate || '').localeCompare(a.startDate || '')
    )[0];

    // Controlla se è più vecchio di 6 mesi
    if (latestChallenge.startDate) {
      const challengeDate = new Date(latestChallenge.startDate);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      if (challengeDate < sixMonthsAgo) {
        return 'DA_RITESTARE';
      }
    }

    // Se c'è una soglia verificata dalla scheda alimento
    if (food?.tolerance?.status === 'DOSE_LIMITED' && food.tolerance.maxToleratedPortion) {
      return 'SOGLIA_VERIFICATA';
    }

    return 'CHALLENGE_STRUTTURATO';
  }

  // Se la maggior parte delle osservazioni ha confondenti
  if (
    analysis.confoundedOccurrences > analysis.cleanOccurrences &&
    analysis.symptomOccurrences > 0
  ) {
    return 'CONFONDIMENTO_PROBABILE';
  }

  // Basato sul numero di osservazioni pulite con sintomi
  const cleanSymptoms = analysis.cleanSymptomOccurrences;

  if (cleanSymptoms >= EVIDENCE_THRESHOLDS.ASSOCIAZIONE_RIPETUTA) {
    return 'ASSOCIAZIONE_RIPETUTA';
  }
  if (cleanSymptoms >= EVIDENCE_THRESHOLDS.POSSIBILE_ASSOCIAZIONE) {
    return 'POSSIBILE_ASSOCIAZIONE';
  }
  if (cleanSymptoms >= EVIDENCE_THRESHOLDS.OSSERVAZIONE_ISOLATA) {
    return 'OSSERVAZIONE_ISOLATA';
  }

  // Nessuna correlazione significativa osservata
  return 'OSSERVAZIONE_ISOLATA';
}

// ── Analisi co-fattoriale (multifattoriale) ───────────────────────────────────

/**
 * Analizza le combinazioni di alimenti che co-occorrono con sintomi elevati.
 * Identifica pattern come "grasso + fruttani → più sintomi vs fruttani da soli".
 *
 * @param {Object} options - Stesse opzioni di analyzeAssociations
 * @returns {Promise<Object[]>} Combinazioni con score
 */
export async function analyzeMultifactorial(options = {}) {
  const windowColonic = options.windowHoursColonic ?? DEFAULT_WINDOW_HOURS.colonic;
  const periodDays = options.periodDays ?? 0;

  const [allMeals, allSymptoms] = await Promise.all([
    getAllFromStore('meals'),
    getAllFromStore('symptoms'),
  ]);

  let meals = allMeals;
  let symptoms = allSymptoms;
  if (periodDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    const cutoffISO = cutoff.toISOString();
    meals = meals.filter((m) => m.timestamp >= cutoffISO);
    symptoms = symptoms.filter((s) => s.timestamp >= cutoffISO);
  }

  symptoms.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  // Analizza ogni pasto come "combinazione di gruppi FODMAP"
  /** @type {Map<string, {combo: string[], withSymptoms: number, without: number}>} */
  const comboMap = new Map();

  for (const meal of meals) {
    if (!meal.items || !meal.timestamp) continue;

    // Estrai i gruppi FODMAP unici presenti nel pasto
    const groups = new Set();
    for (const item of meal.items) {
      for (const g of item.fodmapGroupsSnapshot || []) {
        if (g !== 'LOW_FODMAP_SAFE') groups.add(g);
      }
    }

    if (groups.size === 0) continue;

    const comboKey = Array.from(groups).sort().join('+');

    // Verifica sintomi nella finestra
    const symptomsInWindow = symptoms.filter((s) => {
      const delta = hoursBetween(meal.timestamp, s.timestamp);
      return delta >= 0 && delta <= windowColonic;
    });

    const hasElevated = symptomsInWindow.some(isSymptomElevated);

    if (!comboMap.has(comboKey)) {
      comboMap.set(comboKey, { combo: Array.from(groups).sort(), withSymptoms: 0, without: 0 });
    }

    const entry = comboMap.get(comboKey);
    if (hasElevated) {
      entry.withSymptoms++;
    } else {
      entry.without++;
    }
  }

  // Calcola score e ordina
  const results = [];
  for (const [, entry] of comboMap) {
    const total = entry.withSymptoms + entry.without;
    if (total < 2) continue; // Ignora combo con meno di 2 osservazioni

    const rate = entry.withSymptoms / total;
    const ci = wilsonCI(entry.withSymptoms, total);

    results.push({
      fodmapCombination: entry.combo,
      combinationLabel: entry.combo.map((g) => FODMAP_GROUP_SHORT[g] || g).join(' + '),
      totalMeals: total,
      mealsWithSymptoms: entry.withSymptoms,
      mealsWithout: entry.without,
      symptomRate: Math.round(rate * 1000) / 1000,
      confidenceLower: Math.round(ci.lower * 1000) / 1000,
      confidenceUpper: Math.round(ci.upper * 1000) / 1000,
    });
  }

  results.sort((a, b) => b.symptomRate - a.symptomRate);
  return results;
}

/** Etichette abbreviate per le combinazioni */
const FODMAP_GROUP_SHORT = {
  FRUCTANS_GRAIN: 'Fruttani (cer.)',
  FRUCTANS_VEG_GARLIC: 'Fruttani (aglio)',
  GOS: 'GOS',
  LACTOSE: 'Lattosio',
  EXCESS_FRUCTOSE: 'Fruttosio',
  SORBITOL: 'Sorbitolo',
  MANNITOL: 'Mannitolo',
  LOW_FODMAP_SAFE: 'Basso',
};

// ── Etichette per la UI ───────────────────────────────────────────────────────

export const EVIDENCE_LABELS = {
  OSSERVAZIONE_ISOLATA: { label: 'Osservazione isolata', icon: '🔍', color: '#9CA3AF' },
  POSSIBILE_ASSOCIAZIONE: { label: 'Possibile associazione', icon: '🟡', color: '#F59E0B' },
  ASSOCIAZIONE_RIPETUTA: { label: 'Associazione ripetuta', icon: '🟠', color: '#F97316' },
  CONFONDIMENTO_PROBABILE: { label: 'Confondimento probabile', icon: '⚠️', color: '#8B5CF6' },
  CHALLENGE_STRUTTURATO: { label: 'Challenge strutturato', icon: '✅', color: '#10B981' },
  SOGLIA_VERIFICATA: { label: 'Soglia verificata', icon: '🎯', color: '#3B82F6' },
  DA_RITESTARE: { label: 'Da ritestare (>6 mesi)', icon: '🔄', color: '#EF4444' },
};
