// src/infrastructure/storage/userProfile.js
// Simple wrapper for the user_profile store (singleton)
import { openDB } from './db.js';

const STORE_NAME = 'user_profile';
const PROFILE_KEY = 'current';

export async function getProfile() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(PROFILE_KEY);
    request.onsuccess = () => resolve(request.result || {});
    request.onerror = () => reject(request.error);
  });
}

export async function setProfile(profile) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({ key: PROFILE_KEY, ...profile });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
