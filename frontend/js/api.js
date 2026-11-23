import { CONFIG } from './config.js';

async function request(path, options = {}) {
  const url = `${CONFIG.apiBase}${path}`;
  let response;
  try {
    response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
  } catch (error) {
    throw new Error(`Tidak dapat terhubung ke server (${url}). ${error.message}`);
  }
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' ? payload.message : payload;
    throw new Error(message || `Request gagal (${response.status})`);
  }
  return payload;
}

export const api = {
  request,
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body || {}) }),
  delete: (path) => request(path, { method: 'DELETE' }),

  health: () => api.get('/health'),
  wilayah: () => api.get('/wilayah'),
  kategori: () => api.get('/kategori'),
  createKategori: (body) => api.post('/kategori', body),
  updateKategori: (id, body) => api.patch(`/kategori/${encodeURIComponent(id)}`, body),

  reports: (params = {}) => api.get(`/reports${query(params)}`),
  report: (code) => api.get(`/reports/${encodeURIComponent(code)}`),
  stats: () => api.get('/reports/stats/ringkas'),
  submitReport: (body) => api.post('/reports', body),
  addSusulan: (code, body) => api.post(`/reports/${encodeURIComponent(code)}/susulan`, body),
  verifikasi: (code, body) => api.patch(`/reports/${encodeURIComponent(code)}/verifikasi`, body),
  penanganan: (code, body) => api.patch(`/reports/${encodeURIComponent(code)}/penanganan`, body),
  korban: (code, body) => api.patch(`/reports/${encodeURIComponent(code)}/korban`, body),
  tutup: (code, body) => api.post(`/reports/${encodeURIComponent(code)}/tutup`, body),

  announcements: (params = {}) => api.get(`/announcements${query(params)}`),
  createAnnouncement: (body) => api.post('/announcements', body),

  users: (params = {}) => api.get(`/users${query(params)}`),
  createUser: (body) => api.post('/users', body),
  setAktif: (id, body) => api.patch(`/users/${encodeURIComponent(id)}/aktif`, body),
  login: (email) => api.post('/auth/login', { email }),
  logout: () => api.post('/auth/logout', {}),

  logs: (params = {}) => api.get(`/logs${query(params)}`),
  bantuan: (params = {}) => api.get(`/bantuan${query(params)}`),
  createBantuan: (body) => api.post('/bantuan', body),
  historis: (params = {}) => api.get(`/historis${query(params)}`),
  createHistoris: (body) => api.post('/historis', body),
  imports: () => api.get('/imports'),
  createImport: (body) => api.post('/imports', body),
};

function query(params) {
  const pairs = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

export const session = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.sessionKey) || 'null');
    } catch {
      return null;
    }
  },
  set(user) {
    localStorage.setItem(CONFIG.sessionKey, JSON.stringify({
      role: user.role,
      userId: user.id,
      nama: user.nama,
      email: user.email,
    }));
  },
  clear() {
    localStorage.removeItem(CONFIG.sessionKey);
  },
  role() {
    return session.get()?.role || 'warga';
  },
  nama() {
    return session.get()?.nama || '';
  },
};

export function deviceId() {
  let value = localStorage.getItem(CONFIG.deviceKey);
  if (!value) {
    value = crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}-${Math.random()}`;
    localStorage.setItem(CONFIG.deviceKey, value);
  }
  return value;
}

export const actor = () => session.nama() || 'Sistem';
