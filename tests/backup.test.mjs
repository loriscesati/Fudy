import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const core = await readFile(new URL('../src/domain/backupCore.js', import.meta.url), 'utf8');
const service = (await readFile(new URL('../src/infrastructure/storage/backupService.js', import.meta.url), 'utf8')).split('\n').filter(l => !l.startsWith('import ')).join('\n');
const code = (core + '\n' + service).replace(/^export /gm, '') + '\nexport { canonicalize, checksumOf, buildBackup, serializeBackup, parseBackupText, validateBackup, BackupError, restoreIntoDb, STORE_NAMES, BACKUP_VERSION };';
const m = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

const sample = () => ({
  foods: [{ id: 'uova', name: 'Uova', isCard: true, sugars: ['NONE'], primaryFodmapGroup: ['LOW_FODMAP_SAFE'] }],
  meals: [{ id: 'm1', timestamp: '2026-10-19T12:00:00+02:00', mealType: 'LUNCH', source: 'QUICK_TAP', items: [{ foodId: 'uova', foodName: 'Uova', occurrences: 1 }] }],
  symptoms: [{ id: 's1', timestamp: '2026-10-19T15:00:00+02:00', abdominalPainIntensity: 0, bloatingIntensity: null }],
  bowel_events: [{ id: 'b1', timestamp: '2026-10-19T09:00:00+02:00', bristolType: 4 }],
  challenges: [],
  confounders: [{ date: '2026-10-19', stressLevel: 'NORMAL', alcoholIntake: false }],
  user_profile: [{ key: 'current', phase: 'REDUCTION', baseline: { pain: 0, bloat: null }, phaseHistory: [] }]
});
const make = async (stores = sample(), local = { fudy_prefs: '{"activeMeal":"cena"}' }) => m.buildBackup({ stores, local, now: new Date('2026-10-19T10:00:00Z') });
const roundtrip = async backup => m.parseBackupText(m.serializeBackup(backup));

test('a backup round-trips exactly, including null and zero values', async () => {
  const stores = sample();
  const backup = await roundtrip(await make(stores));
  const report = await m.validateBackup(backup);
  assert.equal(report.ok, true, report.errors.join('; '));
  assert.deepEqual(backup.stores, stores);
  assert.equal(backup.stores.symptoms[0].abdominalPainIntensity, 0);
  assert.equal(backup.stores.symptoms[0].bloatingIntensity, null);
  assert.equal(report.summary.total, 6);
  assert.match(backup.checksum, /^[0-9a-f]{64}$/);
});

test('any change to the content is detected', async () => {
  const backup = await roundtrip(await make());
  backup.stores.symptoms[0].abdominalPainIntensity = 9;
  const report = await m.validateBackup(backup);
  assert.equal(report.ok, false);
  assert.match(report.errors[0], /integrita/);
  const moved = await roundtrip(await make());
  moved.local.fudy_prefs = '{}';
  assert.equal((await m.validateBackup(moved)).ok, false);
});

test('key order does not change the integrity check', async () => {
  const a = await m.checksumOf({ x: 1, y: { b: 2, a: 3 } });
  const b = await m.checksumOf({ y: { a: 3, b: 2 }, x: 1 });
  assert.equal(a, b);
  assert.equal(m.canonicalize({ b: undefined, a: 1 }), '{"a":1}');
});

test('structure problems block the import', async () => {
  const noStore = await roundtrip(await make()); delete noStore.stores.meals;
  assert.match((await m.validateBackup(noStore)).errors.join(' '), /Archivio mancante: meals/);
  const counts = await roundtrip(await make()); counts.counts.meals = 5;
  assert.equal((await m.validateBackup(counts)).ok, false);
  assert.equal((await m.validateBackup({ format: 'altro' })).ok, false);
  assert.equal((await m.validateBackup(null)).ok, false);
  const newer = await roundtrip(await make()); newer.version = m.BACKUP_VERSION + 1;
  assert.match((await m.validateBackup(newer)).errors[0], /piu recente/);
});

test('record level checks: duplicate keys, missing keys, bad dates, bad profile', async () => {
  const dup = sample(); dup.symptoms.push({ ...dup.symptoms[0] });
  assert.match((await m.validateBackup(await roundtrip(await make(dup)))).errors.join(' '), /duplicato/);
  const noId = sample(); noId.foods.push({ name: 'x' });
  assert.match((await m.validateBackup(await roundtrip(await make(noId)))).errors.join(' '), /manca id/);
  const badTime = sample(); badTime.meals[0].timestamp = 'ieri';
  assert.match((await m.validateBackup(await roundtrip(await make(badTime)))).errors.join(' '), /data e ora/);
  const badItems = sample(); badItems.meals[0].items = 'uova';
  assert.equal((await m.validateBackup(await roundtrip(await make(badItems)))).ok, false);
  const badDay = sample(); badDay.confounders[0].date = '19/10/2026';
  assert.equal((await m.validateBackup(await roundtrip(await make(badDay)))).ok, false);
  const badProfile = sample(); badProfile.user_profile[0].key = 'altro';
  assert.equal((await m.validateBackup(await roundtrip(await make(badProfile)))).ok, false);
  const two = sample(); two.user_profile.push({ key: 'current' });
  assert.equal((await m.validateBackup(await roundtrip(await make(two)))).ok, false);
});

test('error lists are capped but still report how many were skipped', async () => {
  const many = sample(); many.symptoms = Array.from({ length: 30 }, () => ({ id: 'x', timestamp: 'no' }));
  const errors = (await m.validateBackup(await roundtrip(await make(many)))).errors;
  assert.ok(errors.length <= 14);
  assert.ok(errors.some(e => /altri \d+ problemi/.test(e)));
});

test('prototype keys and invalid JSON are rejected', async () => {
  const text = m.serializeBackup(await make()).replace('"stores":{', '"stores":{"__proto__":{"x":1},');
  const report = await m.validateBackup(m.parseBackupText(text));
  assert.equal(report.ok, false);
  assert.match(report.errors[0], /non sicuro/);
  assert.throws(() => m.parseBackupText('{non json'), m.BackupError);
  assert.throws(() => m.parseBackupText('   '), m.BackupError);
});

test('unknown stores and preferences become warnings, files without checksum are allowed with a warning', async () => {
  const backup = await roundtrip(await make());
  backup.stores.cycle_logs = [];
  delete backup.checksum;
  backup.local.altro = 'x';
  const report = await m.validateBackup(backup);
  assert.equal(report.ok, true, report.errors.join('; '));
  assert.ok(report.warnings.some(w => /cycle_logs/.test(w)));
  assert.ok(report.warnings.some(w => /integrita/.test(w)));
  assert.ok(report.warnings.some(w => /altro/.test(w)));
});

test('dates in records are exported as text and still verify', async () => {
  const stores = sample(); stores.symptoms[0].extra = new Date('2026-10-19T10:00:00Z');
  const backup = await roundtrip(await make(stores));
  assert.equal(backup.stores.symptoms[0].extra, '2026-10-19T10:00:00.000Z');
  assert.equal((await m.validateBackup(backup)).ok, true);
});

const fakeDb = ({ failOn } = {}) => {
  const log = [];
  const db = { log, tx: null, transaction(names, mode) {
    const tx = { names, mode, aborted: false, abort() { this.aborted = true; log.push('abort'); },
      objectStore(name) { return { clear() { log.push(`clear:${name}`); }, put(record) { if (failOn && record.id === failOn) throw new Error('DataError'); log.push(`put:${name}`); } }; } };
    db.tx = tx; return tx; } };
  return db;
};

test('restore replaces every store inside one readwrite transaction', async () => {
  const db = fakeDb();
  const backup = await roundtrip(await make());
  const promise = m.restoreIntoDb(db, backup);
  db.tx.oncomplete();
  await promise;
  assert.equal(db.tx.mode, 'readwrite');
  assert.deepEqual(db.tx.names, m.STORE_NAMES);
  assert.equal(db.log.filter(l => l.startsWith('clear:')).length, m.STORE_NAMES.length);
  assert.equal(db.log.filter(l => l.startsWith('put:')).length, 6);
});

test('a failing record aborts the whole restore instead of leaving cleared stores', async () => {
  const db = fakeDb({ failOn: 's1' });
  const backup = await roundtrip(await make());
  await assert.rejects(m.restoreIntoDb(db, backup), /DataError/);
  assert.equal(db.tx.aborted, true);
});

test('an aborted transaction rejects', async () => {
  const db = fakeDb();
  const promise = m.restoreIntoDb(db, await roundtrip(await make()));
  db.tx.error = new Error('QuotaExceededError');
  db.tx.onabort();
  await assert.rejects(promise, /QuotaExceededError/);
});
