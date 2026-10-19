export function validScore(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10;
}

export function meanScore(values) {
  const valid = values.filter(validScore);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

export function baselineChange(baseline, current) {
  if (!validScore(baseline) || !validScore(current)) return { difference: null, improvementPercent: null };
  return { difference: current - baseline, improvementPercent: baseline > 0 ? (baseline - current) / baseline * 100 : null };
}

export function localDateKey(timestamp) {
  if (typeof timestamp !== 'string' || !timestamp.trim()) return null;
  const d = new Date(timestamp);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function summarizeSymptomDays(symptoms, threshold = 2) {
  if (!validScore(threshold)) throw new RangeError('Soglia non valida');
  const days = new Map();
  for (const s of symptoms) {
    const day = localDateKey(s.timestamp);
    if (!day) continue;
    const state = days.get(day) || { observed: false, elevated: false };
    const scores = [s.abdominalPainIntensity, s.bloatingIntensity];
    if (scores.every(validScore)) state.observed = true;
    if (scores.some(v => validScore(v) && v > threshold)) state.elevated = true;
    days.set(day, state);
  }
  let lowSymptomDays = 0, elevatedDays = 0, unknownDays = 0;
  for (const state of days.values()) {
    if (state.elevated) elevatedDays++;
    else if (state.observed) lowSymptomDays++;
    else unknownDays++;
  }
  return { recordedDays: days.size, lowSymptomDays, elevatedDays, unknownDays };
}

// Observation is not proof of complete symptom coverage or of causality.
export function classifyFollowup(symptoms, threshold = 3) {
  if (!validScore(threshold)) throw new RangeError('Soglia non valida');
  const elevated = symptoms.some(s => [s.abdominalPainIntensity, s.bloatingIntensity].some(v => validScore(v) && v > threshold));
  if (elevated) return 'ELEVATED';
  const observed = symptoms.some(s => validScore(s.abdominalPainIntensity) && validScore(s.bloatingIntensity));
  return observed ? 'OBSERVED_NOT_ELEVATED' : 'UNKNOWN';
}
