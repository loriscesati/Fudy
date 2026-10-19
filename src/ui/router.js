/**
 * src/ui/router.js
 *
 * Router hash-based per FODMAP Path.
 * Gestisce il caricamento dinamico delle viste e l'aggiornamento
 * degli indicatori attivi della bottom navigation bar.
 */

const routes = {
  home: () => import('./pages/home.js'),
  alimenti: () => import('./pages/alimenti.js'),
  challenge: () => import('./pages/challenge.js'),
  progressi: () => import('./pages/progressi.js'),
  backup: () => import('./pages/backup.js'),
  onboarding: () => import('./onboarding.js'),
};

export function initRouter() {
  window.addEventListener('hashchange', renderRoute);
  renderRoute(); // Caricamento iniziale
}

export function navigate(route) {
  location.hash = `#${route}`;
}

async function renderRoute() {
  const hash = location.hash.replace(/^#\/?/, '').trim();
  const routeName = hash || 'home';
  const appRoot = document.getElementById('app-root');

  if (!appRoot) return;

  // Aggiorna gli indicatori della bottom nav
  updateNavigationUI(routeName);

  // Risolvi il modulo corrispondente
  const loader = routes[routeName];

  if (!loader) {
    appRoot.innerHTML = `
      <div class="p-8 text-center text-gray-500">
        <h2 class="text-xl font-bold mb-2">Pagina non trovata</h2>
        <p class="mb-4">La sezione richiesta non esiste.</p>
        <a href="#home" class="inline-block bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold">Torna al Diario</a>
      </div>
    `;
    return;
  }

  try {
    // Feedback di caricamento veloce
    appRoot.innerHTML = `
      <div class="flex items-center justify-center p-12 text-emerald-600">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    `;

    const module = await loader();
    if (module && typeof module.render === 'function') {
      appRoot.innerHTML = '';
      window.scrollTo(0, 0);
      await module.render(appRoot);
    } else {
      appRoot.innerHTML = `<p class="p-6 text-red-500">Errore: modulo "${routeName}" non ha una funzione render.</p>`;
    }
  } catch (err) {
    console.error(`Errore nel caricamento della rotta "${routeName}":`, err);
    appRoot.innerHTML = `
      <div class="p-6 text-center text-red-600">
        <p class="font-bold mb-2">Si è verificato un errore nel caricamento della pagina.</p>
        <p class="text-xs text-gray-500 mb-4">${err.message}</p>
        <button onclick="location.reload()" class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Ricarica</button>
      </div>
    `;
  }
}

function updateNavigationUI(currentRoute) {
  const navButtons = document.querySelectorAll('[data-route]');
  navButtons.forEach((btn) => {
    const route = btn.getAttribute('data-route');
    const isActive = route === currentRoute;
    if (isActive) {
      btn.classList.add('text-emerald-600', 'font-bold');
      btn.classList.remove('text-gray-400', 'font-normal');
    } else {
      btn.classList.remove('text-emerald-600', 'font-bold');
      btn.classList.add('text-gray-400', 'font-normal');
    }
  });
}
