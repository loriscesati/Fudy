import { meanScore, summarizeSymptomDays, localDateKey } from './statisticsCore.js';

const pad = n => String(n).padStart(2, '0');
const fmtLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseLocalDate(value) {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

function weekStart(timestamp) {
  const key = localDateKey(timestamp);
  if (!key) return null;
  const [y, mo, d] = key.split('-').map(Number);
  const date = new Date(y, mo - 1, d);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return fmtLocal(date);
}

function inPeriod(ts, options) {
  const now = options.now ?? Date.now();
  const t = Date.parse(ts);
  const cutoff = options.periodDays > 0 ? now - options.periodDays * 86400000 : -Infinity;
  return Number.isFinite(t) && t >= cutoff && t <= now;
}

export function weeklySeries(symptoms, options = {}) {
  const weeks = new Map();
  for (const s of symptoms) {
    if (!inPeriod(s.timestamp, options)) continue;
    const key = weekStart(s.timestamp);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(s);
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekStartDate, list]) => ({
    weekStartDate, checkins: list.length,
    meanPain: meanScore(list.map(s => s.abdominalPainIntensity)),
    meanBloat: meanScore(list.map(s => s.bloatingIntensity)),
    meanPelvic: meanScore(list.map(s => s.pelvicPainIntensity)),
    days: summarizeSymptomDays(list)
  }));
}

export function coverage(meals, symptoms, options = {}) {
  const now = options.now ?? Date.now();
  const days = list => new Set(list.filter(r => inPeriod(r.timestamp, options)).map(r => localDateKey(r.timestamp)).filter(Boolean));
  const foodDays = days(meals);
  const checkinDays = days(symptoms);
  const bothDays = [...foodDays].filter(d => checkinDays.has(d)).length;
  let periodDays = options.periodDays > 0 ? options.periodDays : 0;
  if (!periodDays) {
    const all = [...foodDays, ...checkinDays].sort();
    const first = all.length ? parseLocalDate(all[0]) : null;
    periodDays = first == null ? 0 : Math.floor((now - first) / 86400000) + 1;
  }
  return { periodDays, foodDays: foodDays.size, checkinDays: checkinDays.size, bothDays };
}

// Segments are inferred from the dates entered by the user, never from install time.
export function phaseSegments(profile = {}, now = Date.now()) {
  const raw = [];
  const history = [...(profile.phaseHistory || [])].sort((a, b) => String(a.changedAt).localeCompare(String(b.changedAt)));
  for (const h of history) {
    const prev = h.previous, next = h.next;
    if (!prev?.phase || prev.phase === next?.phase) continue;
    const start = parseLocalDate(prev.phaseStartedAt);
    const end = parseLocalDate(next?.phaseStartedAt) ?? Date.parse(h.changedAt);
    if (start != null && Number.isFinite(end)) raw.push({ phase: prev.phase, startMs: start, endMs: end, current: false });
  }
  const currentStart = parseLocalDate(profile.phaseStartedAt);
  if (profile.phase && currentStart != null) raw.push({ phase: profile.phase, startMs: currentStart, endMs: now, current: true });
  raw.sort((a, b) => a.startMs - b.startMs);
  const out = [];
  let lastEnd = -Infinity;
  for (const s of raw) {
    const startMs = Math.max(s.startMs, lastEnd);
    if (s.endMs > startMs) { out.push({ ...s, startMs }); lastEnd = s.endMs; }
  }
  return out;
}

export function summarizePhases(symptoms, segments) {
  return segments.map(seg => {
    const list = symptoms.filter(s => { const t = Date.parse(s.timestamp); return Number.isFinite(t) && t >= seg.startMs && t < seg.endMs; });
    return { ...seg, checkins: list.length, meanPain: meanScore(list.map(s => s.abdominalPainIntensity)), meanBloat: meanScore(list.map(s => s.bloatingIntensity)), days: summarizeSymptomDays(list) };
  });
}
