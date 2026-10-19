export function applyResponsiveLayout() {
  if (document.getElementById('fudy-responsive-layout')) return;
  const style = document.createElement('style');
  style.id = 'fudy-responsive-layout';
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; }
    #app-root, #app-root > *, #app-root form { min-width: 0; }
    #app-root input:not([type="checkbox"]):not([type="radio"]),
    #app-root select, #app-root textarea { max-width: 100%; }
    #app-root textarea { resize: vertical; }
    #app-root img, #app-root iframe { max-width: 100%; }
    dialog { max-width: calc(100vw - 2rem); max-height: calc(100dvh - 2rem); overflow-y: auto; }
    dialog > div { max-height: calc(100dvh - 2rem); }
    .bottom-nav > a { min-width: 0; min-height: 44px; }
    #app-root [data-action], #app-root [data-delete-meal],
    #btn-close-symptom, #btn-close-history { min-width: 44px; min-height: 44px; }
    #app-root button:focus-visible, #app-root a:focus-visible {
      outline: 3px solid #1d4ed8; outline-offset: 3px;
    }
    @media (max-width: 480px) {
      #app-root table { display: block; max-width: 100%; overflow-x: auto; }
      #app-root input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),
      #app-root select, #app-root textarea { font-size: 16px; }
      #pwa-update-banner { flex-wrap: wrap; gap: .5rem; }
      #btn-quick-symptom { white-space: normal; }
    }
    @media (prefers-reduced-motion: reduce) {
      #app-root *, .bottom-nav * { animation: none !important; transition: none !important; }
    }
  `;
  document.head.appendChild(style);
}
