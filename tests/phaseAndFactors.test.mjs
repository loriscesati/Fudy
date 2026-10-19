import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const base = new URL('../src/domain/insights/', import.meta.url);
const strip = src => src.split('\n').filter(l => !l.startsWith('import ')).join('\n');
let code = '';
for (const n of ['trends.js', 'dayFactors.js', 'phaseTimer.js']) {
  const src = n === 'trends.js'
    ? (await readFile(new URL(n, base), 'utf8')).replace(/^import .*$/gm, "const meanScore = () => null, summarizeSymptomDays = () => ({}), localDateKey = () => null;")
    : strip(await readFile(new URL(n, base), 'utf8'));
  code += '\n' + src.replace(/^export /gm, '');
}
code += '\nexport { recordToFlags, flagsToRecord, describePhase, FACTOR_KEYS };';
const m = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const at = (iso) => Date.parse(iso);

test('stored factors round-trip through the form state', () => {
  const record = { date: '2026-10-19', stressLevel: 'HIGH', alcoholIntake: true, travelOrRoutineChange: false, sleepQuality: 'INSOMNIA' };
  const flags = m.recordToFlags(record);
  assert.deepEqual(flags, { stressLevel: true, alcoholIntake: true, travelOrRoutineChange: false, heavyMealConsumed: false, intercurrentIllness: false });
  const back = m.flagsToRecord('2026-10-19', flags, record, 'T');
  assert.equal(back.stressLevel, 'HIGH');
  assert.equal(back.sleepQuality, 'INSOMNIA');
  assert.equal(back.declaredAt, 'T');
});

test('a later checkin can remove a factor and never silently keeps or drops others', () => {
  const first = m.flagsToRecord('2026-10-19', { alcoholIntake: true, stressLevel: true }, {}, 'A');
  const shown = m.recordToFlags(first);
  shown.alcoholIntake = false;
  const second = m.flagsToRecord('2026-10-19', shown, first, 'B');
  assert.equal(second.alcoholIntake, false);
  assert.equal(second.stressLevel, 'HIGH');
  assert.equal(first.alcoholIntake, true);
});

test('no stored record means all factors unchecked', () => {
  assert.ok(Object.values(m.recordToFlags(undefined)).every(v => v === false));
  assert.equal(m.flagsToRecord('2026-10-19', undefined, undefined, 'T').stressLevel, 'NORMAL');
});

test('phase timer never invents a start date', () => {
  const now = at('2026-10-19T10:00:00+02:00');
  assert.equal(m.describePhase({}, now), null);
  const missing = m.describePhase({ phase: 'REDUCTION' }, now);
  assert.equal(missing.startKnown, false);
  assert.equal(missing.week, null);
  assert.equal(m.describePhase({ phase: 'REDUCTION', phaseStartedAt: 'bad' }, now).week, null);
  const future = m.describePhase({ phase: 'REDUCTION', phaseStartedAt: '2026-10-25' }, now);
  assert.equal(future.startFuture, true);
  assert.equal(future.week, null);
});

test('weeks are counted from the declared start, including a start before installation', () => {
  const now = at('2026-10-19T10:00:00+02:00');
  assert.equal(m.describePhase({ phase: 'REDUCTION', phaseStartedAt: '2026-10-19' }, now).week, 1);
  assert.equal(m.describePhase({ phase: 'REDUCTION', phaseStartedAt: '2026-10-13' }, now).week, 1);
  assert.equal(m.describePhase({ phase: 'REDUCTION', phaseStartedAt: '2026-09-28' }, now).week, 4);
  const across = m.describePhase({ phase: 'REDUCTION', phaseStartedAt: '2026-10-12' }, new Date(2026, 9, 26, 0, 30).getTime());
  assert.equal(across.week, 3);
});

test('prolonged reduction review applies only to reduction and ignores extended deadlines', () => {
  const now = at('2026-10-19T10:00:00+02:00');
  const reduction = m.describePhase({ phase: 'REDUCTION', phaseStartedAt: '2026-08-31', phasePlannedEndAt: '2026-12-31' }, now);
  assert.equal(reduction.week, 8);
  assert.equal(reduction.reductionReview, true);
  assert.equal(m.describePhase({ phase: 'REINTRODUCTION', phaseStartedAt: '2026-08-31' }, now).reductionReview, false);
  assert.equal(m.describePhase({ phase: 'REDUCTION', phaseStartedAt: '2026-10-01' }, now).reductionReview, false);
});

test('planned end passes only after the day itself', () => {
  const now = at('2026-10-19T10:00:00+02:00');
  assert.equal(m.describePhase({ phase: 'REDUCTION', phaseStartedAt: '2026-10-01', phasePlannedEndAt: '2026-10-18' }, now).plannedEndPassed, true);
  assert.equal(m.describePhase({ phase: 'REDUCTION', phaseStartedAt: '2026-10-01', phasePlannedEndAt: '2026-10-19' }, now).plannedEndPassed, false);
  assert.equal(m.describePhase({ phase: 'REDUCTION', phaseStartedAt: '2026-10-01' }, now).plannedEndPassed, false);
});
