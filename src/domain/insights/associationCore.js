import { classifyFollowup, meanScore, localDateKey } from './statisticsCore.js';
import { groupOccasions } from './occasions.js';

export const EVIDENCE_LABELS = {
  INSUFFICIENT_DATA: { label: 'Dati insufficienti', color: '#6b7280' },
  NO_SIGNAL: { label: 'Nessun segnale nei dati osservati', color: '#059669' },
  SINGLE_DAY: { label: 'Sintomi in un solo giorno', color: '#d97706' },
  REPEATED_DAYS: { label: 'Sintomi in giorni diversi', color: '#dc2626' }
};
const MIN_OBSERVED_DAYS = 3;

export function wilson(successes, total) {
  if (!total) return { lower: null, upper: null };
  const z = 1.96, p = successes / total, d = 1 + z * z / total;
  const centre = (p + z * z / (2 * total)) / d;
  const margin = z / d * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total));
  return { lower: Math.max(0, centre - margin), upper: Math.min(1, centre + margin) };
}

// Distinguishes "never filled" from "filled, nothing declared". The cycle is deliberately not used.
export function dayFactorState(record) {
  if (!record) return { state: 'NOT_FILLED', factors: [] };
  const factors = [
    record.stressLevel === 'HIGH' && 'Stress elevato',
    record.sleepQuality === 'INSOMNIA' && 'Insonnia',
    record.alcoholIntake && 'Alcol',
    record.intercurrentIllness && 'Farmaci o malattia',
    record.heavyMealConsumed && 'Pasto abbondante o grasso',
    record.travelOrRoutineChange && 'Viaggio o cambio routine'
  ].filter(Boolean);
  return { state: factors.length ? 'DECLARED' : 'NONE_DECLARED', factors };
}

export function evaluateOccasions({ meals = [], symptoms = [], confounders = [] }, options = {}) {
  const hours = options.windowHours ?? 8;
  const threshold = options.threshold ?? 3;
  if (!(hours > 0)) throw new RangeError('Finestra non valida');
  const now = options.now ?? Date.now();
  const cutoff = options.periodDays > 0 ? now - options.periodDays * 86400000 : -Infinity;
  const windowMs = hours * 3600000;
  const time = ts => Date.parse(ts);
  const checks = symptoms.filter(s => Number.isFinite(time(s.timestamp)) && time(s.timestamp) <= now);
  const inRange = ts => Number.isFinite(time(ts)) && time(ts) >= cutoff && time(ts) <= now;
  const occasions = groupOccasions(meals.filter(m => inRange(m.timestamp)), options.gapMinutes);
  const byDate = new Map(confounders.map(c => [c.date, c]));
  const evaluated = occasions.map(o => {
    const end = o.startAt + windowMs;
    const inWindow = checks.filter(s => time(s.timestamp) >= o.startAt && time(s.timestamp) <= end);
    const base = classifyFollowup(inWindow, threshold);
    const status = base === 'ELEVATED' ? 'ELEVATED' : (end > now ? 'PENDING' : base);
    return {
      ...o, status, inWindow,
      sharedWindow: occasions.some(x => x !== o && Math.abs(x.startAt - o.startAt) < windowMs),
      day: localDateKey(o.timestamp),
      dayFactors: dayFactorState(byDate.get(localDateKey(o.timestamp)))
    };
  });
  return { evaluated, checks, cutoff, now };
}

const isObserved = s => s === 'ELEVATED' || s === 'OBSERVED_NOT_ELEVATED';

export function summarizeOccasions(inputs, options = {}) {
  const { evaluated } = evaluateOccasions(inputs, options);
  const count = status => evaluated.filter(o => o.status === status).length;
  return { total: evaluated.length, observed: evaluated.filter(o => isObserved(o.status)).length, pending: count('PENDING'), unknown: count('UNKNOWN') };
}

export function computeFoodAssociations(inputs, options = {}) {
  const { evaluated, checks, cutoff, now } = evaluateOccasions(inputs, options);
  const foods = new Map();
  for (const o of evaluated) {
    for (const foodId of o.foodIds) {
      const items = o.items.filter(i => i.foodId === foodId);
      const groups = [...new Set(items.flatMap(i => i.fodmapGroupsSnapshot || []))];
      if (options.fodmapGroupFilter && !groups.includes(options.fodmapGroupFilter)) continue;
      if (!foods.has(foodId)) foods.set(foodId, { foodId, foodName: items[0].foodName || foodId, fodmapGroups: groups, episodes: [] });
      foods.get(foodId).episodes.push({
        occasionId: o.id, timestamp: o.timestamp, mealType: o.mealType, status: o.status, day: o.day,
        taps: items.reduce((n, i) => n + (i.occurrences ?? 1), 0),
        coFoods: o.items.filter(i => i.foodId !== foodId).map(i => i.foodName || i.foodId).filter((n, k, a) => a.indexOf(n) === k),
        separable: o.foodIds.length === 1, sharedWindow: o.sharedWindow, dayFactors: o.dayFactors,
        checks: o.inWindow
      });
    }
  }
  const periodChecks = checks.filter(s => Date.parse(s.timestamp) >= cutoff);
  const avgPainPeriod = meanScore(periodChecks.map(s => s.abdominalPainIntensity));
  const avgBloatPeriod = meanScore(periodChecks.map(s => s.bloatingIntensity));
  const latestChallenge = new Map();
  for (const c of inputs.challenges || []) {
    if (c.state !== 'FINALIZED') continue;
    const prev = latestChallenge.get(c.testFoodId);
    if (!prev || String(c.startDate) > String(prev.startDate)) latestChallenge.set(c.testFoodId, c);
  }
  return [...foods.values()].map(f => {
    const observed = f.episodes.filter(e => isObserved(e.status));
    const days = new Map();
    for (const e of observed) {
      const d = days.get(e.day) || { elevated: false };
      if (e.status === 'ELEVATED') d.elevated = true;
      days.set(e.day, d);
    }
    const observedDays = days.size;
    const elevatedDays = [...days.values()].filter(d => d.elevated).length;
    const strata = { NOT_FILLED: { observed: 0, elevated: 0 }, NONE_DECLARED: { observed: 0, elevated: 0 }, DECLARED: { observed: 0, elevated: 0 } };
    for (const e of observed) {
      strata[e.dayFactors.state].observed++;
      if (e.status === 'ELEVATED') strata[e.dayFactors.state].elevated++;
    }
    const used = new Set(observed.flatMap(e => e.checks));
    const ci = wilson(elevatedDays, observedDays);
    const evidence = observedDays < MIN_OBSERVED_DAYS ? 'INSUFFICIENT_DATA' : elevatedDays === 0 ? 'NO_SIGNAL' : elevatedDays === 1 ? 'SINGLE_DAY' : 'REPEATED_DAYS';
    const ch = latestChallenge.get(f.foodId);
    return {
      foodId: f.foodId, foodName: f.foodName, fodmapGroups: f.fodmapGroups,
      totalTaps: f.episodes.reduce((n, e) => n + e.taps, 0),
      totalOccasions: f.episodes.length, observedOccasions: observed.length,
      elevatedOccasions: observed.filter(e => e.status === 'ELEVATED').length,
      pendingOccasions: f.episodes.filter(e => e.status === 'PENDING').length,
      unknownOccasions: f.episodes.filter(e => e.status === 'UNKNOWN').length,
      separableOccasions: f.episodes.filter(e => e.separable).length,
      sharedWindowOccasions: f.episodes.filter(e => e.sharedWindow).length,
      observedDays, elevatedDays,
      dayRate: observedDays ? elevatedDays / observedDays : null,
      confidenceLower: ci.lower, confidenceUpper: ci.upper,
      evidence, strata,
      avgPainAfter: meanScore([...used].map(s => s.abdominalPainIntensity)),
      avgBloatAfter: meanScore([...used].map(s => s.bloatingIntensity)),
      avgPainPeriod, avgBloatPeriod,
      challenge: ch ? { outcome: ch.outcome || null, startDate: ch.startDate || null } : null,
      episodes: f.episodes
    };
  }).sort((a, b) => b.elevatedDays - a.elevatedDays || b.observedDays - a.observedDays || a.foodName.localeCompare(b.foodName));
}

// Same-occasion co-occurrence of FODMAP groups. It is not an interaction test.
export function computeGroupCombinations(inputs, options = {}) {
  const { evaluated } = evaluateOccasions(inputs, options);
  const combos = new Map();
  for (const o of evaluated) {
    const groups = [...new Set(o.items.flatMap(i => i.fodmapGroupsSnapshot || []).filter(g => g !== 'LOW_FODMAP_SAFE'))].sort();
    if (!groups.length) continue;
    const key = groups.join('+');
    if (!combos.has(key)) combos.set(key, { groups, total: 0, observed: 0, elevated: 0, pending: 0, unknown: 0 });
    const c = combos.get(key);
    c.total++;
    if (isObserved(o.status)) c.observed++;
    if (o.status === 'ELEVATED') c.elevated++;
    if (o.status === 'PENDING') c.pending++;
    if (o.status === 'UNKNOWN') c.unknown++;
  }
  return [...combos.values()].filter(c => c.total >= 2).map(c => ({ ...c, rate: c.observed ? c.elevated / c.observed : null }));
}
