import { getAll } from '../../infrastructure/storage/db.js';
import { getProfile } from '../../infrastructure/storage/userProfile.js';
import { computeFoodAssociations, computeGroupCombinations, summarizeOccasions } from './associationCore.js';
import { weeklySeries, coverage, phaseSegments, summarizePhases } from './trends.js';

// One read of the local database; every number shown in Progressi comes from the pure modules.
export async function loadInsights(options = {}) {
  const [meals, symptoms, confounders, challenges, profile] = await Promise.all([
    getAll('meals'), getAll('symptoms'), getAll('confounders'), getAll('challenges'), getProfile()
  ]);
  const inputs = { meals: meals || [], symptoms: symptoms || [], confounders: confounders || [], challenges: challenges || [] };
  const now = options.now ?? Date.now();
  return {
    profile,
    associations: computeFoodAssociations(inputs, options),
    combinations: computeGroupCombinations(inputs, options),
    overview: summarizeOccasions(inputs, options),
    weekly: weeklySeries(inputs.symptoms, options),
    coverage: coverage(inputs.meals, inputs.symptoms, options),
    phases: summarizePhases(inputs.symptoms, phaseSegments(profile, now))
  };
}
