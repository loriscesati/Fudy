export function setupSymptomSliders(root) {
  const form = root.querySelector('#form-symptom');
  if (!form || form.dataset.continuous === 'true') return;
  form.dataset.continuous = 'true';
  const style = document.createElement('style');
  style.textContent = `
    #form-symptom .continuous-score {
      appearance:none; -webkit-appearance:none; width:100%; height:12px;
      border-radius:999px; cursor:pointer;
      background:linear-gradient(to right, var(--score-color) 0%, var(--score-color) var(--fill), #e5e7eb var(--fill), #e5e7eb 100%);
    }
    #form-symptom .continuous-score::-webkit-slider-thumb {
      appearance:none; -webkit-appearance:none; width:24px; height:24px;
      border-radius:50%; background:var(--score-color); border:3px solid white; box-shadow:0 0 0 1px #6b7280;
    }
    #form-symptom .continuous-score::-moz-range-thumb {
      width:18px; height:18px; border-radius:50%; background:var(--score-color); border:3px solid white;
    }
    #form-symptom .continuous-score:focus-visible { outline:3px solid #1d4ed8; outline-offset:6px; }
  `;
  form.appendChild(style);
  const inputs = ['pain', 'bloat', 'pelvic'].map(key => {
    const input = form.querySelector('#input-' + key);
    input.step = '0.01';
    input.classList.add('continuous-score');
    input.style.setProperty('--score-color', key === 'pelvic' ? '#e11d48' : '#059669');
    const label = form.querySelector('label[for="input-' + key + '"]');
    label.textContent = label.textContent.replace(/\s*\(0-10\)/, '');
    const value = form.querySelector('#val-' + key);
    if (value) { value.hidden = true; value.setAttribute('aria-hidden', 'true'); }
    const legend = document.createElement('div');
    legend.className = 'flex justify-between text-gray-500 mt-2 text-xs';
    const start = document.createElement('span'), end = document.createElement('span');
    start.textContent = 'Assente'; end.textContent = 'Massimo immaginabile';
    legend.append(start, end); input.after(legend);
    input.addEventListener('input', () => sync(input));
    return input;
  });
  function sync(input) {
    const value = input.valueAsNumber;
    input.style.setProperty('--fill', (value * 10) + '%');
    input.setAttribute('aria-valuetext', value === 0 ? 'Assente' : value === 10 ? 'Massimo immaginabile' : `Intensita selezionata: ${Math.round(value * 10)} per cento della barra`);
  }
  const help = document.createElement('p');
  help.className = 'text-xs text-gray-500';
  help.textContent = 'Sposta la barra fino al livello che rappresenta come ti senti.';
  form.prepend(help);
  form.querySelector('#btn-no-symptoms').textContent = 'Tutto OK';
  inputs.forEach(sync);
  form.addEventListener('reset', () => queueMicrotask(() => inputs.forEach(sync)));
}
