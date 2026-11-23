import { api, deviceId as getDeviceId } from './api.js';
import { WILAYAH, KAB_POS, kabProv } from './wilayah.js';

export { WILAYAH, KAB_POS, kabProv };

/* Mirror of src/data/store.ts, but backed by MySQL through /api/snapshot. */

const SESSION_KEY = 'appb-session';
let db = null;
let loading = null;
const listeners = new Set();

/* Sama dengan @theme di index.html; dipakai bila snapshot belum mengirim settings. */
export const DEFAULT_THEME = {
  'font-sans': "'Inter', system-ui, sans-serif",
  'color-ink': '#0f172a',
  'color-ink2': '#475569',
  'color-mute': '#94a3b8',
  'color-line': '#e2e8f0',
  'color-app': '#f8fafc',
  'color-navy': '#1e3a8a',
  'color-navyh': '#1e40af',
  'color-crit': '#b91c1c',
  'color-crit-t': '#fef2f2',
  'color-warn': '#b45309',
  'color-warn-t': '#fffbeb',
  'color-ok': '#15803d',
  'color-ok-t': '#f0fdf4',
  'color-info': '#1d4ed8',
  'color-info-t': '#eff6ff',
  'radius-sm': '4px',
  'radius-md': '6px',
  'radius-lg': '8px',
};

const emptyDB = () => ({
  reports: [], users: [], categories: [], announcements: [], logs: [],
  bantuan: [], historis: [], imports: [],
  session: { role: 'warga', userId: null },
  nextCode: 140,
  lastSync: Date.now(),
  offline: false,
  settings: { theme: {}, db: {} },
});

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') || { role: 'warga' };
  } catch {
    return { role: 'warga' };
  }
}

function writeSession(value) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
}

function normalizeReport(r) {
  const k = r.korban || {
    luka: r.luka || 0, hilang: r.hilang || 0,
    meninggal: r.meninggal || 0, mengungsi: r.mengungsi || 0,
  };
  return {
    ...r,
    korban: {
      luka: Number(k.luka || 0), hilang: Number(k.hilang || 0),
      meninggal: Number(k.meninggal || 0), mengungsi: Number(k.mengungsi || 0),
    },
    korbanHistory: r.korbanHistory || [],
    susulan: r.susulan || [],
    statusHistory: r.statusHistory || [],
    foto: Number(r.foto || 0),
  };
}

function normalizeSnapshot(snapshot) {
  const source = snapshot || {};
  const settings = source.settings || {};
  return {
    ...emptyDB(),
    ...source,
    settings: {
      theme: { ...DEFAULT_THEME, ...(settings.theme || {}) },
      db: { ...(settings.db || {}) },
    },
    reports: (source.reports || []).map(normalizeReport),
    session: readSession(),
    lastSync: Date.now(),
    offline: false,
  };
}

export function getDB() {
  return db || (db = normalizeSnapshot());
}

export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Terapkan setiap token tema sebagai CSS custom property pada <html>. */
export function applyTheme(d = getDB()) {
  if (typeof document === 'undefined' || !document.documentElement?.style) return;
  const theme = d?.settings?.theme || {};
  Object.entries(theme).forEach(([key, value]) => {
    if (key && value !== undefined && value !== null) {
      document.documentElement.style.setProperty(`--${key}`, String(value));
    }
  });
}

function emit() {
  applyTheme();
  listeners.forEach((cb) => cb(getDB()));
}

export async function loadDB(force = false) {
  if (db && !force) return db;
  if (loading) return loading;
  loading = (async () => {
    try {
      const snapshot = await api.get('/snapshot');
      db = normalizeSnapshot(snapshot);
    } catch (error) {
      if (!db) {
        db = normalizeSnapshot();
        db.offline = true;
      }
      db.lastSync = Date.now();
      // Keep the UI usable and surface the problem once through a toast-like flag.
      db.loadError = error.message;
    }
    emit();
    return db;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

export async function reloadDB() {
  return loadDB(true);
}

/* ---------- Session ---------- */
export const session = {
  get: readSession,
  role: () => readSession().role || 'warga',
  userId: () => readSession().userId || null,
  clear() {
    sessionStorage.removeItem(SESSION_KEY);
    if (db) {
      db.session = { role: 'warga' };
      emit();
    }
  },
};

/* ---------- Selectors ---------- */
export const me = (d = getDB()) => d.users.find((u) => u.id === d.session.userId);
export const byCode = (d, code) => d.reports.find((r) => r.code === code);
export const isActive = (r) => r.verif === 'Tertunda'
  || (r.verif === 'Resmi' && r.penanganan !== 'Case Closed' && r.penanganan !== 'Tidak Perlu Tindak Lanjut');
export const isPublic = (r) => r.verif === 'Resmi';
export const deviceId = () => getDeviceId();
export const isOwn = (r) => Boolean(r.deviceId) && r.deviceId === deviceId();
export const canView = (r, d = getDB()) => isPublic(r)
  || (r.verif === 'Tertunda' && (isOwn(r) || Boolean(me(d)?.aktif)));
export const canUpdate = (r, d = getDB()) => {
  const u = me(d);
  return r.verif !== 'Ditolak' && r.penanganan !== 'Case Closed'
    && (u ? u.aktif && (u.role === 'petugas' || u.role === 'relawan') : isOwn(r) && r.verif === 'Tertunda');
};
export const findActiveResmi = (d, jenis, kel) => d.reports.find((r) => isActive(r) && r.jenis === jenis && r.kel === kel);
export const dupOf = (d, r) => r.verif === 'Tertunda'
  ? d.reports.find((o) => o.id !== r.id && isActive(o) && o.jenis === r.jenis && o.kel === r.kel
      && (o.verif === 'Resmi' || o.createdAt < r.createdAt))
  : undefined;
export const statusOf = (r) => (r.verif === 'Resmi' ? (r.penanganan || 'Belum Ditangani') : r.verif);

/* ---------- Actions (server-persisted, then snapshot refresh) ---------- */
export const actor = () => me()?.nama || 'Sistem';
export const actorRole = () => me()?.role || 'sistem';

async function refreshAfter(promise) {
  const result = await promise;
  await reloadDB();
  return result;
}

export async function login(userId, password = 'appb2026') {
  const user = getDB().users.find((u) => u.id === userId);
  if (user && !user.aktif) throw new Error('Akun Anda dinonaktifkan oleh Admin.');
  const result = await refreshAfter(api.post('/auth/login', { id: userId, password }));
  writeSession({ role: result.role || user?.role || 'warga', userId: result.id || userId });
  if (db) {
    db.session = readSession();
    emit();
  }
  return result;
}

export async function logout() {
  session.clear();
  try {
    await api.post('/auth/logout', {});
  } catch { /* logout lokal tetap berjalan */ }
}

export async function submitReport(payload) {
  return refreshAfter(api.post('/reports', { ...payload, deviceId: deviceId() }));
}

export async function addSusulan(code, payload) {
  return refreshAfter(api.post(`/reports/${encodeURIComponent(code)}/susulan`, {
    ...payload, actor: actor(), actorRole: actorRole(),
  }));
}

export async function verifikasi(ids, verif, rejectReason = '') {
  const selected = Array.isArray(ids) ? ids : [ids];
  const codes = selected
    .map((id) => getDB().reports.find((r) => r.id === id || r.code === id)?.code)
    .filter(Boolean);
  if (!codes.length) throw new Error('Tidak ada laporan yang dipilih.');
  return refreshAfter(api.patch(`/reports/${encodeURIComponent(codes[0])}/verifikasi`, {
    codes, ids: selected, verif, rejectReason,
    actor: actor(), actorRole: actorRole(),
  }));
}

export async function patchPenanganan(code, penanganan) {
  return refreshAfter(api.patch(`/reports/${encodeURIComponent(code)}/penanganan`, {
    penanganan, actor: actor(), actorRole: actorRole(),
  }));
}

export async function patchKorban(code, korban, history) {
  return refreshAfter(api.patch(`/reports/${encodeURIComponent(code)}/korban`, {
    korban, history, actor: actor(), actorRole: actorRole(),
  }));
}

export async function patchCatatan(code, detail) {
  return refreshAfter(api.post(`/reports/${encodeURIComponent(code)}/catatan`, {
    detail, actor: actor(), actorRole: actorRole(),
  }));
}

export async function tutupLaporan(code, ringkasan) {
  return refreshAfter(api.post(`/reports/${encodeURIComponent(code)}/tutup`, {
    ringkasan, actor: actor(), actorRole: actorRole(),
  }));
}

export async function koreksi(code, payload) {
  return refreshAfter(api.post('/koreksi', { code, ...payload, actor: actor(), actorRole: actorRole() }));
}

export async function createAnnouncement(payload) {
  return refreshAfter(api.post('/announcements', { ...payload, by: actor() }));
}

export async function createUser(payload) {
  return refreshAfter(api.post('/users', payload));
}

export async function setUserAktif(id, aktif) {
  return refreshAfter(api.patch(`/users/${encodeURIComponent(id)}/aktif`, { aktif, actor: actor() }));
}

export async function deleteUser(id) {
  return refreshAfter(api.delete(`/users/${encodeURIComponent(id)}`));
}

export async function createKategori(payload) {
  return refreshAfter(api.post('/kategori', payload));
}

export async function updateKategori(id, payload) {
  return refreshAfter(api.patch(`/kategori/${encodeURIComponent(id)}`, payload));
}

export async function deleteKategori(id) {
  return refreshAfter(api.post(`/kategori/${encodeURIComponent(id)}/delete`, {}));
}

export async function createBantuan(payload) {
  return refreshAfter(api.post('/bantuan', { ...payload, by: actor() }));
}

export async function createHistoris(payload) {
  return refreshAfter(api.post('/historis', payload));
}

export async function createImport(payload) {
  return refreshAfter(api.post('/imports', { ...payload, by: actor() }));
}

/* ---------- Admin configuration actions ---------- */
export async function saveTheme(theme) {
  return refreshAfter(api.patch('/settings', { theme, actor: actor() }));
}

export async function updateUser(id, payload) {
  return refreshAfter(api.patch(`/users/${encodeURIComponent(id)}`, { ...payload, actor: actor() }));
}

export async function updateUserPassword(id, password) {
  return refreshAfter(api.patch(`/users/${encodeURIComponent(id)}/password`, {
    password, actor: actor(),
  }));
}

export async function updateReportAdmin(code, payload) {
  return refreshAfter(api.patch(`/reports/${encodeURIComponent(code)}/admin`, {
    ...payload, actor: actor(), actorRole: actorRole(),
  }));
}

export async function updateAnnouncement(id, payload) {
  return refreshAfter(api.patch(`/announcements/${encodeURIComponent(id)}`, {
    ...payload, by: actor(),
  }));
}

export async function deleteAnnouncement(id) {
  return refreshAfter(api.delete(`/announcements/${encodeURIComponent(id)}`));
}

export async function updateBantuan(id, payload) {
  return refreshAfter(api.patch(`/bantuan/${encodeURIComponent(id)}`, {
    ...payload, by: actor(),
  }));
}

export async function deleteBantuan(id) {
  return refreshAfter(api.delete(`/bantuan/${encodeURIComponent(id)}`));
}

export async function updateHistoris(id, payload) {
  return refreshAfter(api.patch(`/historis/${encodeURIComponent(id)}`, payload));
}

export async function deleteHistoris(id) {
  return refreshAfter(api.delete(`/historis/${encodeURIComponent(id)}`));
}

/* Local-only helpers used by original selectors/actions. */
export function setOffline(value) {
  if (!db) db = normalizeSnapshot();
  db.offline = Boolean(value);
  if (!value) db.lastSync = Date.now();
  emit();
}

export function startPolling() {
  let n = 0;
  return setInterval(async () => {
    n += 1;
    try {
      await reloadDB();
      // Seperti mockup asli: 1 dari 6 polling menyimulasikan koneksi tidak stabil.
      setOffline(n % 6 === 4);
    } catch {
      setOffline(true);
    }
  }, 10000);
}
