import { analyzeAssociations as legacyAnalyze } from './associationEngine.js';
import { getAll } from '../../infrastructure/storage/db.js';
import { classifyFollowup, meanScore } from './statisticsCore.js';

function interval(successes, total) {
  if (!total) return { lower: null, upper: null };
  const z = 1.96, p = successes / total, d = 1 + z * z / total;
  const c = (p + z * z / (2 * total)) / d;
  const m = z / d * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total));
  return { lower: Math.max(0, c - m), upper: Math.min(1, c + m) };
}
export function correctFollowup(result) {
  const episodes = result.episodes.map(e => {
    const checks = e.symptomsInWindow.map(s => ({ abdominalPainIntensity: s.pain, bloatingIntensity: s.bloat }));
    const observationStatus = classifyFollowup(checks);
    return { ...e, observationStatus, hadElevatedSymptoms: observationStatus === 'UNKNOWN' ? null : observationStatus === 'ELEVATED' };
  });
  const observed = episodes.filter(e => e.observationStatus !== 'UNKNOWN');
  const positive = observed.filter(e => e.hadElevatedSymptoms);
  const clean = observed.filter(e => !e.isConfounded);
  const confounded = observed.filter(e => e.isConfounded);
  const denominator = clean.length + 0.3 * confounded.length;
  const numerator = clean.filter(e => e.hadElevatedSymptoms).length + 0.3 * confounded.filter(e => e.hadElevatedSymptoms).length;
  const ci = interval(positive.length, observed.length);
  return { ...result, episodes, observedOccurrences: observed.length, unknownOccurrences: episodes.length - observed.length, symptomOccurrences: positive.length, cleanOccurrences: clean.length, confoundedOccurrences: confounded.length, correlationScore: denominator ? numerator / denominator : null, confidenceLower: ci.lower, confidenceUpper: ci.upper, avgPainWhenConsumed: meanScore(observed.flatMap(e => e.symptomsInWindow.map(s => s.pain))), avgBloatWhenConsumed: meanScore(observed.flatMap(e => e.symptomsInWindow.map(s => s.bloat))) };
}
export async function analyzeAssociations(options = {}) {
  const [results, symptoms] = await Promise.all([legacyAnalyze(options), getAll('symptoms')]);
  const cutoff = options.periodDays > 0 ? Date.now() - options.periodDays * 86400000 : -Infinity;
  const checks = (symptoms || []).filter(s => Number.isFinite(Date.parse(s.timestamp)) && Date.parse(s.timestamp) >= cutoff && Date.parse(s.timestamp) <= Date.now());
  return results.map(correctFollowup).map(r => ({ ...r, avgPainBaseline: meanScore(checks.map(s => s.abdominalPainIntensity)), avgBloatBaseline: meanScore(checks.map(s => s.bloatingIntensity)) })).sort((a, b) => (b.correlationScore ?? -1) - (a.correlationScore ?? -1));
}
// Combinations remain same-record descriptions, not independent interaction tests.
export async function analyzeMultifactorial(options = {}) {
  const [meals, symptoms] = await Promise.all(['meals', 'symptoms'].map(getAll));
  const now = Date.now(), cutoff = options.periodDays > 0 ? now - options.periodDays * 86400000 : -Infinity;
  const hours = options.windowHoursColonic ?? 8;
  const groups = new Map();
  for (const meal of meals || []) {
    const at = Date.parse(meal.timestamp);
    if (!Number.isFinite(at) || at < cutoff || at > now) continue;
    const tags = [...new Set((meal.items || []).flatMap(i => i.fodmapGroupsSnapshot || []).filter(g => g !== 'LOW_FODMAP_SAFE'))].sort();
    if (!tags.length) continue;
    const key = tags.join('+');
    if (!groups.has(key)) groups.set(key, { fodmapCombination: tags, combinationLabel: tags.join(' + '), totalMeals: 0, observedMeals: 0, unknownMeals: 0, mealsWithSymptoms: 0 });
    const r = groups.get(key); r.totalMeals++;
    const checks = (symptoms || []).filter(s => { const t = Date.parse(s.timestamp); return t >= at && t <= Math.min(now, at + hours * 3600000); });
    const status = classifyFollowup(checks);
    if (status === 'UNKNOWN') r.unknownMeals++; else { r.observedMeals++; if (status === 'ELEVATED') r.mealsWithSymptoms++; }
  }
  return [...groups.values()].filter(r => r.totalMeals >= 2).map(r => ({ ...r, symptomRate: r.observedMeals ? r.mealsWithSymptoms / r.observedMeals : null }));
}
