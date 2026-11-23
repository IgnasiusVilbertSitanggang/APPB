import { api } from '../api.js';
import { WILAYAH } from '../wilayah.js';
import {
  getDB, reloadDB, me, createImport, createUser, setUserAktif, deleteUser,
  createKategori, updateKategori, deleteKategori, createBantuan, createHistoris, koreksi as koreksiLaporan,
} from '../store.js';
import {
  paint, esc, icon, link, Btn, LinkBtn, Badge, RStatus, HistBadge, Field, DL, Alert,
  Empty, Card, KPI, Toggle, Steps, PageHead, DataTable, mountTable, Sel, Segmented,
  Stepper, options, toast, downloadCSV, fmt, rel, fmtDate, Modal,
} from '../ui.js';

const KABS = Object.values(WILAYAH).flatMap((p) => Object.keys(p));
const provOf = (k) => Object.keys(WILAYAH).find((p) => WILAYAH[p][k]) || '';

const KL = [
  ['luka', 'Luka-luka'], ['hilang', 'Hilang'],
  ['meninggal', 'Meninggal Dunia'], ['mengungsi', 'Mengungsi/Selamat'],
];

/* ------------------------------------------------------------------ */
/* Helpers umum                                                        */
/* ------------------------------------------------------------------ */

function delegate(root, handlers) {
  const bound = [];
  Object.entries(handlers).forEach(([type, fn]) => {
    root.addEventListener(type, fn);
    bound.push([type, fn]);
  });
  return () => bound.forEach(([type, fn]) => root.removeEventListener(type, fn));
}

/** Snapshot dimuat oleh shell; muat ulang sekali bila halaman dibuka lebih awal. */
async function ensureData(redraw) {
  const d = getDB();
  const filled = d.reports.length || d.users.length || d.categories.length
    || d.logs.length || d.imports.length || d.bantuan.length || d.historis.length;
  if (filled) return;
  try {
    await reloadDB();
    redraw();
  } catch (error) {
    toast(error.message, 'error');
  }
}

function closeModalFrom(root, event, apply) {
  const closer = event.target.closest('[data-modal-close]');
  if (!closer) return false;
  const modal = closer.closest('[data-modal]');
  if (modal) apply(modal.id);
  return true;
}

function textInput(id, model, key, value, error, extra = '') {
  return `<input id="${esc(id)}" class="inp" value="${esc(value)}" data-model="${esc(model)}" data-input="${esc(key)}" aria-invalid="${error ? 'true' : 'false'}" ${extra} />`;
}

/* ------------------------------------------------------------------ */
/* Import wizard (reused)                                              */
/* ------------------------------------------------------------------ */

const SAMPLE = {
  wilayah: {
    label: 'Data wilayah', file: 'data_wilayah_jakarta_timur.csv',
    head: ['Kode Wilayah', 'Provinsi', 'Kabupaten/Kota', 'Kecamatan', 'Kelurahan'],
    rows: [
      ['3175031001', 'DKI Jakarta', 'Kota Jakarta Timur', 'Jatinegara', 'Kampung Melayu'],
      ['3175031002', 'DKI Jakarta', 'Kota Jakarta Timur', 'Jatinegara', 'Bidara Cina'],
      ['3175031003', 'DKI Jakarta', 'Kota Jakarta Timur', 'Jatinegara', 'Cipinang Besar Utara'],
      ['3175031003', 'DKI Jakarta', 'Kota Jakarta Timur', 'Jatinegara', 'Cipinang Besar Selatan'],
      ['3175031005', 'DKI Jakarta', 'Kota Jakarta Timur', '', 'Balimester'],
    ],
  },
  petugas: {
    label: 'Petugas/relawan', file: 'relawan_tagana_jabar.xlsx',
    head: ['NIK', 'Nama', 'Email', 'Instansi', 'Wilayah tugas', 'No. HP'],
    rows: [
      ['3217011203880001', 'Rizky Maulana', 'rizky.m@tagana.id', 'Tagana Jawa Barat (Relawan)', 'Kab. Bandung Barat', '081220031144'],
      ['3217014505910002', 'Neng Sri Wahyuni', 'neng.sw@tagana.id', 'Tagana Jawa Barat (Relawan)', 'Kab. Bandung Barat', '085721004433'],
      ['32170120119', 'Asep Sunandar', 'asep.s@tagana.id', 'Tagana Jawa Barat (Relawan)', 'Kab. Bandung Barat', '081394400211'],
      ['3205010101900004', 'Cecep Hidayat', '', 'BPBD Kab. Garut', 'Kab. Garut', '082115566778'],
      ['3217011203880001', 'Rizky Maulana', 'rizky.m2@tagana.id', 'Tagana Jawa Barat (Relawan)', 'Kab. Bandung Barat', '081220031144'],
    ],
  },
  historis: {
    label: 'Data bencana historis', file: 'dibi_bnpb_2015_2024.csv',
    head: ['ID', 'Jenis', 'Kabupaten/Kota', 'Tanggal', 'Meninggal', 'Mengungsi'],
    rows: [
      ['DIBI-2019-0412', 'Banjir', 'Kab. Ogan Komering Ilir', '2019-02-14', '0', '1250'],
      ['DIBI-2021-0988', 'Tanah Longsor', 'Kab. Bandung Barat', '2021-11-03', '2', '140'],
      ['DIBI-2022-1201', 'Gempa Bumi', 'Kab. Garut', '2022-12-03', '', '86'],
      ['DIBI-2020-0071', 'Banjir', 'Kota Jakarta Selatan', '2020-01-01', '3', '9420'],
    ],
  },
};

function validate(kind, rows) {
  const seen = new Set();
  return rows.map((r) => {
    const errs = [];
    if (kind === 'petugas' && !/^\d{16}$/.test(r[0])) errs.push(`NIK harus 16 digit (terbaca ${r[0].length} digit)`);
    if (kind === 'wilayah' && !/^\d{10}$/.test(r[0])) errs.push(`Kode Wilayah harus 10 digit (terbaca ${r[0].length} digit)`);
    if (seen.has(r[0])) errs.push(`Duplikat ${kind === 'historis' ? 'ID' : kind === 'wilayah' ? 'Kode Wilayah' : 'NIK'} dengan baris sebelumnya`);
    seen.add(r[0]);
    r.forEach((c, i) => { if (!c.trim()) errs.push(`Field wajib kosong: ${SAMPLE[kind].head[i]}`); });
    return errs;
  });
}

const wizards = new Map();

function setupWizard(id, kind, { userRole = 'petugas', onDone = null } = {}) {
  const s = wizards.get(id) || { step: 0, file: null, drag: false };
  s.kind = kind;
  s.userRole = userRole;
  s.onDone = onDone;
  wizards.set(id, s);
  return s;
}

function wizardHTML(id) {
  const s = wizards.get(id);
  const spec = SAMPLE[s.kind];
  const errs = validate(s.kind, spec.rows);
  const ok = errs.filter((e) => !e.length).length;
  const bad = spec.rows.length - ok;

  let body = '';
  if (s.step === 0) {
    body = `<div class="space-y-3">
      <div data-wizard-drop class="rounded-md border border-dashed p-6 flex flex-col sm:flex-row sm:items-center gap-3 ${s.drag ? 'border-navy bg-info-t' : 'border-slate-300 bg-app'}">
        ${icon('file-spreadsheet', '!w-5 !h-5 text-ink2')}
        <div class="flex-1 text-sm"><p class="font-medium">${esc(s.file || 'Seret file CSV atau Excel ke sini')}</p><p class="cap">Format .csv, .xlsx · maks. 10 MB · ${spec.head.length} kolom: ${esc(spec.head.join(', '))}</p></div>
        <label class="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-line bg-white text-[13px] font-medium cursor-pointer hover:bg-app">${icon('upload')}Pilih file<input type="file" accept=".csv,.xlsx,.xls" hidden data-wiz-input="file" /></label>
      </div>
      <div class="flex flex-wrap justify-between gap-2">
        ${Btn(`${icon('download')}Unduh Template`, { sm: true, v: 'ghost', attrs: 'data-wiz="template"' })}
        <div class="flex gap-2">
          ${Btn('Gunakan file contoh', { sm: true, attrs: 'data-wiz="sample"' })}
          ${Btn('Validasi', { sm: true, v: 'primary', attrs: `data-wiz="goto" data-step="1" ${s.file ? '' : 'disabled'}` })}
        </div>
      </div>
    </div>`;
  } else if (s.step === 1) {
    body = `<div class="space-y-3">
      ${Alert({
        tone: bad ? 'warn' : 'ok',
        title: `${spec.rows.length} baris dibaca dari ${s.file || spec.file}`,
        children: bad ? `${bad} baris tidak valid ditandai merah dan tidak akan disimpan.` : 'Semua baris valid.',
      })}
      <div class="card overflow-auto max-h-[380px]"><table class="w-full text-[13px] border-separate border-spacing-0">
        <thead class="sticky top-0"><tr><th class="th">Baris</th>${spec.head.map((h) => `<th class="th">${esc(h)}</th>`).join('')}<th class="th">Validasi</th></tr></thead>
        <tbody>${spec.rows.map((r, i) => `<tr class="${errs[i].length ? 'bg-crit-t' : ''}">
          <td class="td py-2 text-ink2">${i + 2}</td>
          ${r.map((c, j) => {
            const badCell = errs[i].some((e) => (j === 0 && /NIK|ID|Kode Wilayah/.test(e)) || e.endsWith(spec.head[j]));
            return `<td class="td py-2 whitespace-nowrap ${badCell ? 'text-crit font-medium' : ''}">${c ? esc(c) : '<span class="text-crit">(kosong)</span>'}</td>`;
          }).join('')}
          <td class="td py-2">${errs[i].length
            ? `<span class="text-crit">${esc(errs[i].join('; '))}</span>`
            : `<span class="text-ok inline-flex items-center gap-1">${icon('circle-check-big', '!w-3.5 !h-3.5')}Valid</span>`}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="flex justify-between">
        ${Btn('Kembali', { sm: true, attrs: 'data-wiz="goto" data-step="0"' })}
        ${Btn('Lihat hasil', { sm: true, v: 'primary', attrs: 'data-wiz="goto" data-step="2"' })}
      </div>
    </div>`;
  } else if (s.step === 2) {
    body = `<div class="space-y-3">
      <div class="grid grid-cols-2 gap-3 max-w-md">
        <div class="card p-3"><p class="cap">Berhasil</p><p class="text-2xl font-semibold text-ok">${ok}</p></div>
        <div class="card p-3"><p class="cap">Gagal</p><p class="text-2xl font-semibold text-crit">${bad}</p></div>
      </div>
      ${bad > 0 ? `<div class="card"><p class="px-4 h-10 flex items-center border-b border-line text-[13px] font-medium">Alasan kegagalan per baris</p><ul>${spec.rows.map((r, i) => errs[i].length
        ? `<li class="px-4 py-2 border-b border-line last:border-0 text-[13px] grid grid-cols-[64px_1fr] gap-2"><span class="text-ink2">Baris ${i + 2}</span><span><span class="font-medium">${esc(r[1] || '(tanpa nama)')}</span> — <span class="text-crit">${esc(errs[i].join('; '))}</span></span></li>`
        : '').join('')}</ul></div>` : ''}
      <div class="flex flex-wrap justify-between gap-2">
        ${Btn('Kembali', { sm: true, attrs: 'data-wiz="goto" data-step="1"' })}
        <div class="flex gap-2">
          ${bad > 0 ? Btn(`${icon('download')}Unduh Laporan Gagal`, { sm: true, attrs: 'data-wiz="failed"' }) : ''}
          ${Btn('Lanjut', { sm: true, v: 'primary', attrs: 'data-wiz="goto" data-step="3"' })}
        </div>
      </div>
    </div>`;
  } else {
    body = `<div class="space-y-3">
      ${Alert({
        tone: 'info', title: `Simpan ${ok} baris valid ke basis data?`,
        children: `Baris gagal tidak disimpan. Aksi ini tercatat di log audit atas nama ${esc(me(getDB())?.nama || '')}.`,
      })}
      <div class="flex justify-between">
        ${Btn('Kembali', { sm: true, attrs: 'data-wiz="goto" data-step="2"' })}
        ${Btn(`Simpan ${ok} baris`, { sm: true, v: 'primary', attrs: 'data-wiz="save"' })}
      </div>
    </div>`;
  }

  return `<div data-wizard="${esc(id)}" class="space-y-5">
    ${Steps({ steps: ['Unggah file', 'Validasi', 'Hasil', 'Konfirmasi'], current: s.step })}
    ${body}
  </div>`;
}

async function saveWizard(id, redraw) {
  const s = wizards.get(id);
  if (!s) return;
  const spec = SAMPLE[s.kind];
  const errs = validate(s.kind, spec.rows);
  const ok = errs.filter((e) => !e.length).length;
  const bad = spec.rows.length - ok;
  const file = s.file || spec.file;
  const validRows = spec.rows.filter((_, i) => !errs[i].length);
  try {
    await createImport({
      at: new Date().toISOString(), file, jenis: spec.label, berhasil: ok, gagal: bad,
    });
    if (s.kind === 'petugas') {
      for (const [i, r] of validRows.entries()) {
        await createUser({
          id: `imp${Date.now()}${i}`, nama: r[1], email: r[2], hp: r[5],
          instansi: r[3].replace(' (Relawan)', ''), wilayah: r[4], role: s.userRole, aktif: true,
        });
      }
    }
    if (s.kind === 'historis') {
      for (const r of validRows) {
        await createHistoris({
          id: r[0], jenis: r[1], kab: r[2], prov: provOf(r[2]), tanggal: r[3],
          meninggal: +r[4], mengungsi: +r[5], rumahRusak: 0, sumber: 'DIBI BNPB (import)',
        });
      }
    }
    toast(`${ok} baris disimpan. ${bad} baris gagal tidak disimpan.`);
    s.step = 0;
    s.file = null;
    s.drag = false;
    s.onDone?.();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function wizardClick(root, event, redraw) {
  const el = event.target.closest('[data-wiz]');
  if (!el || !root.contains(el)) return false;
  const host = el.closest('[data-wizard]');
  const id = host?.dataset.wizard;
  const s = id && wizards.get(id);
  if (!s) return false;
  const spec = SAMPLE[s.kind];
  const errs = validate(s.kind, spec.rows);
  switch (el.dataset.wiz) {
    case 'template':
      downloadCSV(`template_${s.kind}.csv`, [spec.head]);
      break;
    case 'sample':
      s.file = spec.file;
      redraw();
      break;
    case 'goto': {
      const step = Number(el.dataset.step);
      if (step === 1 && !s.file) break;
      s.step = step;
      redraw();
      break;
    }
    case 'failed':
      downloadCSV(`laporan_gagal_${s.kind}.csv`, [
        ['Baris', ...spec.head, 'Alasan'],
        ...spec.rows.map((r, i) => [i + 2, ...r, errs[i].join('; ')]).filter((_, i) => errs[i].length),
      ]);
      break;
    case 'save':
      await saveWizard(id, redraw);
      break;
    default:
      break;
  }
  return true;
}

function bindWizardDnD(root, redraw) {
  const zone = (event) => event.target.closest('[data-wizard-drop]');
  const state = (event) => {
    const z = zone(event);
    const id = z?.closest('[data-wizard]')?.dataset.wizard;
    return id ? { id, s: wizards.get(id) } : null;
  };
  const over = (event) => {
    const hit = state(event);
    if (!hit?.s) return;
    event.preventDefault();
    if (!hit.s.drag) { hit.s.drag = true; redraw(); }
  };
  const leave = (event) => {
    const hit = state(event);
    if (!hit?.s?.drag) return;
    event.preventDefault();
    hit.s.drag = false;
    redraw();
  };
  const drop = (event) => {
    const hit = state(event);
    if (!hit?.s) return;
    event.preventDefault();
    hit.s.drag = false;
    hit.s.file = event.dataTransfer?.files?.[0]?.name || SAMPLE[hit.s.kind].file;
    redraw();
  };
  root.addEventListener('dragover', over);
  root.addEventListener('dragleave', leave);
  root.addEventListener('drop', drop);
  return () => {
    root.removeEventListener('dragover', over);
    root.removeEventListener('dragleave', leave);
    root.removeEventListener('drop', drop);
  };
}

function wizardInput(root, event, redraw) {
  const inputEl = event.target.closest('[data-wiz-input]');
  if (!inputEl || !root.contains(inputEl)) return false;
  const id = inputEl.closest('[data-wizard]')?.dataset.wizard;
  const s = id && wizards.get(id);
  if (!s) return false;
  if (inputEl.dataset.wizInput === 'file') {
    s.file = inputEl.files?.[0]?.name || null;
    redraw();
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export function dashboard(ctx = {}) {
  const render = () => {
    const d = getDB();
    const imp = d.imports[0];
    const pet = d.users.filter((u) => u.role === 'petugas' || u.role === 'relawan');
    const resmi = d.reports.filter((r) => r.verif === 'Resmi');
    const byWilayah = pet.reduce((a, u) => { a[u.wilayah] = (a[u.wilayah] || 0) + 1; return a; }, {});
    return `<div>
      ${PageHead({
        title: 'Dashboard Admin',
        desc: 'Ringkasan sistem APPB nasional.',
        actions: `${LinkBtn('/admin/petugas', `${icon('upload')}Kelola petugas`)}${LinkBtn('/admin/import/wilayah', `${icon('upload')}Import wilayah`, { v: 'primary' })}`,
      })}
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        ${KPI({
          label: 'Total laporan', value: esc(d.reports.length),
          sub: `${d.reports.filter((r) => r.verif === 'Tertunda').length} tertunda · ${d.reports.filter((r) => r.verif === 'Ditolak').length} ditolak`,
        })}
        ${KPI({
          label: 'Laporan Resmi', value: esc(resmi.length),
          sub: `${resmi.filter((r) => r.penanganan === 'Case Closed').length} Case Closed`, tone: 'ok',
        })}
        ${KPI({
          label: 'Entri log (24 jam)',
          value: esc(d.logs.filter((l) => Date.now() - +new Date(l.at) < 86400000).length),
          sub: `${d.logs.length} total`,
        })}
        ${KPI({
          label: 'Kategori aktif',
          value: esc(`${d.categories.filter((c) => c.aktif).length}/${d.categories.length}`),
          sub: 'tampil di form warga',
        })}
      </div>
      <div class="grid xl:grid-cols-3 gap-5 items-start">
        ${Card({
          title: 'Import terakhir',
          actions: link('/admin/petugas', 'Riwayat', 'text-[13px] link'),
          children: imp ? `<div class="flex items-center gap-2 mb-3">${imp.gagal
            ? Badge('amber', `Selesai dengan ${esc(imp.gagal)} gagal`)
            : Badge('green', 'Berhasil')}</div>
            ${DL([
              ['File', `<span class="flex items-center gap-1.5">${icon('file-spreadsheet', 'text-mute')}${esc(imp.file)}</span>`],
              ['Jenis', esc(imp.jenis)],
              ['Hasil', `${Number(imp.berhasil || 0).toLocaleString('id-ID')} berhasil · ${esc(imp.gagal)} gagal`],
              ['Waktu', `${esc(fmt(imp.at))} · ${esc(imp.by)}`],
            ], 1)}` : '<p class="cap">Belum ada import.</p>',
        })}
        ${Card({
          title: 'Akun operasional',
          actions: `<span class="flex gap-3">${link('/admin/petugas', 'Petugas', 'text-[13px] link')}${link('/admin/relawan', 'Relawan', 'text-[13px] link')}</span>`,
          children: `<div class="grid grid-cols-2 gap-px bg-line border border-line rounded-md overflow-hidden">
            <div class="bg-white p-3"><p class="cap">Petugas</p><p class="text-2xl font-semibold text-navy">${pet.filter((u) => u.role === 'petugas').length}</p></div>
            <div class="bg-white p-3"><p class="cap">Relawan</p><p class="text-2xl font-semibold text-navy">${pet.filter((u) => u.role === 'relawan').length}</p></div>
          </div>
          <ul class="mt-3 text-[13px] space-y-1.5">${Object.entries(byWilayah).map(([w, n]) => `<li class="flex justify-between"><span class="text-ink2">${esc(w)}</span><span>${esc(n)}</span></li>`).join('')}</ul>`,
        })}
        ${Card({
          title: 'Aktivitas admin', pad: false,
          actions: link('/admin/log', 'Log', 'text-[13px] link'),
          children: `<ul>${d.logs.filter((l) => l.role === 'admin').slice(0, 6).map((l) => `<li class="px-4 py-2.5 border-b border-line last:border-0 text-[13px]">
            <p class="font-medium">${esc(l.aksi)}</p>
            <p class="text-ink2 truncate">${esc(l.detail)}</p>
            <p class="cap">${esc(l.actor)} · ${esc(rel(l.at))}</p>
          </li>`).join('')}</ul>`,
        })}
      </div>
    </div>`;
  };
  return {
    title: 'Dashboard Admin',
    html: render(),
    mount(pageRoot) {
      const redraw = () => paint(pageRoot, render());
      ensureData(redraw);
      return () => {};
    },
  };
}

export { dashboard as AdminDashboard };

/* ------------------------------------------------------------------ */
/* ImportWilayah                                                       */
/* ------------------------------------------------------------------ */

export function importWilayah(ctx = {}) {
  const id = 'wizard-import-wilayah';
  const tableId = 'import-wilayah-history';
  wizards.delete(id);
  const state = { table: {} };
  let redraw = () => {};

  const render = () => {
    const d = getDB();
    setupWizard(id, 'wilayah', { onDone: () => redraw() });
    const imports = d.imports.filter((item) => item.jenis === SAMPLE.wilayah.label);
    return `<div>
      ${PageHead({
        title: 'Import Data Wilayah',
        desc: 'Impor referensi wilayah administratif dari provinsi hingga kelurahan.',
      })}
      ${Card({ title: 'Import Data Wilayah baru', children: wizardHTML(id) })}
      <h2 class="text-sm font-semibold mt-6 mb-2">Riwayat import data wilayah</h2>
      ${imports.length === 0
        ? Card({ pad: false, children: Empty('Belum ada riwayat import data wilayah.') })
        : DataTable(imports, [
          { key: 'at', header: 'Waktu', render: (i) => `<span class="whitespace-nowrap">${esc(fmt(i.at))}</span>`, sort: (i) => i.at },
          { key: 'f', header: 'File', render: (i) => esc(i.file) },
          { key: 'ok', header: 'Berhasil', render: (i) => esc(Number(i.berhasil || 0).toLocaleString('id-ID')), sort: (i) => i.berhasil, className: 'text-right' },
          { key: 'g', header: 'Gagal', render: (i) => `<span class="${i.gagal ? 'text-crit' : ''}">${esc(i.gagal)}</span>`, sort: (i) => i.gagal, className: 'text-right' },
          { key: 'by', header: 'Oleh', render: (i) => esc(i.by) },
        ], { id: tableId, state: state.table, rowKey: (i) => i.at + i.file })}
    </div>`;
  };

  let pageRootRef = null;
  // mountTable hanya memerlukan rows/state/rowKey untuk aksi sort/halaman; kolom
  // tidak dipakai ulang di sini, jadi disediakan daftar kosong secara eksplisit.
  const bindTable = () => mountTable(pageRootRef, tableId, {
    rows: getDB().imports.filter((item) => item.jenis === SAMPLE.wilayah.label),
    cols: [], state: state.table, rowKey: (i) => i.at + i.file,
  }, (next) => { state.table = next; redraw(); });

  redraw = (focusKey) => {
    if (!pageRootRef) return;
    paint(pageRootRef, render(), focusKey);
    bindTable();
  };

  return {
    title: 'Import Data Wilayah',
    html: render(),
    mount(pageRoot, ctx2 = {}) {
      pageRootRef = pageRoot;
      bindTable();
      const cleanupDnD = bindWizardDnD(pageRoot, redraw);
      const cleanup = delegate(pageRoot, {
        click: async (event) => { await wizardClick(pageRoot, event, redraw); },
        input: (event) => { wizardInput(pageRoot, event, redraw); },
        change: (event) => { wizardInput(pageRoot, event, redraw); },
      });
      ensureData(redraw);
      return () => { cleanupDnD(); cleanup(); };
    },
  };
}

export { importWilayah as ImportWilayah };

/* ------------------------------------------------------------------ */
/* KelolaAkun / Petugas / Relawan                                      */
/* ------------------------------------------------------------------ */

const blankU = (role) => ({ id: '', nama: '', email: '', hp: '', instansi: '', wilayah: '', role, aktif: true });

export function kelolaAkun(role = 'petugas', ctx = {}) {
  if (role && typeof role === 'object') {
    ctx = role;
    role = ctx.role || (String(ctx.path || '').includes('/relawan') ? 'relawan' : 'petugas');
  }
  const tableId = `akun-${role}`;
  const wizardId = `wizard-import-${role}`;
  wizards.delete(wizardId);
  const state = {
    edit: null, err: {}, deact: null, del: null, imp: false,
    q: '', st: '', table: {}, exportIds: [], clearSel: null,
  };
  let pageRootRef = null;
  let redraw = () => {};
  const label = role === 'relawan' ? 'Relawan' : 'Petugas';

  const render = () => {
    const d = getDB();
    const users = d.users.filter((u) => u.role === role);
    const rows = users.filter((u) => (
      (!state.q || `${u.nama} ${u.email} ${u.instansi}`.toLowerCase().includes(state.q.toLowerCase()))
      && (!state.st || (state.st === 'Aktif') === u.aktif)
    ));
    const e = state.err;
    const edit = state.edit;
    setupWizard(wizardId, 'petugas', {
      userRole: role,
      onDone: () => { state.imp = false; redraw(); },
    });

    const cols = [
      { key: 'n', header: 'Nama', render: (u) => `<span class="font-medium">${esc(u.nama)}</span>`, sort: (u) => u.nama },
      { key: 'k', header: 'Kontak', render: (u) => `<p>${esc(u.email)}</p><p class="cap">${esc(u.hp)}</p>` },
      { key: 'i', header: 'Instansi', render: (u) => esc(u.instansi), sort: (u) => u.instansi },
      { key: 'w', header: 'Wilayah tugas', render: (u) => esc(u.wilayah), sort: (u) => u.wilayah },
      {
        key: 'a', header: 'Aktif',
        render: (u) => `<span class="inline-flex items-center gap-2.5" data-no-row>${Toggle({ on: u.aktif, label: `Status ${u.nama}`, name: u.id })}<span class="text-xs font-medium min-w-[52px] ${u.aktif ? 'text-ok' : 'text-ink2'}">${u.aktif ? 'Aktif' : 'Nonaktif'}</span></span>`,
        sort: (u) => (u.aktif ? 1 : 0),
      },
      {
        key: 'e', header: '',
        render: (u) => `<span class="inline-flex items-center gap-1" data-no-row>
          ${Btn(icon('pencil'), { sm: true, v: 'ghost', attrs: `data-no-row data-act="edit" data-id="${esc(u.id)}" aria-label="Ubah ${esc(u.nama)}"` })}
          ${Btn(icon('trash-2'), { sm: true, v: 'ghost', cls: 'text-crit hover:text-crit', attrs: `data-no-row data-act="delete" data-id="${esc(u.id)}" aria-label="Hapus ${esc(u.nama)}"` })}
        </span>`,
      },
    ];
    state.tableCols = cols;

    return `<div>
      ${PageHead({
        title: `Kelola ${label}`,
        desc: `${users.filter((u) => u.aktif).length} aktif · ${users.filter((u) => !u.aktif).length} nonaktif`,
        actions: `${Btn(`${icon('file-spreadsheet')}Import Massal (Excel/CSV)`, { attrs: 'data-act="import-open"' })}${Btn(`${icon('plus')}Tambah ${esc(label.toLowerCase())}`, { v: 'primary', attrs: 'data-act="edit-new"' })}`,
      })}
      ${DataTable(rows, cols, {
        id: tableId,
        state: state.table,
        rowKey: (u) => u.id,
        selectable: true,
        initialSort: ['n', 'asc'],
        toolbar: `<div class="relative">${icon('search', 'absolute left-2.5 top-1/2 -translate-y-1/2 text-mute')}<input aria-label="Cari ${esc(label.toLowerCase())}" class="inp pl-8 !w-56" placeholder="Nama, email, instansi" value="${esc(state.q)}" data-model="akun-q" data-input="q" /></div>
          ${Sel({ label: 'Status', value: state.st, onChange: null, options: ['Aktif', 'Nonaktif'], placeholder: 'Semua status', name: 'akun-st' })}`,
        bulk: (ids, clear) => {
          state.exportIds = ids;
          state.clearSel = clear;
          return Btn(`${icon('download')}Ekspor terpilih`, { sm: true, attrs: 'data-act="export-selected"' });
        },
      })}
      ${Modal({
        id: 'modal-akun-edit',
        title: edit?.id ? `Ubah ${label.toLowerCase()}` : `Tambah ${label.toLowerCase()}`,
        open: !!edit,
        children: edit ? `<div class="grid sm:grid-cols-2 gap-4">
          ${Field({ label: 'Nama lengkap', req: true, id: 'un', error: e.nama, children: textInput('un', 'un', 'nama', edit.nama, e.nama) })}
          ${Field({ label: 'Email', req: true, id: 'ue', error: e.email, children: textInput('ue', 'ue', 'email', edit.email, e.email) })}
          ${Field({ label: 'Nomor HP', req: true, id: 'uh', error: e.hp, children: textInput('uh', 'uh', 'hp', edit.hp, e.hp) })}
          ${Field({ label: 'Instansi', req: true, id: 'ui', error: e.instansi, children: textInput('ui', 'ui', 'instansi', edit.instansi, e.instansi, 'placeholder="BPBD Kab. ..."') })}
          <div class="sm:col-span-2">${Field({
            label: 'Wilayah tugas', req: true, id: 'uw', error: e.wilayah,
            children: `<select id="uw" class="inp" data-model="uw" data-input="wilayah" aria-invalid="${e.wilayah ? 'true' : 'false'}">${options(KABS, edit.wilayah, 'Pilih kabupaten/kota')}</select>`,
          })}</div>
        </div>` : '',
        footer: `${Btn('Batal', { attrs: 'data-act="edit-cancel"' })}${Btn('Simpan perubahan', { v: 'primary', attrs: 'data-act="edit-save"' })}`,
      })}
      ${Modal({
        id: 'modal-akun-deact',
        title: 'Nonaktifkan akun',
        open: !!state.deact,
        children: `<p class="text-sm text-ink2">Nonaktifkan <strong class="text-ink font-medium">${esc(state.deact?.nama || '')}</strong> (${esc(state.deact?.instansi || '')})? ${label} nonaktif tidak dapat login. Riwayat log tetap tersimpan.</p>`,
        footer: `${Btn('Batal', { attrs: 'data-act="deact-cancel"' })}${Btn('Nonaktifkan', { v: 'danger', attrs: 'data-act="deact-confirm"' })}`,
      })}
      ${Modal({
        id: 'modal-akun-delete',
        title: `Hapus ${label.toLowerCase()}`,
        open: !!state.del,
        children: `<p class="text-sm text-ink2">Hapus data <strong class="text-ink font-medium">${esc(state.del?.nama || '')}</strong> (${esc(state.del?.instansi || '')}) secara permanen? Akun tidak dapat dipulihkan. Riwayat log tetap tersimpan.</p>`,
        footer: `${Btn('Batal', { attrs: 'data-act="del-cancel"' })}${Btn(`${icon('trash-2')}Hapus permanen`, { v: 'danger', attrs: 'data-act="del-confirm"' })}`,
      })}
      ${Modal({
        id: 'modal-akun-import',
        title: `Import Massal ${label}`,
        open: state.imp,
        wide: true,
        children: wizardHTML(wizardId),
      })}
    </div>`;
  };

  const bindTable = () => {
    const users = getDB().users.filter((u) => u.role === role);
    const rows = users.filter((u) => (
      (!state.q || `${u.nama} ${u.email} ${u.instansi}`.toLowerCase().includes(state.q.toLowerCase()))
      && (!state.st || (state.st === 'Aktif') === u.aktif)
    ));
    mountTable(pageRootRef, tableId, { rows, cols: state.tableCols || [], state: state.table, rowKey: (u) => u.id }, (next) => {
      state.table = next;
      redraw();
    });
  };

  redraw = (focusKey) => {
    if (!pageRootRef) return;
    paint(pageRootRef, render(), focusKey);
    bindTable();
  };

  const findUser = (id) => getDB().users.find((u) => u.id === id);

  async function toggle(u, on) {
    if (!on) { state.deact = u; redraw(); return; }
    try {
      await setUserAktif(u.id, true);
      toast(`${u.nama} diaktifkan.`);
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  }

  async function saveU() {
    if (!state.edit) return;
    const edit = state.edit;
    const users = getDB().users.filter((u) => u.role === role);
    const e = {};
    if (edit.nama.trim().length < 3) e.nama = 'Nama minimal 3 karakter.';
    if (!/^[^@\s]+@[^@\s]+\.[a-z.]+$/i.test(edit.email)) e.email = 'Format email tidak valid, mis. nama@bpbd.go.id.';
    else if (users.some((u) => u.email === edit.email && u.id !== edit.id)) e.email = 'Email sudah digunakan akun lain.';
    if (!/^0\d{9,12}$/.test(edit.hp.replace(/[-\s]/g, ''))) e.hp = 'Nomor HP harus diawali 0 dan berisi 10–13 angka.';
    if (!edit.instansi.trim()) e.instansi = 'Instansi wajib diisi.';
    if (!edit.wilayah) e.wilayah = 'Pilih wilayah tugas.';
    state.err = e;
    if (Object.keys(e).length) { redraw(); return; }
    const isNew = !edit.id;
    const u = { ...edit, id: edit.id || `u${Date.now()}` };
    try {
      if (isNew) await createUser(u);
      else {
        await api.patch(`/users/${encodeURIComponent(u.id)}`, u);
        await reloadDB();
      }
      toast(isNew ? `Akun ${u.nama} dibuat.` : 'Perubahan disimpan.');
      state.edit = null;
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  }

  return {
    title: `Kelola ${label}`,
    html: render(),
    mount(pageRoot, ctx2 = {}) {
      pageRootRef = pageRoot;
      bindTable();
      const cleanupDnD = bindWizardDnD(pageRoot, redraw);
      const cleanup = delegate(pageRoot, {
        click: async (event) => {
          if (await wizardClick(pageRoot, event, redraw)) return;
          if (closeModalFrom(pageRoot, event, (id) => {
            if (id === 'modal-akun-edit') state.edit = null;
            if (id === 'modal-akun-deact') state.deact = null;
            if (id === 'modal-akun-delete') state.del = null;
            if (id === 'modal-akun-import') state.imp = false;
            redraw();
          })) return;
          const actEl = event.target.closest('[data-act]');
          if (actEl && pageRoot.contains(actEl)) {
            const id = actEl.dataset.id;
            switch (actEl.dataset.act) {
              case 'import-open': state.imp = true; redraw(); return;
              case 'edit-new': state.err = {}; state.edit = blankU(role); redraw(); return;
              case 'edit': state.err = {}; state.edit = { ...findUser(id) }; redraw(); return;
              case 'edit-cancel': state.edit = null; redraw(); return;
              case 'edit-save': await saveU(); return;
              case 'deact-cancel': state.deact = null; redraw(); return;
              case 'deact-confirm': {
                const u = state.deact;
                if (!u) return;
                try {
                  await setUserAktif(u.id, false);
                  toast(`${u.nama} dinonaktifkan.`);
                  state.deact = null;
                  redraw();
                } catch (error) { toast(error.message, 'error'); }
                return;
              }
              case 'del-cancel': state.del = null; redraw(); return;
              case 'del-confirm': {
                const u = state.del;
                if (!u) return;
                try {
                  await deleteUser(u.id);
                  toast(`Data ${u.nama} dihapus.`);
                  state.del = null;
                  redraw();
                } catch (error) { toast(error.message, 'error'); }
                return;
              }
              case 'export-selected': {
                const ids = state.exportIds || [];
                downloadCSV(`${role}_terpilih.csv`, [
                  ['Nama', 'Email', 'HP', 'Instansi', 'Wilayah', 'Status'],
                  ...getDB().users.filter((u) => ids.includes(u.id)).map((u) => [u.nama, u.email, u.hp, u.instansi, u.wilayah, u.aktif ? 'Aktif' : 'Nonaktif']),
                ]);
                state.clearSel?.();
                redraw();
                return;
              }
              default: break;
            }
          }
          const toggleEl = event.target.closest('[data-toggle]');
          if (toggleEl && pageRoot.contains(toggleEl) && !toggleEl.closest('[data-modal]')) {
            const u = findUser(toggleEl.dataset.toggle);
            if (u) await toggle(u, toggleEl.getAttribute('aria-checked') !== 'true');
          }
        },
        input: (event) => {
          const t = event.target;
          if (wizardInput(pageRoot, event, redraw)) return;
          if (!pageRoot.contains(t)) return;
          if (t.dataset.input === 'q') {
            state.q = t.value;
            redraw(t.dataset.model);
            return;
          }
          if (t.matches('[data-input]') && state.edit) {
            state.edit[t.dataset.input] = t.value;
            redraw(t.dataset.model);
          }
        },
        change: (event) => {
          const t = event.target;
          if (wizardInput(pageRoot, event, redraw)) return;
          if (t.matches?.('[data-sel="akun-st"]')) {
            state.st = t.value;
            redraw();
          }
        },
      });
      ensureData(redraw);
      return () => { cleanupDnD(); cleanup(); };
    },
  };
}

export function kelolaPetugas(ctx = {}) { return kelolaAkun('petugas', ctx); }
export function kelolaRelawan(ctx = {}) { return kelolaAkun('relawan', ctx); }
export { kelolaPetugas as KelolaPetugas, kelolaRelawan as KelolaRelawan };

/* ------------------------------------------------------------------ */
/* Bantuan                                                             */
/* ------------------------------------------------------------------ */

export function bantuan(ctx = {}) {
  const tableId = 'bantuan-table';
  const state = {
    group: 'Wilayah',
    f: { sumber: '', jenis: '', jumlah: '', satuan: 'paket', kab: '', code: '' },
    err: {}, table: {},
  };
  let pageRootRef = null;
  let redraw = () => {};

  const render = () => {
    const d = getDB();
    const f = state.f;
    const e = state.err;
    const per = Object.entries(d.bantuan.reduce((a, b) => {
      const key = state.group === 'Wilayah' ? b.kab : (b.code || 'Tanpa laporan tujuan');
      a[key] = a[key] || { n: 0, src: new Set() };
      a[key].n += 1;
      a[key].src.add(b.sumber);
      return a;
    }, {}));
    const reportOpts = d.reports.filter((r) => r.verif === 'Resmi' && (!f.kab || r.kab === f.kab))
      .map((r) => `<option value="${esc(r.code)}"${r.code === f.code ? ' selected' : ''}>${esc(`${r.code} · ${r.jenis} · ${r.kel}`)}</option>`).join('');

    return `<div>
      ${PageHead({ title: 'Catat Data Bantuan', desc: 'Bantuan logistik yang diterima dan disalurkan ke wilayah terdampak.' })}
      <div class="grid xl:grid-cols-[380px_1fr] gap-5 items-start">
        <div class="space-y-4">
          ${Card({
            title: 'Bantuan baru',
            children: `<div class="space-y-3">
              ${Field({
                label: 'Sumber', req: true, id: 'bs', error: e.sumber,
                children: `<input id="bs" list="srcs" class="inp" placeholder="mis. PMI, Kemensos, BNPB" value="${esc(f.sumber)}" data-model="bs" data-input="sumber" aria-invalid="${e.sumber ? 'true' : 'false'}" />
                  <datalist id="srcs">${['PMI', 'BNPB', 'Kementerian Sosial', 'Dinas Sosial', 'Baznas', 'ACT'].map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>`,
              })}
              ${Field({ label: 'Jenis bantuan', req: true, id: 'bj', error: e.jenis, children: textInput('bj', 'bj', 'jenis', f.jenis, e.jenis, 'placeholder="mis. Selimut, Beras, Tenda"') })}
              <div class="grid grid-cols-[1fr_120px] gap-2">
                ${Field({ label: 'Jumlah', req: true, id: 'bn', error: e.jumlah, children: `<input id="bn" inputmode="decimal" class="inp" value="${esc(f.jumlah)}" data-model="bn" data-input="jumlah" aria-invalid="${e.jumlah ? 'true' : 'false'}" />` })}
                ${Field({
                  label: 'Satuan', id: 'bu',
                  children: `<select id="bu" class="inp" data-model="bu" data-input="satuan">${options(['paket', 'lembar', 'unit', 'dus', 'kg', 'ton', 'liter', 'pcs'], f.satuan, null)}</select>`,
                })}
              </div>
              ${Field({
                label: 'Wilayah tujuan', req: true, id: 'bw', error: e.kab,
                children: `<select id="bw" class="inp" data-model="bw" data-input="kab" aria-invalid="${e.kab ? 'true' : 'false'}">${options(KABS, f.kab, 'Pilih kabupaten/kota')}</select>`,
              })}
              ${Field({
                label: 'Laporan tujuan', id: 'bl', help: 'Opsional.',
                children: `<select id="bl" class="inp" data-model="bl" data-input="code"><option value="">Tidak ditautkan</option>${reportOpts}</select>`,
              })}
              ${Btn('Simpan', { v: 'primary', cls: 'w-full', attrs: 'data-act="save"' })}
            </div>`,
          })}
          ${Card({
            title: `Rekap bantuan per ${state.group.toLowerCase()}`, pad: false,
            children: `<div class="p-3">${Segmented({ label: 'Kelompok rekap', value: state.group, options: ['Wilayah', 'Laporan'], name: 'bantuan-group' })}</div>
              <ul>${per.map(([k, v]) => `<li class="flex justify-between gap-2 px-4 py-2.5 border-b border-line last:border-0 text-[13px]"><span>${esc(k)}<span class="block cap">${esc([...v.src].join(', '))}</span></span><span class="font-medium">${v.n} kiriman</span></li>`).join('')}</ul>`,
          })}
        </div>
        ${DataTable(d.bantuan, [
          { key: 'at', header: 'Waktu', render: (b) => `<span class="whitespace-nowrap">${esc(fmt(b.at))}</span>`, sort: (b) => b.at },
          { key: 's', header: 'Sumber', render: (b) => esc(b.sumber), sort: (b) => b.sumber },
          { key: 'j', header: 'Jenis', render: (b) => esc(b.jenis), sort: (b) => b.jenis },
          { key: 'n', header: 'Jumlah', render: (b) => `<span class="whitespace-nowrap">${Number(b.jumlah || 0).toLocaleString('id-ID')} ${esc(b.satuan)}</span>`, sort: (b) => b.jumlah, className: 'text-right' },
          { key: 'k', header: 'Wilayah', render: (b) => esc(b.kab), sort: (b) => b.kab },
          { key: 'c', header: 'Laporan', render: (b) => (b.code ? `<span class="text-navy">${esc(b.code)}</span>` : '<span class="text-mute">—</span>') },
          { key: 'by', header: 'Dicatat oleh', render: (b) => esc(b.by) },
        ], { id: tableId, state: state.table, rowKey: (b) => b.id, initialSort: ['at', 'desc'] })}
      </div>
    </div>`;
  };

  const bindTable = () => mountTable(pageRootRef, tableId, {
    rows: getDB().bantuan, cols: [], state: state.table, rowKey: (b) => b.id,
  }, (next) => { state.table = next; redraw(); });

  redraw = (focusKey) => {
    if (!pageRootRef) return;
    paint(pageRootRef, render(), focusKey);
    bindTable();
  };

  async function save() {
    const f = state.f;
    const e = {};
    if (!f.sumber.trim()) e.sumber = 'Sumber bantuan wajib diisi.';
    if (!f.jenis.trim()) e.jenis = 'Jenis bantuan wajib diisi.';
    if (!(+f.jumlah > 0)) e.jumlah = 'Jumlah harus lebih dari 0.';
    if (!f.kab) e.kab = 'Pilih wilayah tujuan.';
    state.err = e;
    if (Object.keys(e).length) { redraw(); return; }
    try {
      await createBantuan({
        ...f, jumlah: +f.jumlah, code: f.code || undefined,
        at: new Date().toISOString(), by: me(getDB())?.nama || '',
      });
      toast('Data bantuan dicatat.');
      state.f = { ...f, jenis: '', jumlah: '' };
      state.err = {};
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  }

  return {
    title: 'Catat Data Bantuan',
    html: render(),
    mount(pageRoot) {
      pageRootRef = pageRoot;
      bindTable();
      const cleanup = delegate(pageRoot, {
        click: async (event) => {
          const seg = event.target.closest('[data-segment="bantuan-group"]');
          if (seg) { state.group = seg.dataset.value; redraw(); return; }
          if (event.target.closest('[data-act="save"]')) await save();
        },
        input: (event) => {
          const t = event.target;
          if (!t.matches?.('[data-input]') || !pageRoot.contains(t)) return;
          const key = t.dataset.input;
          let value = t.value;
          if (key === 'jumlah') value = value.replace(/[^\d.]/g, '');
          state.f[key] = value;
          if (key === 'kab') state.f.code = '';
          redraw(t.dataset.model);
        },
      });
      ensureData(redraw);
      return cleanup;
    },
  };
}

export { bantuan as Bantuan };

/* ------------------------------------------------------------------ */
/* Kategori                                                            */
/* ------------------------------------------------------------------ */

export function kategori(ctx = {}) {
  const tableId = 'kategori-table';
  const state = { edit: null, del: null, err: '', table: {} };
  let pageRootRef = null;
  let redraw = () => {};

  const render = () => {
    const d = getDB();
    const used = (c) => d.reports.filter((r) => r.jenis === c.nama).length;
    const edit = state.edit;
    const del = state.del;
    return `<div>
      ${PageHead({
        title: 'Kelola Kategori Bencana',
        desc: 'Kategori nonaktif tidak muncul di form warga; laporan lama tetap menampilkan kategori aslinya.',
        actions: Btn(`${icon('plus')}Tambah kategori`, { v: 'primary', attrs: 'data-act="edit-new"' }),
      })}
      ${DataTable(d.categories, [
        { key: 'n', header: 'Nama', render: (c) => `<span class="font-medium">${esc(c.nama)}</span>`, sort: (c) => c.nama },
        { key: 'd', header: 'Keterangan', render: (c) => `<span class="text-ink2">${esc(c.deskripsi)}</span>` },
        { key: 'u', header: 'Dipakai laporan', render: (c) => used(c), sort: (c) => used(c), className: 'text-right' },
        {
          key: 'a', header: 'Aktif',
          render: (c) => `<span class="inline-flex items-center gap-2.5" data-no-row>${Toggle({ on: c.aktif, label: `Aktif ${c.nama}`, name: c.id })}<span class="text-xs font-medium min-w-[52px] ${c.aktif ? 'text-ok' : 'text-ink2'}">${c.aktif ? 'Aktif' : 'Nonaktif'}</span></span>`,
          sort: (c) => (c.aktif ? 1 : 0),
        },
        {
          key: 'x', header: '',
          render: (c) => `<span class="flex gap-1 justify-end" data-no-row>
            ${Btn(icon('pencil'), { sm: true, v: 'ghost', attrs: `data-no-row data-act="edit" data-id="${esc(c.id)}" aria-label="Ubah ${esc(c.nama)}"` })}
            ${Btn(icon('trash-2'), { sm: true, v: 'ghost', attrs: `data-no-row data-act="delete" data-id="${esc(c.id)}" aria-label="Hapus ${esc(c.nama)}"` })}
          </span>`,
        },
      ], { id: tableId, state: state.table, rowKey: (c) => c.id })}
      ${Modal({
        id: 'modal-kategori-edit',
        title: edit?.id ? 'Ubah kategori' : 'Tambah kategori',
        open: !!edit,
        children: edit ? `<div class="space-y-4">
          ${Field({
            label: 'Nama kategori', req: true, id: 'kn', error: state.err,
            children: `<input id="kn" class="inp" value="${esc(edit.nama)}" data-model="kn" data-input="nama" aria-invalid="${state.err ? 'true' : 'false'}" />`,
          })}
          ${Field({
            label: 'Keterangan untuk warga', id: 'kd', help: 'Tampil sebagai petunjuk di form lapor.',
            children: `<input id="kd" class="inp" value="${esc(edit.deskripsi)}" data-model="kd" data-input="deskripsi" />`,
          })}
          <label class="flex items-center gap-2 text-sm" data-no-row>${Toggle({ on: edit.aktif, label: 'Aktif', name: 'edit-aktif' })}Tampilkan di form warga</label>
        </div>` : '',
        footer: `${Btn('Batal', { attrs: 'data-act="edit-cancel"' })}${Btn('Simpan perubahan', { v: 'primary', attrs: 'data-act="edit-save"' })}`,
      })}
      ${Modal({
        id: 'modal-kategori-delete',
        title: 'Hapus kategori',
        open: !!del,
        children: del ? (used(del) > 0
          ? Alert({ tone: 'warn', title: `Kategori dipakai ${used(del)} laporan`, children: 'Kategori yang sudah dipakai tidak dapat dihapus. Nonaktifkan agar tidak muncul di form warga.' })
          : `<p class="text-sm text-ink2">Hapus kategori <strong class="text-ink font-medium">${esc(del.nama)}</strong>? Belum ada laporan yang memakai kategori ini.</p>`) : '',
        footer: `${Btn('Batal', { attrs: 'data-act="del-cancel"' })}${del && used(del) === 0 ? Btn('Hapus', { v: 'danger', attrs: 'data-act="del-confirm"' }) : ''}`,
      })}
    </div>`;
  };

  const bindTable = () => mountTable(pageRootRef, tableId, {
    rows: getDB().categories, cols: [], state: state.table, rowKey: (c) => c.id,
  }, (next) => { state.table = next; redraw(); });

  redraw = (focusKey) => {
    if (!pageRootRef) return;
    paint(pageRootRef, render(), focusKey);
    bindTable();
  };

  async function save() {
    if (!state.edit) return;
    const d = getDB();
    const c = { ...state.edit, nama: state.edit.nama.trim(), id: state.edit.id || `c${Date.now()}` };
    if (c.nama.trim().length < 3) { state.err = 'Nama kategori minimal 3 karakter.'; redraw(); return; }
    if (d.categories.some((x) => x.nama.toLowerCase() === c.nama.trim().toLowerCase() && x.id !== c.id)) {
      state.err = 'Kategori dengan nama ini sudah ada.';
      redraw();
      return;
    }
    const isNew = !state.edit.id;
    try {
      if (isNew) await createKategori(c);
      else await updateKategori(c.id, c);
      toast('Kategori disimpan.');
      state.edit = null;
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  }

  async function toggle(c, v) {
    try {
      await updateKategori(c.id, { aktif: v });
      toast(`${c.nama} ${v ? 'diaktifkan' : 'dinonaktifkan'}.`);
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  }

  return {
    title: 'Kelola Kategori Bencana',
    html: render(),
    mount(pageRoot) {
      pageRootRef = pageRoot;
      bindTable();
      const cleanup = delegate(pageRoot, {
        click: async (event) => {
          if (closeModalFrom(pageRoot, event, (id) => {
            if (id === 'modal-kategori-edit') state.edit = null;
            if (id === 'modal-kategori-delete') state.del = null;
            redraw();
          })) return;
          const inModal = Boolean(event.target.closest('[data-modal]'));
          const editToggle = event.target.closest('[data-toggle="edit-aktif"]');
          if (editToggle && state.edit) {
            state.edit = { ...state.edit, aktif: editToggle.getAttribute('aria-checked') !== 'true' };
            redraw();
            return;
          }
          const actEl = event.target.closest('[data-act]');
          if (actEl && pageRoot.contains(actEl)) {
            const id = actEl.dataset.id;
            switch (actEl.dataset.act) {
              case 'edit-new': state.err = ''; state.edit = { id: '', nama: '', aktif: true, deskripsi: '' }; redraw(); return;
              case 'edit': state.err = ''; state.edit = { ...getDB().categories.find((c) => c.id === id) }; redraw(); return;
              case 'edit-cancel': state.edit = null; redraw(); return;
              case 'edit-save': await save(); return;
              case 'delete': state.del = getDB().categories.find((c) => c.id === id) || null; redraw(); return;
              case 'del-cancel': state.del = null; redraw(); return;
              case 'del-confirm': {
                const del = state.del;
                if (!del) return;
                try {
                  await deleteKategori(del.id);
                  toast('Kategori dihapus.');
                  state.del = null;
                  redraw();
                } catch (error) { toast(error.message, 'error'); }
                return;
              }
              default: break;
            }
          }
          const toggleEl = event.target.closest('[data-toggle]');
          if (toggleEl && !inModal && pageRoot.contains(toggleEl)) {
            const c = getDB().categories.find((x) => x.id === toggleEl.dataset.toggle);
            if (c) await toggle(c, toggleEl.getAttribute('aria-checked') !== 'true');
          }
        },
        input: (event) => {
          const t = event.target;
          if (!t.matches?.('[data-input]') || !state.edit || !pageRoot.contains(t)) return;
          state.edit[t.dataset.input] = t.value;
          if (t.dataset.input === 'nama') state.err = '';
          redraw(t.dataset.model);
        },
      });
      ensureData(redraw);
      return cleanup;
    },
  };
}

export { kategori as Kategori };

/* ------------------------------------------------------------------ */
/* Historis                                                            */
/* ------------------------------------------------------------------ */

export function historis(ctx = {}) {
  const tableId = 'historis-table';
  const wizardId = 'wizard-import-historis';
  wizards.delete(wizardId);
  const state = {
    f: { jenis: '', kab: '', tanggal: '', meninggal: '0', mengungsi: '0', rumahRusak: '0', sumber: 'BPBD' },
    err: {}, imp: false, table: {},
  };
  let pageRootRef = null;
  let redraw = () => {};

  const render = () => {
    const d = getDB();
    const f = state.f;
    const e = state.err;
    setupWizard(wizardId, 'historis', { onDone: () => { state.imp = false; redraw(); } });
    return `<div>
      ${PageHead({
        title: 'Data Bencana Historis',
        desc: 'Kejadian sebelum APPB berjalan, terpisah dari laporan aktif.',
        actions: Btn(`${icon('file-spreadsheet')}Import Data Historis`, { attrs: 'data-act="import-open"' }),
      })}
      <div class="grid xl:grid-cols-[340px_1fr] gap-5 items-start">
        ${Card({
          title: 'Input manual',
          children: `<div class="space-y-3">
            ${Field({
              label: 'Jenis', req: true, id: 'hj', error: e.jenis,
              children: `<select id="hj" class="inp" data-model="hj" data-input="jenis" aria-invalid="${e.jenis ? 'true' : 'false'}">${options(d.categories.map((c) => c.nama), f.jenis, 'Pilih jenis')}</select>`,
            })}
            ${Field({
              label: 'Wilayah', req: true, id: 'hk', error: e.kab,
              children: `<select id="hk" class="inp" data-model="hk" data-input="kab" aria-invalid="${e.kab ? 'true' : 'false'}">${options(KABS, f.kab, 'Pilih kabupaten/kota')}</select>`,
            })}
            ${Field({
              label: 'Tanggal kejadian', req: true, id: 'ht', error: e.tanggal,
              children: `<input id="ht" type="date" class="inp" value="${esc(f.tanggal)}" data-model="ht" data-input="tanggal" aria-invalid="${e.tanggal ? 'true' : 'false'}" />`,
            })}
            <p class="lbl !mb-0">Dampak</p>
            <div class="grid grid-cols-3 gap-2">${[['meninggal', 'Meninggal'], ['mengungsi', 'Mengungsi'], ['rumahRusak', 'Rumah rusak']].map(([k, l]) => Field({
              label: l, id: `h${k}`,
              children: `<input id="h${k}" inputmode="numeric" class="inp" value="${esc(f[k])}" data-model="h${k}" data-input="${k}" />`,
            })).join('')}</div>
            ${Field({ label: 'Sumber data', id: 'hs', children: `<input id="hs" class="inp" value="${esc(f.sumber)}" data-model="hs" data-input="sumber" />` })}
            ${Btn('Simpan', { v: 'primary', cls: 'w-full', attrs: 'data-act="save"' })}
          </div>`,
        })}
        ${DataTable(d.historis, [
          { key: 'b', header: '', render: () => HistBadge() },
          { key: 'j', header: 'Jenis', render: (h) => esc(h.jenis), sort: (h) => h.jenis },
          { key: 'k', header: 'Wilayah', render: (h) => `<p>${esc(h.kab)}</p><p class="cap">${esc(h.prov)}</p>`, sort: (h) => h.kab },
          { key: 't', header: 'Tanggal', render: (h) => `<span class="whitespace-nowrap">${esc(fmtDate(h.tanggal))}</span>`, sort: (h) => h.tanggal },
          { key: 'm', header: 'Meninggal', render: (h) => Number(h.meninggal || 0).toLocaleString('id-ID'), sort: (h) => h.meninggal, className: 'text-right' },
          { key: 'u', header: 'Mengungsi', render: (h) => Number(h.mengungsi || 0).toLocaleString('id-ID'), sort: (h) => h.mengungsi, className: 'text-right' },
          { key: 'r', header: 'Rumah rusak', render: (h) => Number(h.rumahRusak || 0).toLocaleString('id-ID'), sort: (h) => h.rumahRusak, className: 'text-right' },
          { key: 's', header: 'Sumber', render: (h) => `<span class="cap">${esc(h.sumber)}</span>` },
        ], { id: tableId, state: state.table, rowKey: (h) => h.id, initialSort: ['t', 'desc'] })}
      </div>
      ${Modal({
        id: 'modal-historis-import', title: 'Import Data Historis', open: state.imp, wide: true,
        children: wizardHTML(wizardId),
      })}
    </div>`;
  };

  const bindTable = () => mountTable(pageRootRef, tableId, {
    rows: getDB().historis, cols: [], state: state.table, rowKey: (h) => h.id,
  }, (next) => { state.table = next; redraw(); });

  redraw = (focusKey) => {
    if (!pageRootRef) return;
    paint(pageRootRef, render(), focusKey);
    bindTable();
  };

  async function save() {
    const f = state.f;
    const e = {};
    if (!f.jenis) e.jenis = 'Pilih jenis bencana.';
    if (!f.kab) e.kab = 'Pilih wilayah.';
    if (!f.tanggal) e.tanggal = 'Isi tanggal kejadian.';
    else if (new Date(f.tanggal) > new Date()) e.tanggal = 'Tanggal tidak boleh di masa depan.';
    state.err = e;
    if (Object.keys(e).length) { redraw(); return; }
    const h = {
      id: String(Date.now()), jenis: f.jenis, kab: f.kab, prov: provOf(f.kab), tanggal: f.tanggal,
      meninggal: +f.meninggal || 0, mengungsi: +f.mengungsi || 0, rumahRusak: +f.rumahRusak || 0,
      sumber: f.sumber,
    };
    try {
      await createHistoris(h);
      toast('Data historis ditambahkan.');
      state.f = { ...f, tanggal: '', meninggal: '0', mengungsi: '0', rumahRusak: '0' };
      state.err = {};
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  }

  return {
    title: 'Data Bencana Historis',
    html: render(),
    mount(pageRoot) {
      pageRootRef = pageRoot;
      bindTable();
      const cleanupDnD = bindWizardDnD(pageRoot, redraw);
      const cleanup = delegate(pageRoot, {
        click: async (event) => {
          if (await wizardClick(pageRoot, event, redraw)) return;
          if (closeModalFrom(pageRoot, event, (id) => {
            if (id === 'modal-historis-import') state.imp = false;
            redraw();
          })) return;
          const act = event.target.closest('[data-act]')?.dataset.act;
          if (act === 'import-open') { state.imp = true; redraw(); }
          if (act === 'save') await save();
        },
        input: (event) => {
          const t = event.target;
          if (wizardInput(pageRoot, event, redraw)) return;
          if (!t.matches?.('[data-input]') || !pageRoot.contains(t)) return;
          const key = t.dataset.input;
          let value = t.value;
          if (['meninggal', 'mengungsi', 'rumahRusak'].includes(key)) value = value.replace(/\D/g, '');
          state.f[key] = value;
          redraw(t.dataset.model);
        },
        change: (event) => { wizardInput(pageRoot, event, redraw); },
      });
      ensureData(redraw);
      return () => { cleanupDnD(); cleanup(); };
    },
  };
}

export { historis as Historis };

/* ------------------------------------------------------------------ */
/* Koreksi                                                             */
/* ------------------------------------------------------------------ */

const koreksiState = { code: null, q: '', f: null, err: '' };

export function koreksi(ctx = {}) {
  let pageRootRef = null;
  let qTimer = null;
  let activeCtx = ctx;

  const hydrate = (code, reports = getDB().reports) => {
    koreksiState.code = code;
    const r = reports.find((x) => x.code === code);
    koreksiState.f = r ? {
      status: r.penanganan,
      korban: { ...r.korban },
      ringkasan: r.ringkasan || '',
      alasan: '',
    } : null;
    koreksiState.err = '';
  };

  const initialCode = activeCtx.query?.get?.('code') || '';
  const initialQRaw = activeCtx.query?.get?.('q') ?? null;
  if (koreksiState.code !== initialCode) hydrate(initialCode);
  koreksiState.q = initialQRaw || '';
  let lastQueryCode = initialCode;
  let lastQueryQ = initialQRaw;

  const render = () => {
    const d = getDB();
    const reports = d.reports;
    const queryCode = activeCtx.query?.get?.('code') || '';
    const queryQ = activeCtx.query?.get?.('q') ?? null;
    if (queryCode !== lastQueryCode) {
      lastQueryCode = queryCode;
      if (koreksiState.code !== queryCode) hydrate(queryCode, reports);
    }
    if (queryQ !== lastQueryQ) {
      lastQueryQ = queryQ;
      koreksiState.q = queryQ || '';
    }
    if (queryCode && !koreksiState.f && reports.some((x) => x.code === queryCode)) hydrate(queryCode, reports);
    const q = koreksiState.q;
    const closed = reports.filter((r) => r.penanganan === 'Case Closed');
    const list = closed.filter((r) => !q || `${r.code} ${r.kel} ${r.kab} ${r.jenis}`.toLowerCase().includes(q.toLowerCase()));
    const sel = reports.find((r) => r.code === queryCode);
    const f = koreksiState.f;

    return `<div>
      ${PageHead({ title: 'Koreksi Laporan Case Closed', desc: 'Hanya Admin yang dapat mengubah laporan yang sudah ditutup.' })}
      <div class="grid xl:grid-cols-[360px_1fr] gap-5 items-start">
        ${Card({
          title: `Laporan ditutup (${closed.length})`, pad: false,
          children: `<div class="p-3 border-b border-line relative">${icon('search', 'absolute left-5.5 top-1/2 -translate-y-1/2 text-mute')}<input aria-label="Cari laporan ditutup" class="inp pl-8" placeholder="Kode, kelurahan, jenis" value="${esc(q)}" data-model="kr-q" data-input="q" /></div>
            ${list.length === 0 ? Empty('Tidak ada laporan Case Closed yang cocok.')
              : `<ul>${list.map((r) => `<li><button type="button" data-act="pick" data-code="${esc(r.code)}" class="w-full text-left px-4 py-3 border-b border-line last:border-0 hover:bg-app ${sel?.id === r.id ? 'bg-info-t' : ''}">
                <p class="text-sm font-medium flex items-center gap-2">${esc(r.code)}${icon('lock', '!w-3.5 !h-3.5 text-mute')}</p>
                <p class="text-[13px] text-ink2">${esc(r.jenis)} · Kel. ${esc(r.kel)}</p>
                <p class="cap">Ditutup ${r.closedAt ? esc(fmt(r.closedAt)) : ''} · ${esc(r.closedBy || '')}</p>
              </button></li>`).join('')}</ul>`}`,
        })}
        ${!sel || !f ? `<div class="card">${Empty('Pilih laporan di kiri untuk dikoreksi.')}</div>` : Card({
          title: `<span class="inline-flex items-center gap-2.5">${esc(sel.code)}${RStatus(sel)}</span>`,
          children: `<div class="space-y-4">
            ${Alert({ tone: 'warn', iconName: 'triangle-alert', title: 'Perubahan akan tercatat di log audit.', children: 'Setiap koreksi menyimpan nilai lama, nilai baru, alasan, dan nama admin.' })}
            ${DL([
              ['Jenis', esc(sel.jenis)],
              ['Lokasi', `Kel. ${esc(sel.kel)}, ${esc(sel.kab)}`],
              ['Ditutup oleh', esc(sel.closedBy || '—')],
              ['Waktu tutup', sel.closedAt ? esc(fmt(sel.closedAt)) : '—'],
            ])}
            <div><p class="lbl">Jumlah korban</p><div class="grid sm:grid-cols-2 gap-3">${KL.map(([k, l]) => `<div class="flex items-center justify-between gap-3">
              <span class="text-sm">${esc(l)} <span class="cap">(semula ${esc(sel.korban[k])})</span></span>
              ${Stepper({ value: f.korban[k], label: l, name: k }).replace(`data-step-input="${k}"`, `data-step-input="${k}" data-model="korban-${k}" data-input="${k}"`)}
            </div>`).join('')}</div></div>
            ${Field({
              label: 'Ringkasan', id: 'kr',
              children: `<textarea id="kr" rows="4" class="inp" data-model="kr" data-input="ringkasan">${esc(f.ringkasan)}</textarea>`,
            })}
            ${Field({
              label: 'Alasan koreksi', req: true, id: 'ka', error: koreksiState.err,
              help: 'Contoh: data korban hilang direvisi setelah konfirmasi Basarnas tanggal 30 Sep 2026.',
              children: `<textarea id="ka" rows="3" class="inp" data-model="ka" data-input="alasan" aria-invalid="${koreksiState.err ? 'true' : 'false'}">${esc(f.alasan)}</textarea>`,
            })}
            <div class="flex justify-end gap-2 border-t border-line pt-4">
              ${Btn('Atur ulang', { attrs: 'data-act="reset"' })}
              ${Btn('Simpan koreksi', { v: 'primary', attrs: 'data-act="save"' })}
            </div>
          </div>`,
        })}
      </div>
    </div>`;
  };

  const redraw = (focusKey) => {
    if (!pageRootRef) return;
    paint(pageRootRef, render(), focusKey);
  };

  function pick(code) {
    const r = getDB().reports.find((x) => x.code === code);
    if (!r) return;
    koreksiState.code = code;
    koreksiState.f = { status: r.penanganan, korban: { ...r.korban }, ringkasan: r.ringkasan || '', alasan: '' };
    koreksiState.err = '';
    const q = koreksiState.q || null;
    if (activeCtx.setQueryAll) activeCtx.setQueryAll({ code, q });
    else if (activeCtx.setQuery) activeCtx.setQuery('code', code);
    else redraw();
  }

  async function save(sel) {
    const f = koreksiState.f;
    if (!sel || !f) return;
    if (f.alasan.trim().length < 15) {
      koreksiState.err = f.alasan.trim()
        ? `Alasan koreksi minimal 15 karakter (sekarang ${f.alasan.trim().length}).`
        : 'Alasan koreksi wajib diisi.';
      redraw();
      return;
    }
    const diff = [];
    if (f.status !== sel.penanganan) diff.push(`Status ${sel.penanganan} > ${f.status}`);
    KL.forEach(([k, l]) => f.korban[k] !== sel.korban[k] && diff.push(`${l} ${sel.korban[k]} > ${f.korban[k]}`));
    if (f.ringkasan !== sel.ringkasan) diff.push('Ringkasan diubah');
    if (!diff.length) {
      koreksiState.err = 'Tidak ada perubahan data untuk dikoreksi.';
      redraw();
      return;
    }
    try {
      await koreksiLaporan(sel.code, {
        status: f.status, korban: f.korban,
        ringkasan: f.ringkasan, alasan: f.alasan.trim(),
      });
      toast(`Koreksi ${sel.code} disimpan dan tercatat di log audit.`);
      koreksiState.err = '';
      f.alasan = '';
      redraw();
    } catch (error) { toast(error.message, 'error'); }
  }

  return {
    title: 'Koreksi Laporan Case Closed',
    html: render(),
    mount(pageRoot, ctx2 = {}) {
      pageRootRef = pageRoot;
      activeCtx = ctx2.query ? ctx2 : activeCtx;
      const cleanup = delegate(pageRoot, {
        click: async (event) => {
          const stepBtn = event.target.closest('[data-step]');
          const stepper = stepBtn?.closest('[data-stepper]');
          if (stepBtn && stepper && koreksiState.f) {
            const k = stepper.dataset.stepper;
            const next = Math.max(0, Number(koreksiState.f.korban[k] || 0) + Number(stepBtn.dataset.step));
            koreksiState.f.korban[k] = next;
            redraw(`korban-${k}`);
            return;
          }
          const actEl = event.target.closest('[data-act]');
          if (!actEl || !pageRoot.contains(actEl)) return;
          const sel = getDB().reports.find((r) => r.code === (activeCtx.query?.get?.('code') || koreksiState.code));
          if (actEl.dataset.act === 'pick') pick(actEl.dataset.code);
          if (actEl.dataset.act === 'reset' && sel) pick(sel.code);
          if (actEl.dataset.act === 'save') await save(sel);
        },
        input: (event) => {
          const t = event.target;
          if (!pageRoot.contains(t)) return;
          const field = t.dataset.input;
          if (field === 'q') {
            koreksiState.q = t.value;
            redraw(t.dataset.model);
            clearTimeout(qTimer);
            qTimer = setTimeout(() => {
              if (activeCtx.setQuery) activeCtx.setQuery('q', t.value || null);
            }, 200);
            return;
          }
          if (!koreksiState.f || !field) return;
          if (['luka', 'hilang', 'meninggal', 'mengungsi'].includes(field)) {
            koreksiState.f.korban[field] = Math.max(0, parseInt(String(t.value).replace(/\D/g, ''), 10) || 0);
          } else {
            koreksiState.f[field] = t.value;
            if (field === 'alasan') koreksiState.err = '';
          }
          redraw(t.dataset.model);
        },
      });
      ensureData(redraw);
      return () => { clearTimeout(qTimer); cleanup(); };
    },
  };
}

export { koreksi as Koreksi };
