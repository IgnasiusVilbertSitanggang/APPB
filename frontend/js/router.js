import { getDB, loadDB, me, session, logout, startPolling, subscribe } from './store.js';
import {
  mountShell, updateShellStatus, Forbidden, skeleton, errorBox, toast, refreshIcons,
} from './ui.js';

let rootEl = null;
let routeList = [];
let cleanupPage = null;
let resolveToken = 0;
let currentPath = '';
let currentArea = null;

function hide(node) {
  if (node) node.classList.add('hidden');
}
function show(node) {
  if (node) node.classList.remove('hidden');
}
function toggle(node) {
  if (!node) return;
  node.classList.toggle('hidden');
}

function matchRoute(pathname) {
  const clean = pathname.replace(/\/+$/, '') || '/';
  for (const route of routeList) {
    if (!route.path || route.path === '*') continue;
    const pattern = route.path.replace(/\/+$/, '') || '/';
    const keys = [];
    const regexSource = pattern.split('/').map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('/');
    const found = clean.match(new RegExp(`^${regexSource}$`));
    if (!found) continue;
    const params = {};
    keys.forEach((key, index) => {
      params[key] = decodeURIComponent(found[index + 1]);
    });
    return { route, params };
  }
  return null;
}

function isAllowed(area) {
  const d = getDB();
  const user = me(d);
  return Boolean(user && user.aktif && session.role() === area && user.role === area);
}

export function navigate(path, replace = false) {
  if (!path) return;
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  resolve({ scroll: true });
}

async function doLogout() {
  try {
    await logout();
  } catch {
    // Logout lokal tetap berjalan walaupun server tidak merespons.
  }
  toast('Anda telah keluar.', 'info');
  navigate('/masuk');
}

function buildCtx(found, url) {
  const query = new URLSearchParams(url.search);
  const replaceQuery = (next) => {
    const nextUrl = `${url.pathname}${next.toString() ? `?${next.toString()}` : ''}${url.hash}`;
    history.replaceState({}, '', nextUrl);
    resolve({ scroll: false });
  };
  return {
    path: url.pathname,
    params: found?.params || {},
    query,
    area: found?.route?.area || null,
    navigate,
    refresh: () => resolve({ scroll: false }),
    setQuery(key, value) {
      const next = new URLSearchParams(query);
      if (value === undefined || value === null || String(value) === '') next.delete(key);
      else next.set(key, String(value));
      replaceQuery(next);
    },
    setQueryAll(values = {}) {
      const next = new URLSearchParams();
      Object.entries(values).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value) !== '') next.set(key, String(value));
      });
      replaceQuery(next);
    },
  };
}

function wireShell(root) {
  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="logout"]')) {
      event.preventDefault();
      doLogout();
      return;
    }
    if (event.target.closest('[data-drawer-open]')) {
      show(root.querySelector('[data-app-drawer]'));
      return;
    }
    if (event.target.closest('[data-drawer-close]')) {
      hide(root.querySelector('[data-app-drawer]'));
      return;
    }
    if (event.target.closest('[data-bell]')) {
      toggle(root.querySelector('[data-bell-panel]'));
      hide(root.querySelector('[data-user-panel]'));
      return;
    }
    if (event.target.closest('[data-user-menu]')) {
      toggle(root.querySelector('[data-user-panel]'));
      hide(root.querySelector('[data-bell-panel]'));
      return;
    }
    if (event.target.closest('[data-mobile-menu]')) {
      const navEl = root.querySelector('[data-mobile-nav]');
      toggle(navEl);
      const btn = event.target.closest('[data-mobile-menu]');
      btn.setAttribute('aria-expanded', navEl && !navEl.classList.contains('hidden') ? 'true' : 'false');
      return;
    }
    if (event.target.closest('[data-modal-close]') && !event.target.closest('[data-modal], [data-drawer], [data-app-drawer]')) {
      hide(root.querySelector('[data-app-drawer]'));
    }
  });

  root.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-global-search]');
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector('[data-search-input]');
    const code = (input?.value || '').trim().toUpperCase();
    if (!code) return;
    const found = getDB().reports.find((r) => r.code === code || r.code.endsWith(code.padStart(5, '0')));
    if (!found) {
      toast(`Laporan "${code}" tidak ditemukan.`, 'error');
      return;
    }
    input.value = '';
    if (currentArea === 'admin') navigate(`/admin/koreksi?q=${encodeURIComponent(found.code)}`);
    else navigate(`/${currentArea || 'petugas'}/penanganan/${found.code}`);
  });

  document.addEventListener('mousedown', (event) => {
    if (!rootEl || !rootEl.contains(event.target)) return;
    if (!event.target.closest('[data-bell], [data-bell-panel]')) hide(rootEl.querySelector('[data-bell-panel]'));
    if (!event.target.closest('[data-user-menu], [data-user-panel]')) hide(rootEl.querySelector('[data-user-panel]'));
  });
}

export async function start(routes, root) {
  rootEl = root;
  routeList = routes;

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[data-link]');
    if (!anchor || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    navigate(anchor.getAttribute('href'));
  });
  window.addEventListener('popstate', () => resolve({ scroll: true }));

  wireShell(root);
  subscribe(() => updateShellStatus(root));
  startPolling();

  await loadDB();
  updateShellStatus(root);
  resolve({ scroll: false });
}

export async function resolve({ scroll = true } = {}) {
  if (!rootEl) return;
  const token = ++resolveToken;
  const url = new URL(window.location.href);
  const found = matchRoute(url.pathname);
  const wildcard = routeList.find((r) => r.path === '*');
  const route = found?.route || (url.pathname === '/' ? routeList.find((r) => r.path === '/') : wildcard);
  const view = found ? found.route.view : url.pathname === '/' ? routeList.find((r) => r.path === '/')?.view : wildcard?.view;

  if (route?.redirect) {
    currentArea = route.area || null;
    navigate(route.redirect, true);
    return;
  }
  if (!view) {
    rootEl.innerHTML = errorBox('Rute tidak terkonfigurasi.');
    return;
  }

  await loadDB();
  if (token !== resolveToken) return;

  const previousPath = currentPath;
  currentArea = route?.area || null;

  if (currentArea && !isAllowed(currentArea)) {
    const user = me(getDB());
    cleanupPage?.();
    cleanupPage = null;
    rootEl.innerHTML = Forbidden(currentArea, Boolean(user && !user.aktif));
    refreshIcons(rootEl);
    document.title = 'Akses ditolak — APPB';
    return;
  }

  const ctx = buildCtx(found, url);
  if (cleanupPage) {
    cleanupPage();
    cleanupPage = null;
  }

  mountShell(rootEl, { ...ctx, area: currentArea }, skeleton());
  const pageRoot = rootEl.querySelector('[data-page]');
  if (!pageRoot) {
    rootEl.innerHTML = errorBox('Kontainer halaman tidak ditemukan.');
    return;
  }

  let result;
  try {
    result = await view(ctx);
  } catch (error) {
    pageRoot.innerHTML = errorBox(error?.message || 'Terjadi kesalahan saat memuat halaman.');
    refreshIcons(pageRoot);
    return;
  }
  if (token !== resolveToken) return;

  pageRoot.innerHTML = result?.html || '';
  refreshIcons(pageRoot);
  try {
    const cleanup = await result?.mount?.(pageRoot, ctx);
    if (typeof cleanup === 'function') cleanupPage = cleanup;
  } catch (error) {
    pageRoot.innerHTML = errorBox(error?.message || 'Terjadi kesalahan saat menyiapkan halaman.');
    refreshIcons(pageRoot);
    return;
  }

  updateShellStatus(rootEl);
  document.title = result?.title ? `${result.title} — APPB` : 'APPB — Pelaporan Bencana';
  if (scroll && previousPath !== url.pathname) window.scrollTo({ top: 0, behavior: 'instant' });
  currentPath = url.pathname;
}

export function currentRoutePath() {
  return currentPath;
}
