export function createUndoNotice(host, timeout = 10000) {
  const active = new Set();
  function show(message, undo) {
    const row = document.createElement('div');
    row.className = 'bg-gray-900 text-white rounded-xl shadow-lg p-3 flex items-center gap-3 text-sm';
    const text = document.createElement('span');
    text.setAttribute('role', 'status');
    text.textContent = message;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Annulla';
    button.className = 'underline font-semibold p-2';
    row.append(text, button);
    host.appendChild(row);
    let timer, busy = false;
    const remove = () => { clearTimeout(timer); row.remove(); active.delete(remove); };
    const pause = () => clearTimeout(timer);
    const resume = () => {
      pause();
      if (!busy && !row.contains(document.activeElement)) timer = setTimeout(remove, timeout);
    };
    active.add(remove);
    row.addEventListener('pointerenter', pause);
    row.addEventListener('pointerleave', resume);
    row.addEventListener('focusin', pause);
    row.addEventListener('focusout', e => { if (!row.contains(e.relatedTarget)) resume(); });
    button.onclick = async () => {
      if (busy) return;
      busy = true; button.disabled = true; pause();
      try {
        await undo();
        button.remove(); text.textContent = 'Operazione annullata.';
        timer = setTimeout(remove, 3000);
      } catch (error) {
        text.textContent = 'Annullamento non riuscito. Riprova.';
        busy = false; button.disabled = false;
        console.warn('Annullamento non riuscito:', error);
      }
    };
    resume();
  }
  return { show, dispose() { for (const remove of [...active]) remove(); } };
}
