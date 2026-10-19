import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const base = new URL('../src/domain/insights/', import.meta.url);
const strip = src => src.split('\n').filter(l => !l.startsWith('import ')).join('\n');
const names = ['statisticsCore.js', 'occasions.js', 'associationCore.js', 'trends.js'];
let code = '';
for (const n of names) code += '\n' + strip(await readFile(new URL(n, base), 'utf8')).replace(/^export /gm, '');
code += '\nexport { groupOccasions, evaluateOccasions, summarizeOccasions, computeFoodAssociations, computeGroupCombinations, dayFactorState, wilson, weeklySeries, coverage, phaseSegments, summarizePhases, parseLocalDate };';
const m = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

const NOW = Date.parse('2026-10-19T23:00:00+02:00');
const tap = (id, food, at, mealType = 'LUNCH', groups = ['LOW_FODMAP_SAFE']) => ({ id, timestamp: at, mealType, source: 'QUICK_TAP', items: [{ foodId: food, foodName: food, fodmapGroupsSnapshot: groups, occurrences: 1 }] });
const chk = (at, pain, bloat, extra = {}) => ({ timestamp: at, abdominalPainIntensity: pain, bloatingIntensity: bloat, ...extra });
const day = n => `2026-10-${String(n).padStart(2, '0')}`;
const run = (meals, symptoms, extra = {}, options = {}) => m.computeFoodAssociations({ meals, symptoms, ...extra }, { now: NOW, ...options });

test('taps within the gap form one occasion, other sections stay separate', () => {
  const meals = [tap(1, 'a', '2026-10-19T12:00:00+02:00'), tap(2, 'b', '2026-10-19T12:20:00+02:00'), tap(3, 'c', '2026-10-19T15:30:00+02:00'), tap(4, 'd', '2026-10-19T12:10:00+02:00', 'DINNER')];
  const occ = m.groupOccasions(meals);
  assert.equal(occ.length, 3);
  assert.deepEqual(occ.find(o => o.mealType === 'LUNCH' && o.foodIds.length === 2).foodIds, ['a', 'b']);
  assert.throws(() => m.groupOccasions(meals, 0), RangeError);
});

test('consumption without followup is unknown and never lowers an observed rate', () => {
  const meals = [10, 11, 12, 13].map(d => tap(d, 'rice', `${day(d)}T12:00:00+02:00`));
  const [r] = run(meals, [chk(`${day(10)}T15:00:00+02:00`, 6, 1), chk(`${day(11)}T15:00:00+02:00`, 0, 0)]);
  assert.equal(r.totalOccasions, 4);
  assert.equal(r.observedOccasions, 2);
  assert.equal(r.unknownOccasions, 2);
  assert.equal(r.elevatedDays, 1);
  assert.equal(r.evidence, 'INSUFFICIENT_DATA');
});

test('evidence needs at least three observed days and counts distinct days', () => {
  const meals = [10, 11, 12].map(d => tap(d, 'x', `${day(d)}T12:00:00+02:00`));
  const checks = [chk(`${day(10)}T14:00:00+02:00`, 5, 0), chk(`${day(11)}T14:00:00+02:00`, 0, 0), chk(`${day(12)}T14:00:00+02:00`, 6, 0)];
  assert.equal(run(meals, checks)[0].evidence, 'REPEATED_DAYS');
  assert.equal(run(meals, [checks[0], checks[1], chk(`${day(12)}T14:00:00+02:00`, 0, 0)])[0].evidence, 'SINGLE_DAY');
  assert.equal(run(meals, [1, 2, 3].map((n, i) => chk(`${day(10 + i)}T14:00:00+02:00`, 0, 0)))[0].evidence, 'NO_SIGNAL');
  const sameDay = [tap(1, 'x', '2026-10-12T09:00:00+02:00', 'BREAKFAST'), tap(2, 'x', '2026-10-12T20:00:00+02:00', 'DINNER')];
  const [one] = run(sameDay, [chk('2026-10-12T10:00:00+02:00', 6, 0), chk('2026-10-12T21:00:00+02:00', 6, 0)]);
  assert.equal(one.elevatedOccasions, 2);
  assert.equal(one.elevatedDays, 1);
});

test('foods eaten together are flagged as not separable', () => {
  const meals = [tap(1, 'bread', '2026-10-12T12:00:00+02:00', 'LUNCH', ['FRUCTANS_GRAIN']), tap(2, 'cheese', '2026-10-12T12:10:00+02:00', 'LUNCH', ['LACTOSE'])];
  const res = run(meals, [chk('2026-10-12T15:00:00+02:00', 7, 2)]);
  assert.equal(res.length, 2);
  for (const r of res) { assert.equal(r.separableOccasions, 0); assert.equal(r.episodes[0].coFoods.length, 1); assert.equal(r.elevatedDays, 1); }
});

test('one checkin reachable from two occasions is marked as shared window', () => {
  const meals = [tap(1, 'a', '2026-10-12T12:00:00+02:00', 'LUNCH'), tap(2, 'b', '2026-10-12T15:00:00+02:00', 'SNACK')];
  const res = run(meals, [chk('2026-10-12T17:00:00+02:00', 6, 0)]);
  assert.ok(res.every(r => r.sharedWindowOccasions === 1 && r.elevatedOccasions === 1));
});

test('window still open is pending, not an absence of symptoms', () => {
  const [r] = run([tap(1, 'a', '2026-10-19T21:30:00+02:00')], []);
  assert.equal(r.pendingOccasions, 1);
  assert.equal(r.observedOccasions, 0);
  const [e] = run([tap(1, 'a', '2026-10-19T21:30:00+02:00')], [chk('2026-10-19T22:00:00+02:00', 6, 0)]);
  assert.equal(e.elevatedOccasions, 1);
});

test('day factors distinguish not filled, none declared and declared', () => {
  assert.equal(m.dayFactorState(undefined).state, 'NOT_FILLED');
  assert.equal(m.dayFactorState({ date: day(11), stressLevel: 'NORMAL', alcoholIntake: false }).state, 'NONE_DECLARED');
  assert.deepEqual(m.dayFactorState({ date: day(12), alcoholIntake: true, stressLevel: 'HIGH' }).factors, ['Stress elevato', 'Alcol']);
  const meals = [10, 11, 12].map(d => tap(d, 'x', `${day(d)}T12:00:00+02:00`));
  const checks = [10, 11, 12].map(d => chk(`${day(d)}T14:00:00+02:00`, 5, 0));
  const [r] = run(meals, checks, { confounders: [{ date: day(11), stressLevel: 'NORMAL' }, { date: day(12), alcoholIntake: true }] });
  assert.deepEqual([r.strata.NOT_FILLED.observed, r.strata.NONE_DECLARED.observed, r.strata.DECLARED.observed], [1, 1, 1]);
});

test('interval is on observed days and null without observations', () => {
  const [r] = run([10, 11, 12, 13].map(d => tap(d, 'x', `${day(d)}T12:00:00+02:00`)), [10, 11].map((d, i) => chk(`${day(d)}T14:00:00+02:00`, i ? 0 : 5, 0)));
  assert.ok(r.confidenceLower < r.dayRate && r.dayRate < r.confidenceUpper);
  const [none] = run([tap(1, 'x', '2026-10-12T12:00:00+02:00')], []);
  assert.equal(none.confidenceLower, null);
  assert.equal(none.dayRate, null);
  assert.equal(none.avgPainAfter, null);
});

test('future records, period filter and group filter are respected', () => {
  const meals = [tap(1, 'old', '2026-08-01T12:00:00+02:00', 'LUNCH', ['GOS']), tap(2, 'new', '2026-10-15T12:00:00+02:00', 'LUNCH', ['LACTOSE']), tap(3, 'future', '2026-10-25T12:00:00+02:00')];
  assert.deepEqual(run(meals, [], {}, { periodDays: 30 }).map(r => r.foodId), ['new']);
  assert.deepEqual(run(meals, [], {}, { fodmapGroupFilter: 'GOS' }).map(r => r.foodId), ['old']);
});

test('latest finalized challenge is reported separately from observations', () => {
  const challenges = [{ state: 'FINALIZED', testFoodId: 'x', startDate: '2026-09-01', outcome: 'A' }, { state: 'FINALIZED', testFoodId: 'x', startDate: '2026-10-01', outcome: 'B' }, { state: 'PLANNED', testFoodId: 'x', startDate: '2026-10-10', outcome: 'C' }];
  const [r] = run([tap(1, 'x', '2026-10-12T12:00:00+02:00')], [], { challenges });
  assert.deepEqual(r.challenge, { outcome: 'B', startDate: '2026-10-01' });
});

test('group combinations count occasions with observed, pending and unknown separately', () => {
  const two = d => [tap(`${d}a`, 'bread', `${day(d)}T12:00:00+02:00`, 'LUNCH', ['FRUCTANS_GRAIN']), tap(`${d}b`, 'milk', `${day(d)}T12:05:00+02:00`, 'LUNCH', ['LACTOSE'])];
  const res = m.computeGroupCombinations({ meals: [...two(10), ...two(11)], symptoms: [chk(`${day(10)}T14:00:00+02:00`, 6, 0)] }, { now: NOW });
  const combo = res.find(c => c.groups.length === 2);
  assert.deepEqual([combo.total, combo.observed, combo.elevated, combo.unknown], [2, 1, 1, 1]);
});

test('weekly series, coverage and phase segments', () => {
  const symptoms = [chk('2026-10-12T10:00:00+02:00', 4, 2), chk('2026-10-14T10:00:00+02:00', 2, 2, { pelvicPainIntensity: 5 }), chk('2026-10-19T10:00:00+02:00', 0, 0)];
  const weeks = m.weeklySeries(symptoms, { now: NOW });
  assert.deepEqual(weeks.map(w => w.weekStartDate), ['2026-10-12', '2026-10-19']);
  assert.equal(weeks[0].meanPain, 3);
  assert.equal(weeks[0].meanPelvic, 5);
  assert.equal(weeks[1].meanPelvic, null);
  const cov = m.coverage([tap(1, 'x', '2026-10-12T12:00:00+02:00'), tap(2, 'x', '2026-10-13T12:00:00+02:00')], symptoms, { now: NOW, periodDays: 14 });
  assert.deepEqual([cov.foodDays, cov.checkinDays, cov.bothDays], [2, 3, 1]);
  const profile = { phase: 'REINTRODUCTION', phaseStartedAt: '2026-10-15', phaseHistory: [{ changedAt: '2026-10-15T08:00:00Z', previous: { phase: 'REDUCTION', phaseStartedAt: '2026-10-01' }, next: { phase: 'REINTRODUCTION', phaseStartedAt: '2026-10-15' } }, { changedAt: '2026-10-16T08:00:00Z', previous: { phase: 'REINTRODUCTION', phaseStartedAt: '2026-10-14' }, next: { phase: 'REINTRODUCTION', phaseStartedAt: '2026-10-15' } }] };
  const segs = m.phaseSegments(profile, NOW);
  assert.deepEqual(segs.map(s => s.phase), ['REDUCTION', 'REINTRODUCTION']);
  const sum = m.summarizePhases(symptoms, segs);
  assert.equal(sum[0].checkins, 2);
  assert.equal(sum[1].checkins, 1);
  assert.deepEqual(m.phaseSegments({ phase: 'REDUCTION' }, NOW), []);
});
