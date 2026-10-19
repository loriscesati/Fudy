import { createBackupFile, downloadBackup, inspectBackupFile, restoreBackup, requestPersistence, LAST_BACKUP_KEY } from '../../infrastructure/storage/backupService.js';
import { STORE_NAMES } from '../../domain/backupCore.js';

const LABELS = {
  foods: 'Alimenti e card', meals: 'Registrazioni alimentari', symptoms: 'Check-in sintomi', bowel_events: 'Registro Bristol',
  challenges: 'Challenge', confounders: 'Fattori del giorno', user_profile: 'Profilo'
};
const PERSIST = {
  granted: 'Archiviazione protetta: il browser non dovrebbe cancellare i dati in automatico.',
  denied: 'Il browser non ha concesso la protezione. Fai backup regolari.',
  unsupported: 'Questo browser non permette di richiedere la protezione. Fai backup regolari.'
};

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function box(title, ...children) {
  const section = el('section', null, 'border rounded-xl p-3 bg-white space-y-2');
  section.appendChild(el('h3', title, 'font-bold text-sm'));
  for (const child of children) section.appendChild(child);
  return section;
}
const button = (label, className = 'bg-emerald-600 text-white') => el('button', label, `${className} rounded p-2 text-xs font-semibold disabled:opacity-50`);
const when = iso => (iso ? new Date(iso).toLocaleString('it-IT') : 'mai');
const status = () => { const p = el('p', '', 'text-xs'); p.setAttribute('role', 'status'); return p; };

export async function render(root) {
  root.replaceChildren();
  const page = el('div', null, 'max-w-2xl mx-auto p-4 pb-24 space-y-4');
  page.appendChild(el('h2', 'Backup e ripristino', 'text-xl font-bold text-emerald-700'));
  page.appendChild(el('p', 'I tuoi dati sono solo in questo browser. Un backup serve a spostarli su un altro dispositivo o a recuperarli se il browser li cancella.', 'text-xs text-gray-600'));

  // Esporta
  const lastLine = el('p', `Ultimo backup scaricato: ${when(localStorage.getItem(LAST_BACKUP_KEY))}.`, 'text-xs');
  const exportButton = button('Scarica backup completo');
  const exportStatus = status();
  exportButton.onclick = async () => {
    exportButton.disabled = true;
    exportStatus.textContent = 'Preparazione del backup...';
    try {
      const file = await createBackupFile();
      downloadBackup(file);
      const total = Object.values(file.counts).reduce((a, b) => a + b, 0);
      exportStatus.textContent = `Backup creato e verificato: ${total} record. Controlla che il file sia stato salvato.`;
      lastLine.textContent = `Ultimo backup scaricato: ${when(localStorage.getItem(LAST_BACKUP_KEY))}.`;
    } catch (error) {
      exportStatus.textContent = 'Backup non riuscito: ' + error.message;
    } finally { exportButton.disabled = false; }
  };
  page.appendChild(box('Esporta', el('p', 'Il file contiene diario, card, sintomi, challenge e profilo. Non e cifrato e contiene dati sanitari: conservalo in un luogo sicuro.', 'text-xs'), lastLine, exportButton, exportStatus));

  // Importa
  const fileInput = el('input'); fileInput.type = 'file'; fileInput.accept = '.json,application/json';
  const result = el('div', null, 'space-y-2');
  fileInput.onchange = async () => {
    result.replaceChildren();
    const file = fileInput.files?.[0];
    if (!file) return;
    result.appendChild(el('p', 'Controllo del file...', 'text-xs'));
    try {
      const { backup, report, current } = await inspectBackupFile(file);
      result.replaceChildren();
      for (const message of report.errors) result.appendChild(el('p', message, 'text-xs text-red-700'));
      for (const message of report.warnings) result.appendChild(el('p', message, 'text-xs text-amber-700'));
      if (!report.ok) { result.appendChild(el('p', 'Importazione bloccata: i dati attuali non sono stati toccati.', 'text-xs font-semibold')); return; }
      result.appendChild(el('p', `Backup creato il ${when(report.summary.createdAt)}.`, 'text-xs'));
      const table = el('table', null, 'w-full text-xs border-collapse');
      const head = table.createTHead().insertRow();
      for (const h of ['Archivio', 'Nel file', 'Ora nell\'app']) head.appendChild(el('th', h, 'text-left border-b p-1'));
      const body = table.createTBody();
      for (const name of STORE_NAMES) {
        const row = body.insertRow();
        for (const cell of [LABELS[name], report.summary.counts[name], current[name]]) row.appendChild(el('td', String(cell), 'border-b p-1'));
      }
      result.appendChild(table);
      result.appendChild(el('p', 'Il ripristino sostituisce tutti i dati attuali con quelli del file, in un\'unica operazione: se qualcosa fallisce, i dati attuali restano come sono. Chiudi le altre schede di Fudy prima di continuare.', 'text-xs'));
      const label = el('label', null, 'block text-xs');
      const confirmBox = el('input'); confirmBox.type = 'checkbox';
      label.append(confirmBox, document.createTextNode(' Ho capito: i dati attuali verranno sostituiti.'));
      const restoreButton = button('Ripristina dal file', 'bg-red-600 text-white');
      restoreButton.disabled = true;
      confirmBox.onchange = () => { restoreButton.disabled = !confirmBox.checked; };
      const restoreStatus = status();
      restoreButton.onclick = async () => {
        restoreButton.disabled = true; confirmBox.disabled = true; fileInput.disabled = true;
        restoreStatus.textContent = 'Ripristino in corso...';
        try {
          const after = await restoreBackup(backup);
          const total = Object.values(after).reduce((a, b) => a + b, 0);
          restoreStatus.textContent = `Ripristino completato e verificato: ${total} record.`;
          const next = button('Apri il Diario');
          next.onclick = () => { location.hash = '#home'; location.reload(); };
          result.appendChild(next);
        } catch (error) {
          restoreStatus.textContent = 'Ripristino non riuscito: ' + error.message + ' Controlla i dati prima di riprovare.';
          confirmBox.disabled = false; fileInput.disabled = false;
        }
      };
      result.append(label, restoreButton, restoreStatus);
    } catch (error) {
      result.replaceChildren(el('p', error.message, 'text-xs text-red-700'));
    }
  };
  page.appendChild(box('Importa', el('p', 'Scegli un file di backup di Fudy. Prima viene controllato e ti mostro cosa contiene; nulla cambia finche non confermi.', 'text-xs'), fileInput, result));

  // Archiviazione protetta
  const persistStatus = status();
  const persistButton = button('Proteggi i dati dalla cancellazione automatica', 'bg-gray-100 text-gray-800');
  persistButton.onclick = async () => { persistStatus.textContent = PERSIST[await requestPersistence()]; };
  page.appendChild(box('Protezione del browser', el('p', 'Alcuni browser possono cancellare i dati dei siti poco usati. La protezione riduce il rischio ma non sostituisce il backup.', 'text-xs'), persistButton, persistStatus));

  root.appendChild(page);
}
