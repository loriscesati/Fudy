export const FACTOR_KEYS = ['stressLevel', 'alcoholIntake', 'travelOrRoutineChange', 'heavyMealConsumed', 'intercurrentIllness'];

// Reads the stored day record as booleans, so the check-in form can show what was already declared.
export function recordToFlags(record) {
  const flags = {};
  for (const key of FACTOR_KEYS) flags[key] = key === 'stressLevel' ? record?.stressLevel === 'HIGH' : !!record?.[key];
  return flags;
}

// The form state replaces the declared factors of that day; unrelated fields are preserved.
export function flagsToRecord(date, flags, existing = {}, declaredAt = new Date().toISOString()) {
  const record = { ...existing, date, declaredAt };
  for (const key of FACTOR_KEYS) record[key] = key === 'stressLevel' ? (flags?.[key] ? 'HIGH' : 'NORMAL') : !!flags?.[key];
  return record;
}
