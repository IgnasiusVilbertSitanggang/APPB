import {
  getDB, WILAYAH, saveTheme, updateUser, updateReportAdmin,
  createUser, deleteUser, createKategori, updateKategori, deleteKategori,
  createAnnouncement, updateAnnouncement, deleteAnnouncement,
  createBantuan, updateBantuan, deleteBantuan,
  createHistoris, updateHistoris, deleteHistoris,
} from '../store.js';
import {
  paint, esc, icon, Btn, Field, Card, Alert, DataTable, mountTable,
  toast, options, fmt, Segmented, PageHead, Empty, DL, confirmAction,
} from '../ui.js';

/* Nilai @theme di index.html — dipakai sebagai default dan saat "Reset default". */
const DEFAULT_THEME = {
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

const LABELS = {
  'font-sans': 'Font sans-serif',
  'color-ink': 'Teks utama',
  'color-ink2': 'Teks sekunder',
  'color-mute': 'Teks redup',
  'color-line': 'Garis tepi',
  'color-app': 'Latar aplikasi',
  'color-navy': 'Navy / primer',
  'color-navyh': 'Navy saat hover',
  'color-crit': 'Kritis / bahaya',
  'color-crit-t': 'Latar kritis',
  'color-warn': 'Peringatan',
  'color-warn-t': 'Latar peringatan',
  'color-ok': 'Berhasil',
  'color-ok-t': 'Latar berhasil',
  'color-info': 'Informasi',
  'color-info-t': 'Latar informasi',
  'radius-sm': 'Radius kecil',
  'radius-md': 'Radius sedang',
  'radius-lg': 'Radius besar',
};

const TABS = [
  ['tampilan', 'Warna & Tampilan', 'palette'],
  ['akun', 'Petugas / Relawan / Admin', 'users'],
  ['data', 'Data Bencana', 'database'],
];
const SUBTABS = ['Kategori', 'Laporan', 'Pengumuman', 'Bantuan', 'Historis'];
const ROLES = ['petugas', 'relawan', 'admin'];
const VERIF_VALUES = ['Tertunda', 'Resmi', 'Ditolak'];
const PENANGANAN_VALUES = [
  'Belum Ditangani', 'Sedang Ditangani', 'Selesai Ditangani',
  'Tidak Perlu Tindak Lanjut', 'Case Closed',
];
const SEVERITY_VALUES = ['Informasi', 'Imbauan', 'Peringatan', 'Evakuasi'];
const SATUAN_VALUES = ['paket', 'lembar', 'unit', 'dus', 'kg', 'ton', 'liter', 'pcs'];
const KORBAN_FIELDS = [
  ['luka', 'Luka'], ['hilang', 'Hilang'],
  ['meninggal', 'Meninggal'], ['mengungsi', 'Mengungsi'],
];
const KABS = Object.values(WILAYAH).flatMap((p) => Object.keys(p));
const WILAYAH_OPTIONS = ['Nasional', ...KABS];
const COLOR_KEYS = Object.keys(DEFAULT_THEME).filter((key) => key.startsWith('color-'));
const TEXT_KEYS = Object.keys(DEFAULT_THEME).filter((key) => !key.startsWith('color-'));

/* State modul: tetap bertahan saat halaman di-repaint maupun di-mount ulang. */
const state = {
  tab: 'tampilan',
  sub: 'Kategori',
  theme: null,
  userDrafts: {},
  newUser: null,
  kategori: { draft: null },
  reportDrafts: {},
  annNew: null,
  annDrafts: {},
  banNew: null,
  banDrafts: {},
  hisNew: null,
  hisDrafts: {},
  tables: { users: {}, laporan: {} },
};

/* ------------------------------------------------------------------ */
/* Helper kecil                                                        */
/* ------------------------------------------------------------------ */

function blankUser() {
  return { nama: '', email: '', hp: '', instansi: '', wilayah: '', role: 'petugas', aktif: true, password: '' };
}
function blankKategori() {
  return { id: '', nama: '', deskripsi: '', aktif: true };
}
function blankAnnouncement() {
  return { title: '', body: '', severity: 'Informasi', jenis: '', prov: '', kab: '', kec: '', kel: '' };
}
function blankBantuan() {
  return { sumber: '', jenis: '', jumlah: '', satuan: 'paket', kab: '', code: '' };
}
function blankHistoris() {
  return { jenis: '', kab: '', prov: '', tanggal: '', meninggal: '0', mengungsi: '0', rumahRusak: '0', sumber: 'BPBD' };
}

state.newUser = blankUser();
state.kategori.draft = blankKategori();
state.annNew = blankAnnouncement();
state.banNew = blankBantuan();
state.hisNew = blankHistoris();

function themeState() {
  if (!state.theme) {
    const settings = getDB().settings || {};
    state.theme = { ...DEFAULT_THEME, ...(settings.theme || {}) };
  }
  return state.theme;
}

function draftOf(map, key, make) {
  if (!map[key]) map[key] = make();
  return map[key];
}

function userDraft(u) {
  return draftOf(state.userDrafts, u.id, () => ({
    role: u.role || 'petugas', aktif: Boolean(u.aktif), password: '',
  }));
}
function reportDraft(r) {
  const k = r.korban || {};
  return draftOf(state.reportDrafts, r.code, () => ({
    jenis: r.jenis || '', prov: r.prov || '', kab: r.kab || '', kec: r.kec || '',
    kel: r.kel || '', alamat: r.alamat || '', verif: r.verif || 'Tertunda',
    penanganan: r.penanganan || 'Belum Ditangani',
    korban: {
      luka: String(Number(k.luka || 0)), hilang: String(Number(k.hilang || 0)),
      meninggal: String(Number(k.meninggal || 0)), mengungsi: String(Number(k.mengungsi || 0)),
    },
  }));
}
function annDraft(a) {
  return draftOf(state.annDrafts, a.id, () => ({
    title: a.title || '', body: a.body || '', severity: a.severity || 'Informasi',
    jenis: a.jenis || '', prov: a.prov || '', kab: a.kab || '', kec: a.kec || '', kel: a.kel || '',
  }));
}
function banDraft(b) {
  return draftOf(state.banDrafts, b.id, () => ({
    sumber: b.sumber || '', jenis: b.jenis || '', jumlah: String(b.jumlah || 0),
    satuan: b.satuan || 'paket', kab: b.kab || '', code: b.code || '',
  }));
}
function hisDraft(h) {
  return draftOf(state.hisDrafts, h.id, () => ({
    jenis: h.jenis || '', kab: h.kab || '', prov: h.prov || '', tanggal: h.tanggal || '',
    meninggal: String(h.meninggal || 0), mengungsi: String(h.mengungsi || 0),
    rumahRusak: String(h.rumahRusak || 0), sumber: h.sumber || '',
  }));
}

function provOf(kab) {
  return Object.keys(WILAYAH).find((p) => WILAYAH[p][kab]) || '';
}

function cssSafe(value, fallback = '') {
  return String(value === undefined || value === null ? '' : value).replace(/[;{}<>]/g, '') || fallback;
}
/** Versi cssSafe untuk dipakai di dalam atribut style HTML. */
function cssAttr(value, fallback = '') {
  return esc(cssSafe(value, fallback));
}
function colorValue(value, fallback) {
  const raw = String(value || '');
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback;
}
function inlineInput(model, value, attrs = '', label = '', type = 'text') {
  return `<input type="${type}" class="inp !h-8" value="${esc(value)}" data-model="${esc(model)}" ${attrs} aria-label="${esc(label)}" />`;
}
function inlineSelect(model, value, items, attrs = '', label = '') {
  return `<select class="inp !h-8 !w-auto" data-model="${esc(model)}" ${attrs} aria-label="${esc(label)}">${options(items, value, null)}</select>`;
}
function repCell(code, field, value, opts = {}) {
  const group = opts.group || '';
  const model = `rep-${code}-${group || 'f'}-${field}`;
  const attrs = `data-model="${esc(model)}" data-rep="${esc(code)}" data-field="${esc(field)}"${group ? ` data-group="${esc(group)}"` : ''}`;
  const cls = opts.cls || '!min-w-[110px]';
  if (opts.items) {
    return `<select class="inp !h-8 !px-2 ${cls}" ${attrs} aria-label="${esc(opts.label || field)}">${options(opts.items, value, null)}</select>`;
  }
  return `<input type="${opts.type || 'text'}" class="inp !h-8 !px-2 ${cls}" value="${esc(value)}" ${attrs} aria-label="${esc(opts.label || field)}" />`;
}

/* ------------------------------------------------------------------ */
/* Render: Warna & Tampilan                                            */
/* ------------------------------------------------------------------ */

function renderTampilan(d, theme) {
  const dbInfo = (d.settings && d.settings.db) || {};
  return `<div class="grid xl:grid-cols-[300px_1fr_300px] gap-5 items-start">
    ${Card({
      title: 'Koneksi database',
      children: `
        ${Alert({
          tone: ['mysql', 'postgresql'].includes(dbInfo.mode) ? 'ok' : 'warn',
          title: dbInfo.mode === 'mysql' ? 'Mode MySQL'
            : dbInfo.mode === 'postgresql' ? 'Mode PostgreSQL' : 'Mode penyimpanan lokal',
          children: 'Informasi berikut bersifat hanya-baca. Kata sandi database tidak ditampilkan.',
        })}
        <div class="mt-4">${DL([
          ['Mode', dbInfo.mode ? esc(dbInfo.mode) : '—'],
          ['Nama database', dbInfo.name ? esc(dbInfo.name) : '—'],
          ['Host', dbInfo.host ? esc(dbInfo.host) : '—'],
          ['Port', dbInfo.port ? esc(dbInfo.port) : '—'],
          ['User', dbInfo.user ? esc(dbInfo.user) : '—'],
        ], 1)}</div>`,
    })}
    ${Card({
      title: 'Warna & tipografi',
      children: `
        <div class="grid sm:grid-cols-2 gap-3">
          ${COLOR_KEYS.map((key) => `
            <div class="flex items-center gap-2">
              <span data-swatch="${esc(key)}" class="w-9 h-9 rounded-md border border-line shrink-0" style="background:${cssAttr(theme[key], DEFAULT_THEME[key])}"></span>
              <div class="min-w-0 flex-1">
                <label class="cap block truncate" for="th-${esc(key)}">${esc(LABELS[key] || key)}</label>
                <p class="cap truncate" data-theme-value="${esc(key)}">${esc(theme[key] || '')}</p>
              </div>
              <input id="th-${esc(key)}" type="color" class="h-9 w-12 p-0.5 rounded-md border border-line bg-white cursor-pointer"
                value="${esc(colorValue(theme[key], DEFAULT_THEME[key]))}" data-model="th-${esc(key)}" data-theme-key="${esc(key)}" />
            </div>`).join('')}
        </div>
        <div class="grid sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-line">
          ${TEXT_KEYS.map((key) => Field({
            label: LABELS[key] || key, id: `th-${key}`,
            children: `<input id="th-${key}" class="inp" value="${esc(theme[key] || '')}" data-model="th-${esc(key)}" data-theme-key="${esc(key)}" />`,
          })).join('')}
        </div>
        <div class="flex flex-wrap gap-2 mt-4 pt-4 border-t border-line">
          ${Btn(`${icon('save')}Simpan tema`, { v: 'primary', attrs: 'data-act="theme-save"' })}
          ${Btn(`${icon('rotate-ccw')}Reset default`, { attrs: 'data-act="theme-reset"' })}
        </div>`,
    })}
    ${Card({
      title: 'Pratinjau langsung',
      children: `<div data-preview class="rounded-md border border-line p-4 space-y-3"
          style="font-family:${cssAttr(theme['font-sans'], DEFAULT_THEME['font-sans'])};border-radius:${cssAttr(theme['radius-lg'], DEFAULT_THEME['radius-lg'])}">
          <p data-preview-title class="text-lg font-semibold" style="color:${cssAttr(theme['color-ink'], DEFAULT_THEME['color-ink'])}">Contoh judul laporan</p>
          <p data-preview-sub class="text-sm" style="color:${cssAttr(theme['color-ink2'], DEFAULT_THEME['color-ink2'])}">Teks penjelas di bawah judul.</p>
          <div class="flex flex-wrap gap-2">
            <span data-preview-button class="inline-flex items-center h-8 px-3 text-sm text-white"
              style="background:${cssAttr(theme['color-navy'], DEFAULT_THEME['color-navy'])};border-radius:${cssAttr(theme['radius-md'], DEFAULT_THEME['radius-md'])}">Tombol utama</span>
            <span data-preview-alert class="inline-flex items-center h-8 px-3 text-sm"
              style="background:${cssAttr(theme['color-warn-t'], DEFAULT_THEME['color-warn-t'])};color:${cssAttr(theme['color-warn'], DEFAULT_THEME['color-warn'])};border-radius:${cssAttr(theme['radius-sm'], DEFAULT_THEME['radius-sm'])}">Peringatan</span>
          </div>
          <p class="cap">Swatch berubah mengikuti input tema secara langsung.</p>
        </div>`,
    })}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Render: Petugas / Relawan / Admin                                   */
/* ------------------------------------------------------------------ */

function renderAkun(d) {
  const users = d.users || [];
  const cols = [
    {
      key: 'n', header: 'Nama & email',
      render: (u) => `<div><p class="font-medium">${esc(u.nama)}</p><p class="cap">${esc(u.email)}</p></div>`,
      sort: (u) => u.nama,
    },
    { key: 'w', header: 'Wilayah', render: (u) => esc(u.wilayah || '—'), sort: (u) => u.wilayah },
    {
      key: 'r', header: 'Role',
      render: (u) => inlineSelect(`cu-role-${u.id}`, userDraft(u).role, ROLES,
        `data-user="${esc(u.id)}" data-field="role"`, `Role ${u.nama}`),
      sort: (u) => userDraft(u).role,
    },
    {
      key: 'p', header: 'Kata sandi baru',
      render: (u) => inlineInput(`cu-pw-${u.id}`, userDraft(u).password || '',
        `data-user="${esc(u.id)}" data-field="password"`, `Kata sandi ${u.nama}`, 'password'),
    },
    {
      key: 'a', header: 'Aktif',
      render: (u) => `<input type="checkbox" class="accent-navy" data-model="cu-active-${esc(u.id)}"
        data-user="${esc(u.id)}" data-field="aktif" aria-label="Aktif ${esc(u.nama)}" ${userDraft(u).aktif ? 'checked' : ''} />`,
      sort: (u) => (userDraft(u).aktif ? 1 : 0),
    },
    {
      key: 'x', header: 'Aksi',
      render: (u) => `<div class="flex flex-wrap gap-1">
        ${Btn('Simpan', { sm: true, v: 'primary', attrs: `data-act="user-save" data-id="${esc(u.id)}"` })}
        ${Btn(icon('trash-2'), { sm: true, v: 'ghost', cls: 'text-crit hover:text-crit', attrs: `data-act="user-delete" data-id="${esc(u.id)}" aria-label="Hapus ${esc(u.nama)}"` })}
      </div>`,
    },
  ];
  const f = state.newUser;
  return `<div class="space-y-5">
    ${Alert({
      tone: 'info', title: 'Kata sandi per akun',
      children: 'Kata sandi awal <strong class="font-medium text-ink">appb2026</strong>. Isi kolom "Kata sandi baru" lalu Simpan untuk mengganti kata sandi akun tersebut; kolom kosong berarti kata sandi tidak diubah.',
    })}
    <div class="grid xl:grid-cols-[360px_1fr] gap-5 items-start">
      ${Card({
        title: 'Tambah akun baru',
        children: `<div class="space-y-3">
          ${Field({ label: 'Nama lengkap', id: 'cu-nama', children: inlineInput('new-nama', f.nama, 'data-new="nama"', 'Nama lengkap') })}
          ${Field({ label: 'Email', id: 'cu-email', children: inlineInput('new-email', f.email, 'data-new="email"', 'Email', 'email') })}
          ${Field({ label: 'Kata sandi', id: 'cu-pw', children: inlineInput('new-pw', f.password, 'data-new="password"', 'Kata sandi (kosong = appb2026)', 'password') })}
          ${Field({ label: 'Nomor HP', id: 'cu-hp', children: inlineInput('new-hp', f.hp, 'data-new="hp"', 'Nomor HP') })}
          ${Field({ label: 'Instansi', id: 'cu-instansi', children: inlineInput('new-instansi', f.instansi, 'data-new="instansi"', 'Instansi') })}
          ${Field({ label: 'Wilayah', id: 'cu-wilayah', children: inlineSelect('new-wilayah', f.wilayah, WILAYAH_OPTIONS, 'data-new="wilayah"', 'Wilayah') })}
          ${Field({ label: 'Role', id: 'cu-role', children: inlineSelect('new-role', f.role, ROLES, 'data-new="role"', 'Role') })}
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" class="accent-navy" data-model="new-aktif" data-new="aktif" ${f.aktif ? 'checked' : ''} /> Akun aktif
          </label>
          ${Btn(`${icon('plus')}Tambah akun`, { v: 'primary', cls: 'w-full', attrs: 'data-act="user-create"' })}
        </div>`,
      })}
      ${DataTable(users, cols, {
        id: 'cfg-users', state: state.tables.users, rowKey: (u) => u.id, initialSort: ['n', 'asc'],
      })}
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Render: Data Bencana                                                */
/* ------------------------------------------------------------------ */

function renderKategori(d) {
  const categories = d.categories || [];
  const f = state.kategori.draft;
  return `<div class="grid xl:grid-cols-[360px_1fr] gap-5 items-start">
    ${Card({
      title: f.id ? 'Ubah kategori' : 'Tambah kategori',
      children: `<div class="space-y-3">
        ${Field({ label: 'Nama kategori', id: 'cfg-kat-nama', children: inlineInput('kat-nama', f.nama, 'data-kat="nama"', 'Nama kategori') })}
        ${Field({ label: 'Keterangan', id: 'cfg-kat-deskripsi', children: inlineInput('kat-deskripsi', f.deskripsi, 'data-kat="deskripsi"', 'Keterangan') })}
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="accent-navy" data-model="kat-aktif" data-kat="aktif" ${f.aktif ? 'checked' : ''} /> Aktif di form warga
        </label>
        <div class="flex flex-wrap gap-2">
          ${Btn('Simpan', { v: 'primary', attrs: 'data-act="kat-save"' })}
          ${f.id ? Btn('Batal', { attrs: 'data-act="kat-cancel"' }) : ''}
        </div>
      </div>`,
    })}
    ${Card({
      title: `Daftar kategori (${categories.length})`, pad: false,
      children: categories.length === 0 ? Empty('Belum ada kategori bencana.')
        : `<ul>${categories.map((c) => `<li class="px-4 py-3 border-b border-line last:border-0 flex flex-wrap items-center gap-3">
          <div class="min-w-0 flex-1">
            <p class="font-medium">${esc(c.nama)}</p>
            <p class="cap">${esc(c.deskripsi || '')}</p>
          </div>
          <label class="flex items-center gap-2 text-xs text-ink2">
            <input type="checkbox" class="accent-navy" data-model="kat-toggle-${esc(c.id)}" data-kat-toggle="${esc(c.id)}"
              aria-label="Aktif ${esc(c.nama)}" ${c.aktif ? 'checked' : ''} /> Aktif
          </label>
          ${Btn(icon('pencil'), { sm: true, v: 'ghost', attrs: `data-act="kat-edit" data-id="${esc(c.id)}" aria-label="Ubah ${esc(c.nama)}"` })}
          ${Btn(icon('trash-2'), { sm: true, v: 'ghost', cls: 'text-crit hover:text-crit', attrs: `data-act="kat-delete" data-id="${esc(c.id)}" aria-label="Hapus ${esc(c.nama)}"` })}
        </li>`).join('')}</ul>`,
    })}
  </div>`;
}

function renderLaporan(d) {
  const reports = d.reports || [];
  const cols = [
    {
      key: 'code', header: 'Kode',
      render: (r) => `<div><p class="font-medium whitespace-nowrap">${esc(r.code)}</p><p class="cap">${esc(r.verif || '')}</p></div>`,
      sort: (r) => r.code,
    },
    {
      key: 'jenis', header: 'Jenis',
      render: (r) => repCell(r.code, 'jenis', reportDraft(r).jenis, { label: 'Jenis bencana' }),
    },
    {
      key: 'prov', header: 'Provinsi / Kabupaten',
      render: (r) => {
        const f = reportDraft(r);
        return `<div class="space-y-1">${repCell(r.code, 'prov', f.prov, { label: 'Provinsi' })}${repCell(r.code, 'kab', f.kab, { label: 'Kabupaten/kota' })}</div>`;
      },
    },
    {
      key: 'wil', header: 'Kecamatan / Kelurahan',
      render: (r) => {
        const f = reportDraft(r);
        return `<div class="space-y-1">${repCell(r.code, 'kec', f.kec, { label: 'Kecamatan' })}${repCell(r.code, 'kel', f.kel, { label: 'Kelurahan/desa' })}</div>`;
      },
    },
    {
      key: 'alamat', header: 'Alamat',
      render: (r) => repCell(r.code, 'alamat', reportDraft(r).alamat, { label: 'Alamat', cls: '!min-w-[180px]' }),
    },
    {
      key: 'korban', header: 'Korban',
      render: (r) => {
        const f = reportDraft(r);
        return `<div class="grid grid-cols-2 gap-1 min-w-[190px]">${KORBAN_FIELDS.map(([key, label]) => `
          <label class="cap flex items-center gap-1">${esc(label)}
            ${repCell(r.code, key, f.korban[key], { group: 'korban', type: 'number', label, cls: '!min-w-[64px] !w-full' })}
          </label>`).join('')}</div>`;
      },
    },
    {
      key: 'verif', header: 'Verifikasi',
      render: (r) => repCell(r.code, 'verif', reportDraft(r).verif, { items: VERIF_VALUES, label: 'Verifikasi' }),
    },
    {
      key: 'penanganan', header: 'Penanganan',
      render: (r) => repCell(r.code, 'penanganan', reportDraft(r).penanganan, {
        items: PENANGANAN_VALUES, label: 'Penanganan', cls: '!min-w-[170px]',
      }),
    },
    {
      key: 'x', header: 'Aksi',
      render: (r) => Btn('Simpan', { sm: true, v: 'primary', attrs: `data-act="rep-save" data-code="${esc(r.code)}"` }),
    },
  ];
  return `<div class="space-y-4">
    ${Alert({ tone: 'info', title: 'Edit laporan sebagai admin', children: 'Seluruh perubahan pada baris disimpan melalui endpoint admin dan tercatat di log audit.' })}
    ${DataTable(reports, cols, {
      id: 'cfg-laporan', state: state.tables.laporan, rowKey: (r) => r.code, initialSort: ['code', 'asc'],
    })}
  </div>`;
}

function renderPengumuman(d) {
  const items = d.announcements || [];
  const f = state.annNew;
  return `<div class="grid xl:grid-cols-[360px_1fr] gap-5 items-start">
    ${Card({
      title: 'Pengumuman baru',
      children: `<div class="space-y-3">
        ${Field({ label: 'Judul', id: 'cfg-ann-title', children: inlineInput('ann-new-title', f.title, 'data-ann-new="title"', 'Judul') })}
        ${Field({ label: 'Isi', id: 'cfg-ann-body', children: `<textarea id="cfg-ann-body" rows="3" class="inp" data-model="ann-new-body" data-ann-new="body" aria-label="Isi pengumuman">${esc(f.body)}</textarea>` })}
        ${Field({ label: 'Label', id: 'cfg-ann-severity', children: inlineSelect('ann-new-severity', f.severity, SEVERITY_VALUES, 'data-ann-new="severity"', 'Label') })}
        ${Field({ label: 'Jenis bencana', id: 'cfg-ann-jenis', children: inlineInput('ann-new-jenis', f.jenis, 'data-ann-new="jenis"', 'Jenis bencana') })}
        <div class="grid grid-cols-2 gap-2">
          ${Field({ label: 'Provinsi', id: 'cfg-ann-prov', children: inlineInput('ann-new-prov', f.prov, 'data-ann-new="prov"', 'Provinsi') })}
          ${Field({ label: 'Kabupaten/kota', id: 'cfg-ann-kab', children: inlineInput('ann-new-kab', f.kab, 'data-ann-new="kab"', 'Kabupaten/kota') })}
          ${Field({ label: 'Kecamatan', id: 'cfg-ann-kec', children: inlineInput('ann-new-kec', f.kec, 'data-ann-new="kec"', 'Kecamatan') })}
          ${Field({ label: 'Kelurahan/desa', id: 'cfg-ann-kel', children: inlineInput('ann-new-kel', f.kel, 'data-ann-new="kel"', 'Kelurahan/desa') })}
        </div>
        ${Btn(`${icon('plus')}Tambah pengumuman`, { v: 'primary', cls: 'w-full', attrs: 'data-act="ann-create"' })}
      </div>`,
    })}
    ${Card({
      title: `Daftar pengumuman (${items.length})`, pad: false,
      children: items.length === 0 ? Empty('Belum ada pengumuman.')
        : `<ul>${items.map((a) => {
          const draft = annDraft(a);
          return `<li class="px-4 py-3 border-b border-line last:border-0 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              ${inlineInput(`ann-${a.id}-title`, draft.title, `data-ann="${esc(a.id)}" data-field="title"`, 'Judul pengumuman')}
              ${inlineSelect(`ann-${a.id}-severity`, draft.severity, SEVERITY_VALUES, `data-ann="${esc(a.id)}" data-field="severity"`, 'Label')}
              ${Btn('Simpan', { sm: true, v: 'primary', attrs: `data-act="ann-save" data-id="${esc(a.id)}"` })}
              ${Btn(icon('trash-2'), { sm: true, v: 'ghost', cls: 'text-crit hover:text-crit', attrs: `data-act="ann-delete" data-id="${esc(a.id)}" aria-label="Hapus pengumuman"` })}
            </div>
            <textarea rows="2" class="inp" data-model="ann-${esc(a.id)}-body" data-ann="${esc(a.id)}" data-field="body" aria-label="Isi pengumuman">${esc(draft.body)}</textarea>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
              ${['jenis', 'prov', 'kab', 'kec', 'kel'].map((key) => inlineInput(`ann-${a.id}-${key}`, draft[key], `data-ann="${esc(a.id)}" data-field="${key}"`, key)).join('')}
            </div>
            <p class="cap">${esc(fmt(a.at))} · ${esc(a.by || '')}</p>
          </li>`;
        }).join('')}</ul>`,
    })}
  </div>`;
}

function renderBantuan(d) {
  const items = d.bantuan || [];
  const f = state.banNew;
  return `<div class="grid xl:grid-cols-[360px_1fr] gap-5 items-start">
    ${Card({
      title: 'Bantuan baru',
      children: `<div class="space-y-3">
        ${Field({ label: 'Sumber', id: 'cfg-ban-sumber', children: inlineInput('ban-new-sumber', f.sumber, 'data-ban-new="sumber"', 'Sumber') })}
        ${Field({ label: 'Jenis bantuan', id: 'cfg-ban-jenis', children: inlineInput('ban-new-jenis', f.jenis, 'data-ban-new="jenis"', 'Jenis bantuan') })}
        <div class="grid grid-cols-[1fr_120px] gap-2">
          ${Field({ label: 'Jumlah', id: 'cfg-ban-jumlah', children: inlineInput('ban-new-jumlah', f.jumlah, 'data-ban-new="jumlah"', 'Jumlah', 'number') })}
          ${Field({ label: 'Satuan', id: 'cfg-ban-satuan', children: inlineSelect('ban-new-satuan', f.satuan, SATUAN_VALUES, 'data-ban-new="satuan"', 'Satuan') })}
        </div>
        ${Field({ label: 'Wilayah tujuan', id: 'cfg-ban-kab', children: inlineSelect('ban-new-kab', f.kab, WILAYAH_OPTIONS, 'data-ban-new="kab"', 'Wilayah tujuan') })}
        ${Field({ label: 'Kode laporan (opsional)', id: 'cfg-ban-code', children: inlineInput('ban-new-code', f.code, 'data-ban-new="code"', 'Kode laporan') })}
        ${Btn(`${icon('plus')}Tambah bantuan`, { v: 'primary', cls: 'w-full', attrs: 'data-act="ban-create"' })}
      </div>`,
    })}
    ${Card({
      title: `Daftar bantuan (${items.length})`, pad: false,
      children: items.length === 0 ? Empty('Belum ada data bantuan.')
        : `<ul>${items.map((b) => {
          const draft = banDraft(b);
          return `<li class="px-4 py-3 border-b border-line last:border-0 space-y-2">
            <div class="grid sm:grid-cols-2 gap-2">
              ${inlineInput(`ban-${b.id}-sumber`, draft.sumber, `data-ban="${esc(b.id)}" data-field="sumber"`, 'Sumber')}
              ${inlineInput(`ban-${b.id}-jenis`, draft.jenis, `data-ban="${esc(b.id)}" data-field="jenis"`, 'Jenis bantuan')}
              ${inlineInput(`ban-${b.id}-jumlah`, draft.jumlah, `data-ban="${esc(b.id)}" data-field="jumlah"`, 'Jumlah', 'number')}
              ${inlineSelect(`ban-${b.id}-satuan`, draft.satuan, SATUAN_VALUES, `data-ban="${esc(b.id)}" data-field="satuan"`, 'Satuan')}
              ${inlineSelect(`ban-${b.id}-kab`, draft.kab, WILAYAH_OPTIONS, `data-ban="${esc(b.id)}" data-field="kab"`, 'Wilayah tujuan')}
              ${inlineInput(`ban-${b.id}-code`, draft.code, `data-ban="${esc(b.id)}" data-field="code"`, 'Kode laporan')}
            </div>
            <div class="flex flex-wrap items-center gap-2">
              ${Btn('Simpan', { sm: true, v: 'primary', attrs: `data-act="ban-save" data-id="${esc(b.id)}"` })}
              ${Btn(icon('trash-2'), { sm: true, v: 'ghost', cls: 'text-crit hover:text-crit', attrs: `data-act="ban-delete" data-id="${esc(b.id)}" aria-label="Hapus bantuan"` })}
              <span class="cap">${esc(fmt(b.at))} · ${esc(b.by || '')}</span>
            </div>
          </li>`;
        }).join('')}</ul>`,
    })}
  </div>`;
}

function renderHistoris(d) {
  const items = d.historis || [];
  const f = state.hisNew;
  return `<div class="grid xl:grid-cols-[360px_1fr] gap-5 items-start">
    ${Card({
      title: 'Data historis baru',
      children: `<div class="space-y-3">
        ${Field({ label: 'Jenis bencana', id: 'cfg-his-jenis', children: inlineInput('his-new-jenis', f.jenis, 'data-his-new="jenis"', 'Jenis bencana') })}
        ${Field({ label: 'Wilayah', id: 'cfg-his-kab', children: inlineSelect('his-new-kab', f.kab, WILAYAH_OPTIONS, 'data-his-new="kab"', 'Wilayah') })}
        ${Field({ label: 'Tanggal kejadian', id: 'cfg-his-tanggal', children: inlineInput('his-new-tanggal', f.tanggal, 'data-his-new="tanggal"', 'Tanggal kejadian', 'date') })}
        <div class="grid grid-cols-3 gap-2">
          ${Field({ label: 'Meninggal', id: 'cfg-his-meninggal', children: inlineInput('his-new-meninggal', f.meninggal, 'data-his-new="meninggal"', 'Meninggal', 'number') })}
          ${Field({ label: 'Mengungsi', id: 'cfg-his-mengungsi', children: inlineInput('his-new-mengungsi', f.mengungsi, 'data-his-new="mengungsi"', 'Mengungsi', 'number') })}
          ${Field({ label: 'Rumah rusak', id: 'cfg-his-rumahRusak', children: inlineInput('his-new-rumahRusak', f.rumahRusak, 'data-his-new="rumahRusak"', 'Rumah rusak', 'number') })}
        </div>
        ${Field({ label: 'Sumber data', id: 'cfg-his-sumber', children: inlineInput('his-new-sumber', f.sumber, 'data-his-new="sumber"', 'Sumber data') })}
        ${Btn(`${icon('plus')}Tambah data historis`, { v: 'primary', cls: 'w-full', attrs: 'data-act="his-create"' })}
      </div>`,
    })}
    ${Card({
      title: `Daftar data historis (${items.length})`, pad: false,
      children: items.length === 0 ? Empty('Belum ada data historis.')
        : `<ul>${items.map((h) => {
          const draft = hisDraft(h);
          return `<li class="px-4 py-3 border-b border-line last:border-0 space-y-2">
            <div class="grid sm:grid-cols-2 gap-2">
              ${inlineInput(`his-${h.id}-jenis`, draft.jenis, `data-his="${esc(h.id)}" data-field="jenis"`, 'Jenis bencana')}
              ${inlineSelect(`his-${h.id}-kab`, draft.kab, WILAYAH_OPTIONS, `data-his="${esc(h.id)}" data-field="kab"`, 'Wilayah')}
              ${inlineInput(`his-${h.id}-tanggal`, draft.tanggal, `data-his="${esc(h.id)}" data-field="tanggal"`, 'Tanggal kejadian', 'date')}
              ${inlineInput(`his-${h.id}-sumber`, draft.sumber, `data-his="${esc(h.id)}" data-field="sumber"`, 'Sumber data')}
              ${['meninggal', 'mengungsi', 'rumahRusak'].map((key) => inlineInput(`his-${h.id}-${key}`, draft[key], `data-his="${esc(h.id)}" data-field="${key}"`, key, 'number')).join('')}
            </div>
            <div class="flex flex-wrap items-center gap-2">
              ${Btn('Simpan', { sm: true, v: 'primary', attrs: `data-act="his-save" data-id="${esc(h.id)}"` })}
              ${Btn(icon('trash-2'), { sm: true, v: 'ghost', cls: 'text-crit hover:text-crit', attrs: `data-act="his-delete" data-id="${esc(h.id)}" aria-label="Hapus data historis"` })}
              <span class="cap">${esc(h.sumber || '')}</span>
            </div>
          </li>`;
        }).join('')}</ul>`,
    })}
  </div>`;
}

function renderData(d) {
  return `<div class="space-y-5">
    ${Segmented({ value: state.sub, options: SUBTABS, name: 'cfg-sub', label: 'Sub-menu data bencana' })}
    ${state.sub === 'Kategori' ? renderKategori(d) : ''}
    ${state.sub === 'Laporan' ? renderLaporan(d) : ''}
    ${state.sub === 'Pengumuman' ? renderPengumuman(d) : ''}
    ${state.sub === 'Bantuan' ? renderBantuan(d) : ''}
    ${state.sub === 'Historis' ? renderHistoris(d) : ''}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Halaman                                                             */
/* ------------------------------------------------------------------ */

export function konfigurasi(ctx = {}) {
  let pageRootRef = null;
  let redraw = () => {};

  const render = () => {
    const d = getDB();
    const theme = themeState();
    return `<div>
      ${PageHead({
        title: 'Konfigurasi DB & Tampilan',
        desc: 'Atur tema antarmuka, akun operasional, dan data master bencana dari satu halaman.',
      })}
      ${d.offline ? Alert({
        tone: 'warn', title: 'Sedang dalam mode offline',
        children: 'Data lokal tetap ditampilkan. Perubahan akan dikirim kembali saat koneksi pulih.',
      }) : ''}
      <div class="flex flex-wrap gap-2 mb-5">
        ${TABS.map(([key, label, ico]) => Btn(`${icon(ico)} ${label}`, {
          v: state.tab === key ? 'primary' : 'secondary', attrs: `data-tab="${key}"`,
        })).join('')}
      </div>
      ${state.tab === 'tampilan' ? renderTampilan(d, theme) : ''}
      ${state.tab === 'akun' ? renderAkun(d) : ''}
      ${state.tab === 'data' ? renderData(d) : ''}
    </div>`;
  };

  const bindTables = () => {
    const d = getDB();
    mountTable(pageRootRef, 'cfg-users', {
      rows: d.users || [], cols: [], state: state.tables.users, rowKey: (u) => u.id,
    }, (next) => { state.tables.users = next; redraw(); });
    mountTable(pageRootRef, 'cfg-laporan', {
      rows: d.reports || [], cols: [], state: state.tables.laporan, rowKey: (r) => r.code,
    }, (next) => { state.tables.laporan = next; redraw(); });
  };

  redraw = (focusKey) => {
    if (!pageRootRef) return;
    paint(pageRootRef, render(), focusKey);
    bindTables();
  };

  const syncPreview = () => {
    if (!pageRootRef) return;
    const box = pageRootRef.querySelector('[data-preview]');
    if (!box) return;
    const theme = state.theme || DEFAULT_THEME;
    box.style.fontFamily = cssSafe(theme['font-sans'], DEFAULT_THEME['font-sans']);
    box.style.borderRadius = cssSafe(theme['radius-lg'], DEFAULT_THEME['radius-lg']);
    const set = (selector, prop, key) => {
      const el = box.querySelector(selector);
      if (el) el.style[prop] = cssSafe(theme[key], DEFAULT_THEME[key]);
    };
    set('[data-preview-title]', 'color', 'color-ink');
    set('[data-preview-sub]', 'color', 'color-ink2');
    set('[data-preview-button]', 'backgroundColor', 'color-navy');
    set('[data-preview-button]', 'borderRadius', 'radius-md');
    set('[data-preview-alert]', 'backgroundColor', 'color-warn-t');
    set('[data-preview-alert]', 'color', 'color-warn');
    set('[data-preview-alert]', 'borderRadius', 'radius-sm');
  };

  /* ---------- Aksi async ---------- */

  const saveTema = async () => {
    try {
      const result = await saveTheme({ ...themeState() });
      const next = (result && result.settings && result.settings.theme) || (result && result.theme);
      if (next && typeof next === 'object') state.theme = { ...DEFAULT_THEME, ...next };
      toast('Pengaturan tampilan disimpan.');
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  const resetTema = () => {
    state.theme = { ...DEFAULT_THEME };
    toast('Nilai bawaan dipulihkan. Klik Simpan tema untuk menerapkannya.', 'info');
    redraw();
  };

  const createAkun = async () => {
    const f = state.newUser;
    if (!String(f.nama).trim() || !String(f.email).trim()) {
      toast('Nama dan email wajib diisi.', 'error');
      return;
    }
    try {
      await createUser({
        ...f, id: `u${Date.now()}`,
        nama: String(f.nama).trim(), email: String(f.email).trim(),
      });
      state.newUser = blankUser();
      toast('Akun baru dibuat.');
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  const saveAkun = async (id) => {
    const u = (getDB().users || []).find((x) => x.id === id);
    if (!u) return;
    const draft = userDraft(u);
    try {
      await updateUser(id, {
        nama: u.nama, email: u.email, hp: u.hp, instansi: u.instansi, wilayah: u.wilayah,
        role: draft.role, aktif: Boolean(draft.aktif),
        ...(draft.password ? { password: draft.password } : {}),
      });
      delete state.userDrafts[id];
      toast(`Akun ${u.nama} diperbarui.`);
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  const deleteAkun = async (id) => {
    const u = (getDB().users || []).find((x) => x.id === id);
    if (!u || !confirmAction(`Hapus akun ${u.nama}? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      await deleteUser(id);
      delete state.userDrafts[id];
      toast(`Akun ${u.nama} dihapus.`);
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  const saveKategori = async () => {
    const f = state.kategori.draft;
    if (!String(f.nama).trim()) {
      toast('Nama kategori wajib diisi.', 'error');
      return;
    }
    try {
      const payload = {
        nama: String(f.nama).trim(), deskripsi: String(f.deskripsi || ''), aktif: Boolean(f.aktif),
      };
      if (f.id) await updateKategori(f.id, payload);
      else await createKategori({ ...payload, id: `c${Date.now()}` });
      state.kategori.draft = blankKategori();
      toast('Kategori disimpan.');
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  const toggleKategori = async (id, aktif) => {
    try {
      await updateKategori(id, { aktif });
      toast(aktif ? 'Kategori diaktifkan.' : 'Kategori dinonaktifkan.');
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  const deleteKategoriItem = async (id) => {
    const c = (getDB().categories || []).find((x) => x.id === id);
    if (!c || !confirmAction(`Hapus kategori ${c.nama}?`)) return;
    try {
      await deleteKategori(id);
      toast('Kategori dihapus.');
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  const saveLaporan = async (code) => {
    const r = (getDB().reports || []).find((x) => x.code === code);
    if (!r) return;
    const f = reportDraft(r);
    try {
      await updateReportAdmin(code, {
        jenis: f.jenis, prov: f.prov, kab: f.kab, kec: f.kec, kel: f.kel,
        alamat: f.alamat, verif: f.verif, penanganan: f.penanganan,
        korban: {
          luka: Number(f.korban.luka || 0), hilang: Number(f.korban.hilang || 0),
          meninggal: Number(f.korban.meninggal || 0), mengungsi: Number(f.korban.mengungsi || 0),
        },
      });
      delete state.reportDrafts[code];
      toast(`Laporan ${code} diperbarui.`);
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  const createPengumuman = async () => {
    const f = state.annNew;
    if (!String(f.title).trim() || !String(f.body).trim()) {
      toast('Judul dan isi pengumuman wajib diisi.', 'error');
      return;
    }
    try {
      await createAnnouncement({ ...f, title: String(f.title).trim() });
      state.annNew = blankAnnouncement();
      toast('Pengumuman dibuat.');
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  const savePengumuman = async (id) => {
    const a = (getDB().announcements || []).find((x) => x.id === id);
    if (!a) return;
    const f = annDraft(a);
    try {
      await updateAnnouncement(id, {
        title: f.title, body: f.body, severity: f.severity,
        jenis: f.jenis, prov: f.prov, kab: f.kab, kec: f.kec, kel: f.kel,
      });
      delete state.annDrafts[id];
      toast('Pengumuman diperbarui.');
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  const deletePengumuman = async (id) => {
    const a = (getDB().announcements || []).find((x) => x.id === id);
    if (!a || !confirmAction(`Hapus pengumuman '${a.title}'?`)) return;
    try {
      await deleteAnnouncement(id);
      delete state.annDrafts[id];
      toast('Pengumuman dihapus.');
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  const createBantuanItem = async () => {
    const f = state.banNew;
    if (!String(f.sumber).trim() || !String(f.jenis).trim() || !(Number(f.jumlah) > 0)) {
      toast('Sumber, jenis, dan jumlah bantuan wajib diisi.', 'error');
      return;
    }
    try {
      await createBantuan({ ...f, jumlah: Number(f.jumlah), at: new Date().toISOString() });
      state.banNew = blankBantuan();
      toast('Data bantuan ditambahkan.');
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  const saveBantuanItem = async (id) => {
    const b = (getDB().bantuan || []).find((x) => x.id === id);
    if (!b) return;
    const f = banDraft(b);
    try {
      await updateBantuan(id, {
        sumber: f.sumber, jenis: f.jenis, jumlah: Number(f.jumlah) || 0,
        satuan: f.satuan, kab: f.kab, code: f.code,
      });
      delete state.banDrafts[id];
      toast('Data bantuan diperbarui.');
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  const deleteBantuanItem = async (id) => {
    const b = (getDB().bantuan || []).find((x) => x.id === id);
    if (!b || !confirmAction(`Hapus bantuan ${b.jenis || b.id}?`)) return;
    try {
      await deleteBantuan(id);
      delete state.banDrafts[id];
      toast('Data bantuan dihapus.');
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  const createHistorisItem = async () => {
    const f = state.hisNew;
    if (!String(f.jenis).trim() || !f.kab || !f.tanggal) {
      toast('Jenis, wilayah, dan tanggal wajib diisi.', 'error');
      return;
    }
    try {
      await createHistoris({
        ...f, prov: f.prov || provOf(f.kab),
        meninggal: Number(f.meninggal) || 0,
        mengungsi: Number(f.mengungsi) || 0,
        rumahRusak: Number(f.rumahRusak) || 0,
      });
      state.hisNew = blankHistoris();
      toast('Data historis ditambahkan.');
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  const saveHistorisItem = async (id) => {
    const h = (getDB().historis || []).find((x) => x.id === id);
    if (!h) return;
    const f = hisDraft(h);
    try {
      await updateHistoris(id, {
        jenis: f.jenis, kab: f.kab, prov: f.prov || provOf(f.kab), tanggal: f.tanggal,
        meninggal: Number(f.meninggal) || 0, mengungsi: Number(f.mengungsi) || 0,
        rumahRusak: Number(f.rumahRusak) || 0, sumber: f.sumber,
      });
      delete state.hisDrafts[id];
      toast('Data historis diperbarui.');
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  const deleteHistorisItem = async (id) => {
    const h = (getDB().historis || []).find((x) => x.id === id);
    if (!h || !confirmAction(`Hapus data historis ${h.jenis || h.id}?`)) return;
    try {
      await deleteHistoris(id);
      delete state.hisDrafts[id];
      toast('Data historis dihapus.');
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  };

  /* ---------- Event delegation ---------- */

  const onClick = async (event) => {
    const subBtn = event.target.closest('[data-segment="cfg-sub"]');
    if (subBtn && pageRootRef.contains(subBtn)) {
      state.sub = subBtn.dataset.value;
      redraw();
      return;
    }
    const tabBtn = event.target.closest('[data-tab]');
    if (tabBtn && pageRootRef.contains(tabBtn)) {
      state.tab = tabBtn.dataset.tab;
      redraw();
      return;
    }
    const el = event.target.closest('[data-act]');
    if (!el || !pageRootRef.contains(el)) return;
    const id = el.dataset.id;
    switch (el.dataset.act) {
      case 'theme-save': await saveTema(); break;
      case 'theme-reset': resetTema(); break;
      case 'user-create': await createAkun(); break;
      case 'user-save': await saveAkun(id); break;
      case 'user-delete': await deleteAkun(id); break;
      case 'kat-save': await saveKategori(); break;
      case 'kat-cancel': state.kategori.draft = blankKategori(); redraw(); break;
      case 'kat-edit':
        state.kategori.draft = { ...((getDB().categories || []).find((x) => x.id === id) || blankKategori()) };
        redraw();
        break;
      case 'kat-delete': await deleteKategoriItem(id); break;
      case 'rep-save': await saveLaporan(el.dataset.code); break;
      case 'ann-create': await createPengumuman(); break;
      case 'ann-save': await savePengumuman(id); break;
      case 'ann-delete': await deletePengumuman(id); break;
      case 'ban-create': await createBantuanItem(); break;
      case 'ban-save': await saveBantuanItem(id); break;
      case 'ban-delete': await deleteBantuanItem(id); break;
      case 'his-create': await createHistorisItem(); break;
      case 'his-save': await saveHistorisItem(id); break;
      case 'his-delete': await deleteHistorisItem(id); break;
      default: break;
    }
  };

  const applyField = (t) => {
    if (!t || !pageRootRef || !pageRootRef.contains(t)) return false;
    const value = t.type === 'checkbox' ? t.checked : t.value;

    if (t.dataset.themeKey) {
      const key = t.dataset.themeKey;
      if (state.theme[key] === value) return true;
      state.theme[key] = value;
      const swatch = pageRootRef.querySelector(`[data-swatch="${CSS.escape(key)}"]`);
      if (swatch) swatch.style.background = cssSafe(value, DEFAULT_THEME[key]);
      const out = pageRootRef.querySelector(`[data-theme-value="${CSS.escape(key)}"]`);
      if (out) out.textContent = value;
      syncPreview();
      return true;
    }
    if (t.dataset.katToggle) {
      toggleKategori(t.dataset.katToggle, Boolean(value));
      return true;
    }
    if (t.dataset.new) {
      const key = t.dataset.new;
      if (state.newUser[key] === value) return true;
      state.newUser[key] = value;
      redraw(t.dataset.model);
      return true;
    }
    if (t.dataset.user && t.dataset.field) {
      const u = (getDB().users || []).find((x) => x.id === t.dataset.user);
      if (!u) return true;
      const draft = userDraft(u);
      const key = t.dataset.field;
      if (draft[key] === value) return true;
      draft[key] = value;
      redraw(t.dataset.model);
      return true;
    }
    if (t.dataset.kat && state.kategori.draft) {
      const f = state.kategori.draft;
      const key = t.dataset.kat;
      if (f[key] === value) return true;
      f[key] = value;
      redraw(t.dataset.model);
      return true;
    }
    if (t.dataset.rep && t.dataset.field) {
      const r = (getDB().reports || []).find((x) => x.code === t.dataset.rep);
      if (!r) return true;
      const draft = reportDraft(r);
      const key = t.dataset.field;
      const next = t.dataset.group === 'korban' ? String(value).replace(/\D/g, '') : value;
      if (t.dataset.group === 'korban') {
        if (draft.korban[key] === next) return true;
        draft.korban[key] = next;
      } else {
        if (draft[key] === next) return true;
        draft[key] = next;
      }
      redraw(t.dataset.model);
      return true;
    }
    if (t.dataset.annNew) {
      const key = t.dataset.annNew;
      if (state.annNew[key] === value) return true;
      state.annNew[key] = value;
      redraw(t.dataset.model);
      return true;
    }
    if (t.dataset.ann && t.dataset.field) {
      const a = (getDB().announcements || []).find((x) => x.id === t.dataset.ann);
      if (!a) return true;
      const draft = annDraft(a);
      const key = t.dataset.field;
      if (draft[key] === value) return true;
      draft[key] = value;
      redraw(t.dataset.model);
      return true;
    }
    if (t.dataset.banNew) {
      const key = t.dataset.banNew;
      if (state.banNew[key] === value) return true;
      state.banNew[key] = value;
      redraw(t.dataset.model);
      return true;
    }
    if (t.dataset.ban && t.dataset.field) {
      const b = (getDB().bantuan || []).find((x) => x.id === t.dataset.ban);
      if (!b) return true;
      const draft = banDraft(b);
      const key = t.dataset.field;
      if (draft[key] === value) return true;
      draft[key] = value;
      redraw(t.dataset.model);
      return true;
    }
    if (t.dataset.hisNew) {
      const key = t.dataset.hisNew;
      if (state.hisNew[key] === value) return true;
      state.hisNew[key] = value;
      redraw(t.dataset.model);
      return true;
    }
    if (t.dataset.his && t.dataset.field) {
      const h = (getDB().historis || []).find((x) => x.id === t.dataset.his);
      if (!h) return true;
      const draft = hisDraft(h);
      const key = t.dataset.field;
      if (draft[key] === value) return true;
      draft[key] = value;
      redraw(t.dataset.model);
      return true;
    }
    return false;
  };

  const onInput = (event) => { applyField(event.target); };
  const onChange = (event) => {
    const t = event.target;
    if (t.matches && t.matches('select, input[type="checkbox"]')) applyField(t);
  };

  return {
    title: 'Konfigurasi DB & Tampilan',
    html: render(),
    mount(pageRoot) {
      pageRootRef = pageRoot;
      bindTables();
      pageRoot.addEventListener('click', onClick);
      pageRoot.addEventListener('input', onInput);
      pageRoot.addEventListener('change', onChange);
      return () => {
        pageRoot.removeEventListener('click', onClick);
        pageRoot.removeEventListener('input', onInput);
        pageRoot.removeEventListener('change', onChange);
        pageRootRef = null;
      };
    },
  };
}

export { konfigurasi as Konfigurasi };
