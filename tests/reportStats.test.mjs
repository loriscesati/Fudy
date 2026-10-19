import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const base = new URL('../src/domain/insights/', import.meta.url);
const core = await readFile(new URL('statisticsCore.js', base), 'utf8');
const stats = (await readFile(new URL('reportStats.js', base), 'utf8')).split('\n').filter(l => !l.startsWith('import ')).join('\n');
const { computeReportStats } = await import('data:text/javascript;base64,' + Buffer.from(core + '\n' + stats).toString('base64'));
const s = (pain, bloat, extra = {}, timestamp = '2026-10-19T12:00:00+02:00') => ({ timestamp, abdominalPainIntensity: pain, bloatingIntensity: bloat, ...extra });

test('zero baseline gives no percentage and missing means are null', () => {
  const r = computeReportStats([s(4, 3)], [], { baseline: { pain: 0, bloat: null } });
  assert.equal(r.painChange.improvementPercent, null);
  assert.equal(r.painChange.difference, 4);
  assert.equal(r.bloatChange.difference, null);
  const empty = computeReportStats([], [], {});
  assert.equal(empty.avgPain, null);
  assert.equal(empty.symptomDays.recordedDays, 0);
});
test('symptom days are independent of record order', () => {
  const a = computeReportStats([s(6, 1), s(0, 0)], [], {}).symptomDays;
  const b = computeReportStats([s(0, 0), s(6, 1)], [], {}).symptomDays;
  assert.deepEqual(a, b);
  assert.equal(a.elevatedDays, 1);
  assert.equal(a.lowSymptomDays, 0);
});
test('new symptom dimensions are counted without turning missing into zero', () => {
  const r = computeReportStats([s(1, 1, { pelvicPainIntensity: 4, endoBellyDistension: true, dyschezia: false }), s(1, 1)], [], {});
  assert.equal(r.avgPelvic, 4);
  assert.equal(r.endoBellyCount, 1);
  assert.equal(r.dyscheziaCount, 0);
});
test('bristol accepts only integer types 1-7', () => {
  const r = computeReportStats([], [{ bristolType: 4 }, { bristolType: 4 }, { bristolType: 8 }, { bristolType: '3' }, { bristolType: 2.5 }], {});
  assert.deepEqual(r.bristolDist, [0, 0, 0, 2, 0, 0, 0]);
  assert.equal(r.totalBristol, 2);
});
