import { getProfile, setProfile } from '../infrastructure/storage/userProfile.js';

const PHASES = {
  PREPARATION: ['Preparazione / osservazione', 'Osservazione iniziale facoltativa, senza restrizione imposta.'],
  REDUCTION: ['1. Riduzione temporanea', 'In genere 2-6 settimane. Se non migliori o prolunghi la restrizione, rivaluta con il professionista; non aumentare automaticamente le esclusioni.'],
  REINTRODUCTION: ['2. Reintroduzione', 'Un gruppo alla volta, con valutazione della risposta e ritorno al livello sintomatico abituale tra i test. Nessuna scadenza obbligatoria.'],
  PERSONALIZATION: ['3. Personalizzazione', 'Ampliare la dieta in base alla tolleranza personale, evitando restrizioni inutili. Nessuna scadenza obbligatoria.']
};
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export async function render(root) {
  const profile = await getProfile();
  root.replaceChildren();
  const section = document.createElement('section');
  section.className = 'max-w-2xl mx-auto p-4 pb-24 space-y-4';
  const title = document.createElement('h2');
  title.textContent = 'Profilo e percorso';
  title.className = 'text-xl font-bold text-emerald-700';
  section.appendChild(title);
  const form = document.createElement('form');
  form.className = 'space-y-4';
  const controls = {};
  function add(name, label, type, value = '') {
    const wrapper = document.createElement('label');
    wrapper.className = 'block text-sm';
    wrapper.append(document.createTextNode(label));
    const input = document.createElement(type === 'textarea' || type === 'select' ? type : 'input');
    if (input.tagName === 'INPUT') input.type = type;
    input.name = name;
    input.className = 'block w-full border rounded p-2 bg-white';
    input.value = value;
    wrapper.appendChild(input);
    form.appendChild(wrapper);
    controls[name] = input;
    return input;
  }
  const phase = add('phase', 'Fase attuale (sempre modificabile)', 'select');
  for (const [id, [label]] of Object.entries(PHASES)) {
    const option = document.createElement('option');
    option.value = id; option.textContent = label; phase.appendChild(option);
  }
  phase.value = PHASES[profile.phase] ? profile.phase : 'PREPARATION';
  const help = document.createElement('p');
  help.className = 'text-sm text-gray-600';
  form.appendChild(help);
  const start = add('start', 'Inizio della fase: puoi indicare una data precedente all installazione', 'date', (profile.phaseStartedAt || '').slice(0, 10));
  start.max = today();
  const end = add('end', 'Fine prevista facoltativa: modifica per prorogare, svuota per togliere la scadenza', 'date', profile.phasePlannedEndAt || '');
  add('phaseNote', 'Nota sul percorso o sulla proroga', 'textarea', profile.phaseNote || '');
  for (const [name, label] of [['goals', 'Obiettivi, uno per riga'], ['diagnoses', 'Diagnosi accertate facoltative, una per riga'], ['medications', 'Farmaci e integratori abituali, uno per riga']]) {
    add(name, label, 'textarea', (profile[name] || []).join('\n'));
  }
  for (const [name, label] of [['pain', 'Dolore addominale prima della dieta (0-10), vuoto se sconosciuto'], ['bloat', 'Gonfiore prima della dieta (0-10), vuoto se sconosciuto']]) {
    const input = add(name, label, 'number', profile.baseline?.[name] ?? '');
    input.min = '0'; input.max = '10'; input.step = '1';
  }
  const summary = document.createElement('p');
  summary.setAttribute('role', 'status'); form.appendChild(summary);
  function refresh() {
    help.textContent = PHASES[phase.value][1];
    end.setCustomValidity(start.value && end.value && end.value < start.value ? 'La fine non puo precedere l inizio.' : '');
    const days = start.value ? Math.floor((Date.parse(today()) - Date.parse(start.value)) / 86400000) : null;
    summary.textContent = days === null ? 'Data non indicata. Nessuna scadenza cambia automaticamente la fase.' : `${days} giorni trascorsi. La proroga non azzera il tempo trascorso.${phase.value === 'REDUCTION' && days >= 42 ? ' Restrizione prolungata: rivaluta benefici e sostenibilita con il professionista.' : ''}`;
  }
  phase.addEventListener('change', () => { start.value = ''; end.value = ''; refresh(); });
  start.addEventListener('input', refresh); end.addEventListener('input', refresh); refresh();
  const button = document.createElement('button');
  button.type = 'submit'; button.textContent = 'Salva profilo';
  button.className = 'bg-emerald-600 text-white p-2 rounded'; form.appendChild(button);
  const status = document.createElement('p');
  status.setAttribute('role', 'status'); form.appendChild(status);
  form.addEventListener('submit', async event => {
    event.preventDefault(); refresh(); if (!form.reportValidity()) return;
    button.disabled = true;
    try {
      const latest = await getProfile();
      const history = [...(latest.phaseHistory || [])];
      const next = { phase: phase.value, phaseStartedAt: start.value || null, phasePlannedEndAt: end.value || null };
      if (Object.keys(next).some(key => (latest[key] || null) !== next[key])) {
        history.push({ changedAt: new Date().toISOString(), previous: { phase: latest.phase || null, phaseStartedAt: latest.phaseStartedAt || null, phasePlannedEndAt: latest.phasePlannedEndAt || null }, next: { ...next }, note: controls.phaseNote.value.trim() });
      }
      const updated = { ...latest, ...next, phaseHistory: history, phaseNote: controls.phaseNote.value.trim(), baseline: { ...(latest.baseline || {}) } };
      for (const name of ['goals', 'diagnoses', 'medications']) updated[name] = controls[name].value.split('\n').map(v => v.trim()).filter(Boolean);
      for (const name of ['pain', 'bloat']) updated.baseline[name] = controls[name].value === '' ? null : Number(controls[name].value);
      await setProfile(updated);
      status.textContent = 'Profilo salvato. Diario, card e sintomi conservati.';
    } catch (error) {
      status.textContent = 'Salvataggio non riuscito. I campi restano disponibili: riprova.';
      console.error(error);
    } finally { button.disabled = false; }
  });
  const backupLink = document.createElement('a');
  backupLink.href = '#backup';
  backupLink.textContent = 'Backup e ripristino dei dati';
  backupLink.className = 'block text-sm underline text-emerald-700';
  section.appendChild(form); section.appendChild(backupLink); root.appendChild(section);
}
