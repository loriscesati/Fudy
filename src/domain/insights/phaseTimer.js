import { parseLocalDate } from './trends.js';

export const REDUCTION_REVIEW_WEEKS = 6;

function localMidnight(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Never invents a start date: without a usable date no week is computed.
export function describePhase(profile = {}, now = Date.now()) {
  if (!profile.phase) return null;
  const start = parseLocalDate(profile.phaseStartedAt);
  const end = parseLocalDate(profile.phasePlannedEndAt);
  const today = localMidnight(now);
  const startKnown = start != null && start <= today;
  const week = startKnown ? Math.floor(Math.round((today - start) / 86400000) / 7) + 1 : null;
  return {
    phase: profile.phase,
    startKnown,
    startFuture: start != null && start > today,
    startEstimated: !!profile.phaseStartEstimated,
    startMs: start,
    week,
    plannedEnd: end,
    plannedEndPassed: end != null && end < today,
    reductionReview: profile.phase === 'REDUCTION' && week != null && week > REDUCTION_REVIEW_WEEKS
  };
}
