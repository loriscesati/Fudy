import { getRecord, updateRecord } from './db.js';

export async function getProfile() {
  return (await getRecord('user_profile', 'current')) || {};
}

export async function setProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new TypeError('Profilo non valido');
  }
  await updateRecord('user_profile', { ...profile, key: 'current' });
}
