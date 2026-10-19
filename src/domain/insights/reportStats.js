import { meanScore, baselineChange, summarizeSymptomDays } from './statisticsCore.js';

// Descriptive report numbers only: no diagnosis, no causal claim.
export function computeReportStats(symptoms, bristol, profile = {}) {
  const avgPain = meanScore(symptoms.map(s => s.abdominalPainIntensity));
  const avgBloat = meanScore(symptoms.map(s => s.bloatingIntensity));
  const bristolDist = [0, 0, 0, 0, 0, 0, 0];
  for (const b of bristol) {
    if (Number.isInteger(b.bristolType) && b.bristolType >= 1 && b.bristolType <= 7) bristolDist[b.bristolType - 1]++;
  }
  return {
    avgPain,
    avgBloat,
    avgPelvic: meanScore(symptoms.map(s => s.pelvicPainIntensity)),
    painChange: baselineChange(profile?.baseline?.pain ?? null, avgPain),
    bloatChange: baselineChange(profile?.baseline?.bloat ?? null, avgBloat),
    symptomDays: summarizeSymptomDays(symptoms),
    endoBellyCount: symptoms.filter(s => s.endoBellyDistension === true).length,
    dyscheziaCount: symptoms.filter(s => s.dyschezia === true).length,
    bristolDist,
    totalBristol: bristolDist.reduce((a, b) => a + b, 0)
  };
}
