import { getDB } from '../store.js';
import {
  esc, paint, Btn, Badge, StatusBadge, SevBadge, HistBadge, Field, Toggle, Segmented,
  Stepper, Steps, Alert, Empty, Skel, Modal, Card, KPI, DataTable, mountTable,
  OfflineBanner, toast,
} from '../ui.js';

const COLORS = [
  ['ink', '#0F172A'], ['ink2', '#475569'], ['mute', '#94A3B8'], ['line', '#E2E8F0'],
  ['app', '#F8FAFC'], ['navy', '#1E3A8A'], ['navyh', '#1E40AF'], ['crit', '#B91C1C'],
  ['crit-t', '#FEF2F2'], ['warn', '#B45309'], ['warn-t', '#FFFBEB'], ['ok', '#15803D'],
  ['ok-t', '#F0FDF4'], ['info', '#1D4ED8'], ['info-t', '#EFF6FF'],
];

const Sec = (t, children) => `<section class="py-8 border-t border-line grid lg:grid-cols-[200px_1fr] gap-4">
  <h2 class="text-sm font-semibold">${esc(t)}</h2><div class="min-w-0">${children}</div>
</section>`;

export function design(ctx = {}) {
  let modal = false;
  let seg = 'Sedang';
  let on = true;
  let n = 3;
  let tableState = {};

  const render = () => {
    const reports = getDB().reports;
    return `<div>
      <p class="cap">Sistem desain</p>
      <h1 class="h1">Komponen & status APPB</h1>
      <p class="text-ink2 mt-1 mb-6">Token, komponen, dan state yang dipakai seluruh layar.</p>
      ${Sec('Warna', `<div class="grid grid-cols-3 sm:grid-cols-5 gap-3">${COLORS.map(([k, v]) => `<div><div class="h-10 rounded-md border border-line" style="background:${v}"></div><p class="text-[13px] font-medium mt-1">${esc(k)}</p><p class="cap">${esc(v)}</p></div>`).join('')}</div>`)}
      ${Sec('Tipografi', `<div class="space-y-2"><p class="text-[30px] font-semibold leading-tight">H1 30 / 600</p><p class="text-2xl font-semibold">H2 24 / 600</p><p class="text-xl font-semibold">H3 20 / 600</p><p class="text-base">Body-lg 16 / 400</p><p class="text-sm">Body 14 / 400 — angka tabular 1.234.567</p><p class="text-xs text-ink2">Caption 12 / 400</p></div>`)}
      ${Sec('Badge', `<div class="flex flex-wrap gap-2 mb-3">${['Tertunda', 'Resmi', 'Ditolak', 'Belum Ditangani', 'Sedang Ditangani', 'Selesai Ditangani', 'Tidak Perlu Tindak Lanjut', 'Case Closed'].map((s) => StatusBadge(s)).join('')}</div>
        <div class="flex flex-wrap gap-2">${['Peringatan', 'Imbauan', 'Evakuasi', 'Informasi'].map((s) => SevBadge(s)).join('')}${HistBadge()}${Badge('amber', 'Dugaan duplikat')}</div>`)}
      ${Sec('Tombol', `<div class="flex flex-wrap gap-2 items-center">${Btn('Primer', { v: 'primary', attrs: 'data-design-btn' })}${Btn('Sekunder', { attrs: 'data-design-btn' })}${Btn('Ghost', { v: 'ghost', attrs: 'data-design-btn' })}${Btn('Hapus', { v: 'danger', attrs: 'data-design-btn' })}${Btn('Nonaktif', { v: 'primary', attrs: 'disabled' })}${Btn('Kecil', { sm: true, attrs: 'data-design-btn' })}</div>`)}
      ${Sec('Form', `<div class="grid sm:grid-cols-3 gap-4 max-w-3xl">
        ${Field({ label: 'Default', id: 'd1', help: 'Teks bantuan singkat.', children: '<input id="d1" class="inp" placeholder="Nama kelurahan" />' })}
        ${Field({ label: 'Error', req: true, id: 'd2', error: 'Nomor HP harus diawali 0 dan berisi 10–13 angka.', children: '<input id="d2" class="inp" aria-invalid="true" value="8123" />' })}
        ${Field({ label: 'Nonaktif', id: 'd3', children: '<input id="d3" class="inp" disabled value="APPB-2026-00123" />' })}
      </div>
      <div class="flex flex-wrap gap-6 items-center mt-4">${Segmented({ label: 'Skala', name: 'seg', value: seg, options: ['Kecil', 'Sedang', 'Besar'] })}${Toggle({ on, label: 'Aktif', name: 'on' })}${Stepper({ label: 'Korban', value: n, name: 'n' })}</div>
      <div class="mt-4 max-w-xl">${Steps({ steps: ['Unggah', 'Validasi', 'Hasil', 'Konfirmasi'], current: 1 })}</div>`)}
      ${Sec('Tabel', DataTable(reports.slice(0, 12), [
        { key: 'c', header: 'Kode', render: (r) => `<span class="font-medium">${esc(r.code)}</span>`, sort: (r) => r.code },
        { key: 'j', header: 'Jenis', render: (r) => esc(r.jenis), sort: (r) => r.jenis },
        { key: 'k', header: 'Kelurahan', render: (r) => esc(r.kel), sort: (r) => r.kel },
        { key: 's', header: 'Status', render: (r) => StatusBadge(r.verif) },
      ], { id: 'design-table', rowKey: (r) => r.id, selectable: true }))}
      ${Sec('Overlay', `<div class="flex flex-wrap gap-2">${Btn('Buka modal', { attrs: 'data-design-modal' })}${Btn('Tampilkan toast', { attrs: 'data-design-toast' })}</div>
        ${Modal({ id: 'design-modal', title: 'Tolak laporan', open: modal, children: '<p class="text-sm text-ink2">Contoh modal konfirmasi.</p>', footer: `${Btn('Batal', { attrs: 'data-design-modal-close' })}${Btn('Tolak', { v: 'danger', attrs: 'data-design-modal-close' })}` })}`)}
      ${Sec('State', `<div class="grid md:grid-cols-2 gap-4">
        ${Card({ title: 'Loading', children: Skel(3, 3) })}
        ${Card({ title: 'Kosong', children: Empty('Belum ada laporan tertunda.', Btn('Muat ulang', { sm: true })) })}
        ${Alert({ tone: 'crit', title: 'Gagal memuat data', children: 'Server tidak merespons. Coba lagi dalam beberapa saat.' })}
        ${Alert({ tone: 'ok', title: 'Tersimpan', children: 'Perubahan disimpan pukul 14.32 WIB.' })}
        ${KPI({ label: 'Menunggu verifikasi', value: 6, sub: '2 dugaan duplikat' })}
      </div>
      <div class="mt-4 border border-line rounded-md overflow-hidden">${OfflineBanner()}</div>`)}
    </div>`;
  };

  return {
    title: 'Komponen & status APPB',
    html: render(),
    mount(root, ctxPage, drawRender = render) {
      const draw = () => paint(root, drawRender());
      const cols = [
        { key: 'c', header: 'Kode', render: (r) => `<span class="font-medium">${esc(r.code)}</span>`, sort: (r) => r.code },
        { key: 'j', header: 'Jenis', render: (r) => esc(r.jenis), sort: (r) => r.jenis },
        { key: 'k', header: 'Kelurahan', render: (r) => esc(r.kel), sort: (r) => r.kel },
        { key: 's', header: 'Status', render: (r) => StatusBadge(r.verif) },
      ];
      mountTable(root, 'design-table', {
        rows: getDB().reports.slice(0, 12), cols, rowKey: (r) => r.id, selectable: true,
      }, tableState, draw);
      const onClick = (event) => {
        if (event.target.closest('[data-design-modal]')) { modal = true; draw(); return; }
        if (event.target.closest('[data-design-modal-close]')) { modal = false; draw(); return; }
        if (event.target.closest('[data-design-toast]')) { toast('Laporan APPB-2026-00123 diverifikasi.'); return; }
        const segBtn = event.target.closest('[data-segment]');
        if (segBtn) { seg = segBtn.dataset.value; draw(); return; }
        const toggleBtn = event.target.closest('[data-toggle]');
        if (toggleBtn) { on = !on; draw(); return; }
        const stepBtn = event.target.closest('[data-step]');
        if (stepBtn) { n = Math.max(0, n + Number(stepBtn.dataset.step)); draw(); }
      };
      root.addEventListener('click', onClick);
      return () => root.removeEventListener('click', onClick);
    },
  };
}

export default design;
