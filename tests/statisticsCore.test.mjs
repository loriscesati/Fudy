import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source = await readFile(new URL('../src/domain/insights/statisticsCore.js', import.meta.url), 'utf8');
const m = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const sample = (pain, bloat, timestamp = '2026-10-19T12:00:00+02:00') => ({ timestamp, abdominalPainIntensity: pain, bloatingIntensity: bloat });

test('missing scores are not zero', () => {
  assert.equal(m.meanScore([null, undefined, '', NaN, '3']), null);
  assert.equal(m.meanScore([0, 4, null]), 2);
});
test('baseline zero has no percentage', () => {
  assert.deepEqual(m.baselineChange(0, 4), { difference: 4, improvementPercent: null });
  assert.deepEqual(m.baselineChange(null, 4), { difference: null, improvementPercent: null });
  assert.equal(m.baselineChange(5, 3).improvementPercent, 40);
});
test('no followup is unknown, not an absence of symptoms', () => {
  assert.equal(m.classifyFollowup([]), 'UNKNOWN');
  assert.equal(m.classifyFollowup([sample(null, 0)]), 'UNKNOWN');
  assert.equal(m.classifyFollowup([sample(0, 0)]), 'OBSERVED_NOT_ELEVATED');
  assert.equal(m.classifyFollowup([sample(5, null)]), 'ELEVATED');
});
test('a later low checkin never erases an elevated day', () => {
  const records = [sample(6, 2), sample(0, 0)];
  const result = { recordedDays: 1, lowSymptomDays: 0, elevatedDays: 1, unknownDays: 0 };
  assert.deepEqual(m.summarizeSymptomDays(records), result);
  assert.deepEqual(m.summarizeSymptomDays([...records].reverse()), result);
});
test('incomplete and invalid values do not create low-symptom days', () => {
  assert.equal(m.summarizeSymptomDays([sample(null, null)]).unknownDays, 1);
  assert.equal(m.summarizeSymptomDays([sample(0, 0)]).lowSymptomDays, 1);
  assert.equal(m.localDateKey('invalid'), null);
  assert.equal(m.localDateKey(null), null);
  assert.equal(m.validScore(-1), false);
  assert.equal(m.validScore(11), false);
});
test('day keys use local dates', () => {
  assert.equal(m.localDateKey('2026-10-18T23:30:00Z'), '2026-10-19');
});
