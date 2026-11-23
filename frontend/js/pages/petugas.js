import { api } from '../api.js';
import {
  getDB, me, byCode, isActive, dupOf, statusOf, session, reloadDB,
  verifikasi as verifikasiLaporan, patchPenanganan, patchKorban, patchCatatan, tutupLaporan, createAnnouncement,
} from '../store.js';
import { WILAYAH } from '../wilayah.js';
import {
  esc, icon, paint, refreshIcons, link, Btn, LinkBtn, Badge, StatusBadge, RStatus, SevBadge,
  HistBadge, Field, Card, KPI, DL, Alert, Empty, Thumbs, Timeline, Modal, Drawer, MapPH,
  Sel, Chips, MD, Segmented, Stepper, Steps, PageHead, DataTable, mountTable, Skel,
  toast, downloadCSV, confirmAction, openOverlay, closeOverlay, fmt, rel,
} from '../ui.js';

const LOAD_MS = 500;
const base = (admin) => (admin ? '/admin' : '/petugas');
const operationalBase = () => (session.role() === 'relawan' ? '/relawan' : '/petugas');

async function run(fn) {
  try {
    await fn();
  } catch (error) {
    toast(error?.message || 'Aksi gagal. Silakan coba lagi.', 'error');
  }
}

function wireOverlayClose(root, handlers = {}) {
  root.addEventListener('click', (event) => {
    const closer = event.target.closest('[data-modal-close]');
    if (!closer) return;
    const box = closer.closest('[data-modal], [data-drawer]');
    if (!box || !handlers[box.id]) return;
    event.preventDefault();
    handlers[box.id]();
  });
}

function mountDataTable(root, id, opts, state, draw) {
  if (!state.sort && opts.initialSort) state.sort = opts.initialSort;
  if (!state.size) state.size = 10;
  mountTable(root, id, { ...opts, state }, () => draw());
}

function page(title, render, mount = () => {}) {
  return { title, html: render(), mount(root, ctx) { return mount(root, ctx, render); } };
}

/* ---------------- Dashboard ---------------- */
export function dashboard(ctx = {}) {
  let loading = true;
  let tableState = {};

  const render = () => {
    const d = getDB();
    const reports = d.reports;
    const user = me(d);
    const logs = d.logs;
    const areaBase = operationalBase();
    const isRelawan = areaBase === '/relawan';
    const resmi = reports.filter((r) => r.verif === 'Resmi');
    const queue = resmi.filter(isActive).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    const today = new Date().toDateString();
    const selesaiHariIni = logs.filter((l) => /Selesai Ditangani|Case Closed/.test(l.detail) && new Date(l.at).toDateString() === today).length;
    const korban = resmi.filter(isActive).reduce((s, r) => s + r.korban.luka + r.korban.hilang + r.korban.meninggal, 0);
    const mengungsi = resmi.filter(isActive).reduce((s, r) => s + r.korban.mengungsi, 0);
    const cols = [
      { key: 'code', header: 'Kode', render: (r) => `<span class="font-medium text-navy">${esc(r.code)}</span>`, sort: (r) => r.code },
      { key: 'jenis', header: 'Jenis', render: (r) => esc(r.jenis), sort: (r) => r.jenis },
      { key: 'lok', header: 'Lokasi', render: (r) => `<span class="text-ink2">Kel. ${esc(r.kel)}, ${esc(r.kab)}</span>` },
      { key: 'st', header: 'Status', render: (r) => RStatus(r), sort: (r) => statusOf(r) },
      { key: 'kb', header: 'Korban', render: (r) => `<span>${r.korban.luka + r.korban.hilang + r.korban.meninggal} <span class="text-mute">/ ${r.korban.mengungsi.toLocaleString('id-ID')} ungsi</span></span>`, sort: (r) => r.korban.luka + r.korban.meninggal, className: 'whitespace-nowrap' },
      { key: 'umur', header: 'Masuk', render: (r) => `<span class="text-ink2 whitespace-nowrap">${esc(rel(r.createdAt))}</span>`, sort: (r) => r.createdAt },
    ];

    return `
      <div>
        ${PageHead({
          title: isRelawan ? 'Dashboard Relawan' : 'Dashboard Petugas',
          desc: `Shift ${esc(user?.wilayah)} · ${esc(user?.instansi)}`,
          actions: isRelawan ? '' : LinkBtn('/petugas/verifikasi', `${icon('shield-check')}Buka antrean verifikasi`, { v: 'primary' }),
        })}
        <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          ${isRelawan
            ? KPI({ label: 'Laporan aktif', value: queue.length, sub: 'Laporan resmi yang perlu penanganan' })
            : KPI({
                label: 'Menunggu verifikasi',
                value: reports.filter((r) => r.verif === 'Tertunda').length,
                sub: `${reports.filter((r) => r.verif === 'Tertunda' && Date.now() - +new Date(r.createdAt) > 3600000).length} lebih dari 1 jam`,
                tone: 'warn',
              })}
          ${KPI({ label: 'Sedang ditangani', value: resmi.filter((r) => r.penanganan === 'Sedang Ditangani').length, sub: `${resmi.filter((r) => r.penanganan === 'Belum Ditangani').length} belum ditangani` })}
          ${KPI({ label: 'Selesai hari ini', value: selesaiHariIni, sub: 'Selesai Ditangani + Case Closed', tone: 'ok' })}
          ${KPI({ label: 'Total korban (aktif)', value: korban, sub: `${mengungsi.toLocaleString('id-ID')} mengungsi`, tone: 'crit' })}
        </div>
        <div class="grid xl:grid-cols-[1fr_380px] gap-5 items-start">
          <div>
            <h2 class="text-sm font-semibold mb-2">Antrean laporan aktif <span class="cap font-normal">· laporan terlama ditampilkan lebih dulu</span></h2>
            ${DataTable(queue, cols, { id: 'petugas-dashboard', rowKey: (r) => r.id, loading, onRow: true })}
          </div>
          <div class="space-y-4">
            ${Card({ title: 'Peta laporan aktif', children: MapPH(queue, 220, true) })}
            ${Card({
              title: 'Aktivitas terbaru',
              pad: false,
              actions: link(`${areaBase}/log`, 'Log', 'text-[13px] link'),
              children: `<ul>${logs.slice(0, 5).map((l) => `<li class="px-4 py-2.5 border-b border-line last:border-0 text-[13px]"><p><span class="font-medium">${esc(l.actor)}</span> · ${esc(l.aksi)}${l.code ? `<span class="text-ink2"> · ${esc(l.code)}</span>` : ''}</p><p class="cap">${esc(rel(l.at))}</p></li>`).join('')}</ul>`,
            })}
          </div>
        </div>
      </div>`;
  };

  return page('Dashboard Petugas', render, (root, ctxPage, drawRender) => {
    const draw = () => paint(root, drawRender());
    const timer = setTimeout(() => { loading = false; draw(); }, LOAD_MS);
    const onRow = (r) => ctxPage.navigate(`${operationalBase()}/penanganan/${r.code}`);
    const attach = () => {
      mountDataTable(root, 'petugas-dashboard', {
        rows: getDB().reports.filter((r) => r.verif === 'Resmi' && isActive(r)).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
        cols: [
          { key: 'code', header: 'Kode', render: (r) => `<span class="font-medium text-navy">${esc(r.code)}</span>`, sort: (r) => r.code },
          { key: 'jenis', header: 'Jenis', render: (r) => esc(r.jenis), sort: (r) => r.jenis },
          { key: 'lok', header: 'Lokasi', render: (r) => `<span class="text-ink2">Kel. ${esc(r.kel)}, ${esc(r.kab)}</span>` },
          { key: 'st', header: 'Status', render: (r) => RStatus(r), sort: (r) => statusOf(r) },
          { key: 'kb', header: 'Korban', render: (r) => `<span>${r.korban.luka + r.korban.hilang + r.korban.meninggal} <span class="text-mute">/ ${r.korban.mengungsi.toLocaleString('id-ID')} ungsi</span></span>`, sort: (r) => r.korban.luka + r.korban.meninggal, className: 'whitespace-nowrap' },
          { key: 'umur', header: 'Masuk', render: (r) => `<span class="text-ink2 whitespace-nowrap">${esc(rel(r.createdAt))}</span>`, sort: (r) => r.createdAt },
        ],
        rowKey: (r) => r.id,
        loading,
        onRow,
      }, tableState, draw);
    };
    attach();
    const onClick = (event) => {
      const pin = event.target.closest('[data-pin]');
      if (pin) ctxPage.navigate(`${operationalBase()}/penanganan/${pin.dataset.pin}`);
    };
    root.addEventListener('click', onClick);
    return () => { clearTimeout(timer); root.removeEventListener('click', onClick); };
  });
}

/* ---------------- Verifikasi ---------------- */
export function verifikasi(ctx = {}) {
  let loading = true;
  let open = null;
  let rej = null;
  let reason = '';
  let rErr = '';
  let onlyDup = false;
  let kab = '';
  let tableState = {};

  const render = () => {
    const d = getDB();
    const pending = d.reports.filter((r) => r.verif === 'Tertunda');
    const rows = pending.filter((r) => (!onlyDup || dupOf(d, r)) && (!kab || r.kab === kab));
    const cur = d.reports.find((r) => r.id === open);
    const cols = [
      { key: 'code', header: 'Tiket', render: (r) => `<span class="font-medium text-navy">${esc(r.code)}</span>`, sort: (r) => r.code },
      { key: 'jenis', header: 'Jenis', render: (r) => esc(r.jenis), sort: (r) => r.jenis },
      { key: 'kel', header: 'Kelurahan', render: (r) => `<p>Kel. ${esc(r.kel)}</p><p class="cap">${esc(r.kab)}</p>`, sort: (r) => r.kel },
      { key: 'at', header: 'Waktu masuk', render: (r) => `<p class="whitespace-nowrap">${esc(fmt(r.createdAt))}</p><p class="cap">${esc(rel(r.createdAt))}</p>`, sort: (r) => r.createdAt },
      { key: 'foto', header: 'Foto', render: (r) => r.foto, sort: (r) => r.foto },
      {
        key: 'flag', header: 'Tanda',
        render: (r) => {
          const other = dupOf(d, r);
          return other ? Badge('amber', `Dugaan duplikat · ${esc(other.code.slice(-5))}`, { iconName: 'copy' }) : '<span class="text-mute">—</span>';
        },
      },
    ];
    const dupe = cur && dupOf(d, cur);

    return `
      <div>
        ${PageHead({ title: 'Verifikasi Laporan', desc: 'Laporan warga berstatus Tertunda. Periksa lokasi dan foto sebelum dijadikan Resmi.' })}
        ${DataTable(rows, cols, {
          id: 'verifikasi',
          rowKey: (r) => r.id,
          loading,
          selectable: true,
          onRow: true,
          initialSort: ['at', 'asc'],
          toolbar: `
            ${Sel({ label: 'Kabupaten', value: kab, name: 'kab', placeholder: 'Semua kabupaten/kota', options: [...new Set(pending.map((r) => r.kab))] })}
            <label class="flex items-center gap-2 text-[13px] text-ink2"><input type="checkbox" class="accent-navy" ${onlyDup ? 'checked' : ''} data-model="onlyDup" />Hanya dugaan duplikat</label>`,
          bulk: (ids, clear) => `
            ${Btn(`${icon('shield-check')}Verifikasi`, { sm: true, v: 'primary', attrs: `data-bulk-verify ${ids.length ? '' : 'disabled'}` })}
            ${Btn('Tolak', { sm: true, attrs: `data-bulk-reject ${ids.length ? '' : 'disabled'}` })}
            <button type="button" data-clear-selection class="text-xs text-ink2 hover:text-ink underline underline-offset-2 ml-1">Hapus pilihan</button>
            <span class="hidden">${typeof clear === 'function' ? '' : ''}</span>`,
          empty: Empty('Tidak ada laporan yang menunggu verifikasi.', LinkBtn('/petugas/penanganan', 'Ke Penanganan')),
        })}
        ${Drawer({
          id: 'verifikasi-drawer',
          title: cur?.code || '',
          sub: cur ? `<div class="flex gap-2 mt-1">${StatusBadge('Tertunda')}<span class="cap">masuk ${esc(rel(cur.createdAt))}</span></div>` : '',
          open: !!cur,
          children: cur ? `
            <div class="space-y-5">
              ${dupe ? Alert({ tone: 'warn', title: 'Dugaan duplikat', children: `Sudah ada laporan ${esc(dupe.jenis)} aktif di Kel. ${esc(dupe.kel)}: ${link(`/petugas/penanganan/${dupe.code}`, esc(dupe.code), 'link')} (${esc(statusOf(dupe))}). Pertimbangkan tolak dan arahkan pelapor ke pembaruan susulan.` }) : ''}
              ${DL([
                ['Jenis', esc(cur.jenis)],
                ['Kelurahan', `Kel. ${esc(cur.kel)}, Kec. ${esc(cur.kec)}`],
                ['Kabupaten/Kota', `${esc(cur.kab)}, ${esc(cur.prov)}`],
                ['Waktu masuk', esc(fmt(cur.createdAt))],
                ['Pelapor', esc(cur.pelapor)],
                ['Nomor HP', esc(cur.hp || '—')],
              ])}
              <div><p class="cap">Alamat</p><p class="text-sm mt-0.5">${esc(cur.alamat)}</p></div>
              <div><p class="cap">Deskripsi</p><p class="text-sm mt-0.5">${esc(cur.deskripsi)}</p></div>
              <div><p class="cap mb-1.5">Foto (${cur.foto})</p>${Thumbs(cur.foto, 88)}</div>
            </div>` : '',
          footer: cur ? `
            ${Btn(`${icon('shield-check')}Verifikasi (Jadikan Resmi)`, { v: 'primary', attrs: 'data-drawer-verify' })}
            ${Btn('Tolak', { cls: '!text-crit', attrs: 'data-drawer-reject' })}` : '',
        })}
        ${Modal({
          id: 'verifikasi-reject',
          title: rej && rej.length > 1 ? `Tolak ${rej.length} laporan` : 'Tolak laporan',
          open: !!rej,
          children: `
            <div class="space-y-3">
              <p class="text-sm text-ink2">Laporan yang ditolak tidak tampil publik. Alasan dicatat di log dan dapat dilihat pelapor melalui Call Center 117.</p>
              ${Field({ label: 'Alasan penolakan', req: true, id: 'alasan', error: rErr, help: 'Contoh: duplikat dari APPB-2026-00123, foto tidak sesuai lokasi.', children: `<textarea id="alasan" rows="4" class="inp" data-model="alasan" aria-invalid="${rErr ? 'true' : 'false'}" placeholder="Tulis alasan penolakan">${esc(reason)}</textarea>` })}
            </div>`,
          footer: `${Btn('Batal', { attrs: 'data-reject-cancel' })}${Btn('Tolak laporan', { v: 'danger', attrs: 'data-reject-save' })}`,
        })}
      </div>`;
  };

  return page('Verifikasi Laporan', render, (root, ctxPage, drawRender) => {
    const draw = (focusKey) => paint(root, drawRender(), focusKey);
    const timer = setTimeout(() => { loading = false; draw(); }, LOAD_MS);

    const doVerify = (ids) => run(async () => {
      await verifikasiLaporan(ids, 'Resmi');
      toast(ids.length > 1 ? `${ids.length} laporan diverifikasi dan tampil publik.` : `${getDB().reports.find((r) => r.id === ids[0])?.code || ''} diverifikasi dan tampil publik.`);
      tableState.sel = [];
      open = null;
      draw();
    });

    const doReject = () => {
      if (reason.trim().length < 10) {
        rErr = reason.trim() ? 'Alasan minimal 10 karakter agar pelapor memahami penolakan.' : 'Alasan penolakan wajib diisi.';
        draw('alasan');
        return;
      }
      const ids = rej || [];
      run(async () => {
        await verifikasiLaporan(ids, 'Ditolak', reason.trim());
        toast(`${ids.length} laporan ditolak. Alasan tercatat di log.`);
        rej = null; reason = ''; rErr = ''; open = null; tableState.sel = [];
        draw();
      });
    };

    const onClick = (event) => {
      if (event.target.closest('[data-bulk-verify]')) {
        doVerify([...(tableState.sel || [])]);
        return;
      }
      if (event.target.closest('[data-bulk-reject]')) {
        rej = [...(tableState.sel || [])];
        reason = ''; rErr = '';
        draw('alasan');
        return;
      }
      if (event.target.closest('[data-drawer-verify]')) {
        if (open) doVerify([open]);
        return;
      }
      if (event.target.closest('[data-drawer-reject]')) {
        if (open) { rej = [open]; reason = ''; rErr = ''; draw('alasan'); }
        return;
      }
      if (event.target.closest('[data-reject-cancel]')) {
        rej = null; rErr = ''; draw();
        return;
      }
      if (event.target.closest('[data-reject-save]')) {
        doReject();
      }
    };

    const onInput = (event) => {
      const t = event.target;
      if (t.dataset.model === 'alasan') { reason = t.value; rErr = ''; }
      if (t.dataset.model === 'onlyDup') { onlyDup = t.checked; draw(); }
    };
    const onChange = (event) => {
      if (event.target.dataset.sel === 'kab') { kab = event.target.value; draw(); }
    };

    const attach = () => {
      const rows = getDB().reports.filter((r) => r.verif === 'Tertunda').filter((r) => (!onlyDup || dupOf(getDB(), r)) && (!kab || r.kab === kab));
      mountDataTable(root, 'verifikasi', {
        rows,
        cols: [
          { key: 'code', header: 'Tiket', render: (r) => `<span class="font-medium text-navy">${esc(r.code)}</span>`, sort: (r) => r.code },
          { key: 'jenis', header: 'Jenis', render: (r) => esc(r.jenis), sort: (r) => r.jenis },
          { key: 'kel', header: 'Kelurahan', render: (r) => `<p>Kel. ${esc(r.kel)}</p><p class="cap">${esc(r.kab)}</p>`, sort: (r) => r.kel },
          { key: 'at', header: 'Waktu masuk', render: (r) => `<p class="whitespace-nowrap">${esc(fmt(r.createdAt))}</p><p class="cap">${esc(rel(r.createdAt))}</p>`, sort: (r) => r.createdAt },
          { key: 'foto', header: 'Foto', render: (r) => r.foto, sort: (r) => r.foto },
          { key: 'flag', header: 'Tanda', render: (r) => { const o = dupOf(getDB(), r); return o ? Badge('amber', `Dugaan duplikat · ${esc(o.code.slice(-5))}`, { iconName: 'copy' }) : '<span class="text-mute">—</span>'; } },
        ],
        rowKey: (r) => r.id,
        loading,
        selectable: true,
        onRow: (r) => { open = r.id; draw(); },
        initialSort: ['at', 'asc'],
        empty: Empty('Tidak ada laporan yang menunggu verifikasi.', LinkBtn('/petugas/penanganan', 'Ke Penanganan')),
      }, tableState, draw);
      wireOverlayClose(root, {
        'verifikasi-drawer': () => { open = null; draw(); },
        'verifikasi-reject': () => { rej = null; rErr = ''; draw(); },
      });
    };

    attach();
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    return () => { clearTimeout(timer); root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('change', onChange); };
  });
}

/* ---------------- Penanganan list ---------------- */
export function penangananList(ctx = {}) {
  let loading = true;
  let st = '';
  let jenis = '';
  let q = '';
  let tableState = {};

  const render = () => {
    const d = getDB();
    const all = d.reports.filter((r) => r.verif !== 'Ditolak');
    const rows = all.filter((r) => (!st || statusOf(r) === st) && (!jenis || r.jenis === jenis) && (!q || `${r.code} ${r.kel} ${r.kab}`.toLowerCase().includes(q.toLowerCase())));
    const chips = [[st && [st, () => { st = ''; }]], [jenis && [jenis, () => { jenis = ''; }]], [q && [`"${q}"`, () => { q = ''; }]]].flat().filter(Boolean);
    const cols = [
      { key: 'code', header: 'Kode', render: (r) => `<span class="font-medium text-navy">${esc(r.code)}</span>`, sort: (r) => r.code },
      { key: 'jenis', header: 'Jenis', render: (r) => esc(r.jenis), sort: (r) => r.jenis },
      { key: 'lok', header: 'Lokasi', render: (r) => `<p>Kel. ${esc(r.kel)}</p><p class="cap">${esc(r.kab)}</p>`, sort: (r) => r.kab },
      { key: 'st', header: 'Status', render: (r) => RStatus(r), sort: (r) => statusOf(r) },
      { key: 'sus', header: 'Susulan', render: (r) => r.susulan.length, sort: (r) => r.susulan.length },
      { key: 'up', header: 'Diverifikasi', render: (r) => `<span class="text-ink2 whitespace-nowrap">${r.verifiedAt ? esc(fmt(r.verifiedAt)) : '—'}</span>`, sort: (r) => r.verifiedAt || '' },
    ];
    return `
      <div>
        ${PageHead({ title: 'Penanganan Laporan', desc: 'Laporan Tertunda dan Resmi. Pilih baris untuk mengubah status, korban, dan log.' })}
        ${DataTable(rows, cols, {
          id: 'penanganan-list',
          rowKey: (r) => r.id,
          loading,
          onRow: true,
          initialSort: ['up', 'desc'],
          toolbar: `<div class="w-full"><div class="flex flex-wrap gap-2">
            <div class="relative">${icon('search', 'absolute left-2.5 top-1/2 -translate-y-1/2 text-mute')}<input aria-label="Cari" class="inp pl-8 !w-56" data-model="q" placeholder="Kode atau kelurahan" value="${esc(q)}" /></div>
            ${Sel({ label: 'Status', name: 'st', value: st, placeholder: 'Semua status', options: ['Belum Ditangani', 'Sedang Ditangani', 'Selesai Ditangani', 'Tidak Perlu Tindak Lanjut', 'Case Closed'] })}
            ${Sel({ label: 'Jenis', name: 'jenis', value: jenis, placeholder: 'Semua jenis', options: [...new Set(all.map((r) => r.jenis))] })}
          </div>${Chips(chips)}</div>`,
        })}
      </div>`;
  };

  return page('Penanganan Laporan', render, (root, ctxPage, drawRender) => {
    const draw = (focusKey) => paint(root, drawRender(), focusKey);
    const timer = setTimeout(() => { loading = false; draw(); }, LOAD_MS);
    const onInput = (event) => { if (event.target.dataset.model === 'q') { q = event.target.value; draw('q'); } };
    const onChange = (event) => {
      if (event.target.dataset.sel === 'st') st = event.target.value;
      if (event.target.dataset.sel === 'jenis') jenis = event.target.value;
      if (event.target.dataset.sel === 'st' || event.target.dataset.sel === 'jenis') draw();
    };
    const onChip = (event) => {
      const chip = event.target.closest('[data-chip]');
      const clear = event.target.closest('[data-chip-clear]');
      if (!chip && !clear) return;
      if (clear || chip.dataset.chip === '0') st = '';
      if (clear || chip.dataset.chip === '1') jenis = '';
      if (clear || chip.dataset.chip === '2') q = '';
      draw();
    };

    const attach = () => {
      const all = getDB().reports.filter((r) => r.verif !== 'Ditolak');
      const rows = all.filter((r) => (!st || statusOf(r) === st) && (!jenis || r.jenis === jenis) && (!q || `${r.code} ${r.kel} ${r.kab}`.toLowerCase().includes(q.toLowerCase())));
      mountDataTable(root, 'penanganan-list', {
        rows,
        cols: [
          { key: 'code', header: 'Kode', render: (r) => `<span class="font-medium text-navy">${esc(r.code)}</span>`, sort: (r) => r.code },
          { key: 'jenis', header: 'Jenis', render: (r) => esc(r.jenis), sort: (r) => r.jenis },
          { key: 'lok', header: 'Lokasi', render: (r) => `<p>Kel. ${esc(r.kel)}</p><p class="cap">${esc(r.kab)}</p>`, sort: (r) => r.kab },
          { key: 'st', header: 'Status', render: (r) => RStatus(r), sort: (r) => statusOf(r) },
          { key: 'sus', header: 'Susulan', render: (r) => r.susulan.length, sort: (r) => r.susulan.length },
          { key: 'up', header: 'Diverifikasi', render: (r) => `<span class="text-ink2 whitespace-nowrap">${r.verifiedAt ? esc(fmt(r.verifiedAt)) : '—'}</span>`, sort: (r) => r.verifiedAt || '' },
        ],
        rowKey: (r) => r.id,
        loading,
        onRow: (r) => ctxPage.navigate(`${operationalBase()}/penanganan/${r.code}`),
        initialSort: ['up', 'desc'],
      }, tableState, draw);
    };

    attach();
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('click', onChip);
    return () => { clearTimeout(timer); root.removeEventListener('input', onInput); root.removeEventListener('change', onChange); root.removeEventListener('click', onChip); };
  });
}

/* ---------------- Laporan publik operasional ---------------- */
export function laporanPublikOperasional(ctx = {}) {
  let loading = true;
  let status = '';
  let q = '';
  let tableState = {};

  const render = () => {
    const d = getDB();
    const all = d.reports.filter((r) => r.verif === 'Resmi');
    const rows = all.filter((r) => (!status || statusOf(r) === status) && (!q || `${r.code} ${r.jenis} ${r.kel} ${r.kab}`.toLowerCase().includes(q.toLowerCase())));
    const chips = [[status && [status, () => { status = ''; }]], [q && [`"${q}"`, () => { q = ''; }]]].flat().filter(Boolean);
    const cols = [
      { key: 'code', header: 'Laporan', render: (r) => `<p class="font-medium text-navy">${esc(r.code)}</p><p class="cap">${esc(r.jenis)}</p>`, sort: (r) => r.code },
      { key: 'lok', header: 'Lokasi', render: (r) => `<p>Kel. ${esc(r.kel)}</p><p class="cap">${esc(r.kab)}, ${esc(r.prov)}</p>`, sort: (r) => r.kab },
      { key: 'st', header: 'Status', render: (r) => RStatus(r), sort: (r) => statusOf(r) },
      { key: 'sus', header: 'Pembaruan', render: (r) => r.susulan.length, sort: (r) => r.susulan.length, className: 'text-center' },
      { key: 'aksi', header: 'Aksi', render: (r) => `<div class="flex flex-wrap gap-1.5">${LinkBtn(`/laporan/${r.code}`, `${icon('eye')}Lihat publik`, { v: 'ghost' })}${r.penanganan !== 'Case Closed' ? LinkBtn(`/laporan/${r.code}/susulan`, `${icon('message-square-plus')}Tambah pembaruan`) : ''}</div>` },
    ];
    return `
      <div>
        ${PageHead({ title: 'Laporan Publik', desc: 'Lihat laporan resmi dan tambahkan pembaruan langsung tanpa membuka halaman penanganan.' })}
        ${DataTable(rows, cols, {
          id: 'laporan-publik-operasional',
          rowKey: (r) => r.id,
          loading,
          initialSort: ['code', 'desc'],
          toolbar: `<div class="w-full"><div class="flex flex-wrap gap-2">
            <div class="relative">${icon('search', 'absolute left-2.5 top-1/2 -translate-y-1/2 text-mute')}<input aria-label="Cari laporan publik" class="inp pl-8 !w-64" data-model="q" placeholder="Kode, jenis, atau wilayah" value="${esc(q)}" /></div>
            ${Sel({ label: 'Status', name: 'status', value: status, placeholder: 'Semua status', options: ['Belum Ditangani', 'Sedang Ditangani', 'Selesai Ditangani', 'Tidak Perlu Tindak Lanjut', 'Case Closed'] })}
          </div>${Chips(chips)}</div>`,
        })}
      </div>`;
  };

  return page('Laporan Publik', render, (root, ctxPage, drawRender) => {
    const draw = (focusKey) => paint(root, drawRender(), focusKey);
    const timer = setTimeout(() => { loading = false; draw(); }, LOAD_MS);
    const onInput = (event) => { if (event.target.dataset.model === 'q') { q = event.target.value; draw('q'); } };
    const onChange = (event) => { if (event.target.dataset.sel === 'status') { status = event.target.value; draw(); } };
    const onChip = (event) => {
      const chip = event.target.closest('[data-chip]');
      const clear = event.target.closest('[data-chip-clear]');
      if (!chip && !clear) return;
      if (clear || chip.dataset.chip === '0') status = '';
      if (clear || chip.dataset.chip === '1') q = '';
      draw();
    };
    const attach = () => {
      const all = getDB().reports.filter((r) => r.verif === 'Resmi');
      const rows = all.filter((r) => (!status || statusOf(r) === status) && (!q || `${r.code} ${r.jenis} ${r.kel} ${r.kab}`.toLowerCase().includes(q.toLowerCase())));
      mountDataTable(root, 'laporan-publik-operasional', {
        rows,
        cols: [
          { key: 'code', header: 'Laporan', render: (r) => `<p class="font-medium text-navy">${esc(r.code)}</p><p class="cap">${esc(r.jenis)}</p>`, sort: (r) => r.code },
          { key: 'lok', header: 'Lokasi', render: (r) => `<p>Kel. ${esc(r.kel)}</p><p class="cap">${esc(r.kab)}, ${esc(r.prov)}</p>`, sort: (r) => r.kab },
          { key: 'st', header: 'Status', render: (r) => RStatus(r), sort: (r) => statusOf(r) },
          { key: 'sus', header: 'Pembaruan', render: (r) => r.susulan.length, sort: (r) => r.susulan.length, className: 'text-center' },
          { key: 'aksi', header: 'Aksi', render: (r) => `<div class="flex flex-wrap gap-1.5">${LinkBtn(`/laporan/${r.code}`, `${icon('eye')}Lihat publik`, { v: 'ghost' })}${r.penanganan !== 'Case Closed' ? LinkBtn(`/laporan/${r.code}/susulan`, `${icon('message-square-plus')}Tambah pembaruan`) : ''}</div>` },
        ],
        rowKey: (r) => r.id,
        loading,
        initialSort: ['code', 'desc'],
      }, tableState, draw);
    };
    attach();
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('click', onChip);
    return () => { clearTimeout(timer); root.removeEventListener('input', onInput); root.removeEventListener('change', onChange); root.removeEventListener('click', onChip); };
  });
}

/* ---------------- Penanganan detail ---------------- */
const KL = [['luka', 'Luka-luka'], ['hilang', 'Hilang'], ['meninggal', 'Meninggal Dunia']];

export function penangananDetail(ctx = {}) {
  const code = ctx.params?.code;
  let note = '';
  let draft = null;
  let tptl = false;
  let close = false;
  let closeStep = 0;
  let closeSum = '';
  let closeErr = '';

  const render = () => {
    const d = getDB();
    const r = byCode(d, code);
    const areaBase = operationalBase();
    const isRelawan = areaBase === '/relawan';
    if (!r || r.verif === 'Ditolak') {
      return `<div class="card">${Empty(`Laporan ${esc(code)} tidak ditemukan atau telah ditolak.`, LinkBtn(`${areaBase}/penanganan`, 'Kembali ke daftar'))}</div>`;
    }
    const closed = r.penanganan === 'Case Closed';
    const locked = closed;
    const k = draft || r.korban;
    const logs = d.logs.filter((l) => l.code === r.code);
    const korbanHistory = r.korbanHistory.filter((h) => KL.some(([field]) => field === h.field));
    const statusOptions = locked
      ? [r.penanganan]
      : ['Belum Ditangani', 'Sedang Ditangani', 'Selesai Ditangani', ...(!isRelawan || r.penanganan === 'Tidak Perlu Tindak Lanjut' ? ['Tidak Perlu Tindak Lanjut'] : [])];

    return `
      <div>
        <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <p class="cap">${esc(r.code)} · masuk ${esc(fmt(r.createdAt))}</p>
            <h1 class="h2 mt-0.5">${esc(r.jenis)} · Kel. ${esc(r.kel)}</h1>
            <p class="text-ink2 text-sm">Kec. ${esc(r.kec)}, ${esc(r.kab)}, ${esc(r.prov)}</p>
            <div class="flex gap-2 mt-2">${RStatus(r)}</div>
          </div>
          ${!isRelawan && !locked ? Btn(`${icon('lock')}Tutup Laporan`, { v: 'primary', attrs: 'data-open-close' }) : ''}
        </div>
        ${closed ? `<div class="mb-4">${Alert({ tone: 'info', iconName: 'lock', title: `Laporan ditutup oleh ${esc(r.closedBy)} pada ${esc(fmt(r.closedAt))}`, children: `Data terkunci. Perubahan hanya dapat dilakukan Admin melalui Koreksi Laporan. Ringkasan: ${esc(r.ringkasan)}` })}</div>` : ''}
        ${r.penanganan === 'Tidak Perlu Tindak Lanjut' ? `<div class="mb-4">${Alert({ tone: 'info', title: 'Ditandai Tidak Perlu Tindak Lanjut', children: 'Laporan tetap dapat diperbarui sampai Petugas menutupnya dengan Case Closed.' })}</div>` : ''}
        <div class="grid xl:grid-cols-[1fr_400px] gap-5 items-start">
          <div class="space-y-4">
            ${Card({
              title: 'Status penanganan',
              children: `
                <div class="max-w-md">${Field({ label: 'Status', id: 'st', children: `<select id="st" class="inp" data-model="st" ${locked ? 'disabled' : ''}>${statusOptions.map((s) => `<option${s === (r.penanganan || 'Belum Ditangani') ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>` })}</div>
                ${!isRelawan && !locked ? `<div class="border-t border-line mt-4 pt-3 flex flex-wrap items-center justify-between gap-2"><p class="cap">Untuk laporan valid yang tidak memerlukan respons BPBD.</p>${Btn('Tandai: Tidak Perlu Tindak Lanjut', { sm: true, attrs: 'data-open-tptl' })}</div>` : ''}`,
            })}
            ${Card({
              title: 'Catatan lapangan',
              children: `
                <div class="flex flex-wrap gap-1.5 mb-3">${['Tenda sudah didirikan', 'Evakuasi berjalan', 'Bantuan tiba', 'Dapur umum aktif', 'Akses jalan terputus'].map((c) => `<button type="button" ${locked ? 'disabled' : ''} data-note="${esc(c)}" class="h-7 px-2.5 rounded-sm border border-line text-[13px] text-ink2 hover:border-navy hover:text-navy disabled:opacity-50 disabled:pointer-events-none">+ ${esc(c)}</button>`).join('')}</div>
                <textarea aria-label="Catatan" rows="3" ${locked ? 'disabled' : ''} class="inp" data-model="note" placeholder="Mis. 2 perahu karet Basarnas tiba di RW 03, 40 warga dievakuasi.">${esc(note)}</textarea>
                <div class="flex justify-end mt-2">${Btn('Tambah ke log', { sm: true, v: 'primary', attrs: `data-add-note ${locked || !note.trim() ? 'disabled' : ''}` })}</div>`,
            })}
            ${Card({
              title: 'Pencatatan Jumlah Korban',
              actions: draft ? '<span class="cap text-warn">Belum disimpan</span>' : '',
              children: `
                <div class="grid sm:grid-cols-2 gap-4">${KL.map(([f, l]) => `<div class="flex items-center justify-between gap-3"><span class="text-sm">${esc(l)}</span>${Stepper({ label: l, value: k[f], disabled: locked, name: f })}</div>`).join('')}</div>
                <div class="flex justify-end gap-2 mt-4">${draft ? Btn('Batal', { sm: true, attrs: 'data-cancel-korban' }) : ''}${Btn('Simpan', { sm: true, v: 'primary', attrs: `data-save-korban ${locked || !draft ? 'disabled' : ''}` })}</div>
                <div class="border-t border-line mt-4 pt-3">
                  <p class="text-[13px] font-medium mb-2">Riwayat perubahan</p>
                  ${korbanHistory.length === 0 ? '<p class="cap">Belum ada perubahan.</p>' : `
                    <div class="overflow-x-auto"><table class="w-full text-[13px]"><thead><tr><th class="th">Siapa</th><th class="th">Kapan</th><th class="th">Kolom</th><th class="th">Dari &gt; ke</th></tr></thead>
                      <tbody>${[...korbanHistory].reverse().map((h) => `<tr><td class="td py-2">${esc(h.by)}</td><td class="td py-2 whitespace-nowrap text-ink2">${esc(fmt(h.at))}</td><td class="td py-2">${esc(KL.find((x) => x[0] === h.field)?.[1] || h.field)}</td><td class="td py-2 whitespace-nowrap">${h.from.toLocaleString('id-ID')} &gt; <strong class="font-semibold">${h.to.toLocaleString('id-ID')}</strong></td></tr>`).join('')}</tbody></table></div>`}
                </div>`,
            })}
          </div>
          <div class="space-y-4">
            ${Card({ title: 'Detail laporan', children: `<p class="text-sm">${esc(r.deskripsi)}</p><p class="cap mt-2">${esc(r.alamat)} · Pelapor: ${esc(r.pelapor)}</p><div class="mt-3">${Thumbs(r.foto, 56)}</div>` })}
            ${Card({
              title: `Susulan warga (${r.susulan.length})`,
              pad: false,
              children: r.susulan.length === 0 ? Empty('Belum ada susulan.') : `<ul class="max-h-72 overflow-y-auto">${[...r.susulan].reverse().map((s) => `<li class="px-4 py-3 border-b border-line last:border-0"><p class="text-sm">${esc(s.isi)}</p><p class="cap mt-0.5">${esc(s.nama)} · ${esc(rel(s.at))}${s.foto > 0 ? ` · ${s.foto} foto` : ''}</p></li>`).join('')}</ul>`,
            })}
            ${Card({
              title: 'Log penanganan',
              children: logs.length === 0 ? '<p class="cap">Belum ada log.</p>' : Timeline(logs.map((l) => ({ at: fmt(l.at), by: l.actor, title: `<span class="font-medium">${esc(l.aksi)}</span>`, body: esc(l.detail) }))),
            })}
          </div>
        </div>
        ${Modal({
          id: 'detail-tptl',
          title: 'Tandai Tidak Perlu Tindak Lanjut',
          open: tptl,
          children: `<p class="text-sm text-ink2">Laporan ${esc(r.code)} tetap tampil publik dengan status <strong class="text-ink font-medium">Tidak Perlu Tindak Lanjut</strong>. Laporan dapat diperbarui hingga Case Closed.</p>`,
          footer: `${Btn('Batal', { attrs: 'data-tptl-cancel' })}${Btn('Tandai', { v: 'primary', attrs: 'data-tptl-save' })}`,
        })}
        ${!isRelawan ? TutupModal({ open: close, step: closeStep, sum: closeSum, err: closeErr, r }) : ''}
      </div>`;
  };

  return page('Penanganan Laporan', render, (root, ctxPage, drawRender) => {
    const draw = (focusKey) => paint(root, drawRender(), focusKey);

    const addNote = (text) => {
      if (!text.trim()) return;
      run(async () => {
        await patchCatatan(code, text.trim());
        note = '';
        toast('Catatan ditambahkan ke log.');
        draw();
      });
    };

    const setStatus = (s) => {
      const r = byCode(getDB(), code);
      if (!r || r.penanganan === 'Case Closed' || (operationalBase() === '/relawan' && s === 'Tidak Perlu Tindak Lanjut') || s === r.penanganan) return;
      run(async () => {
        await patchPenanganan(code, s);
        toast(`Status: ${s}.`);
        draw();
      });
    };

    const saveKorban = () => {
      const r = byCode(getDB(), code);
      if (!r || !draft) return;
      const changes = KL.filter(([f]) => draft[f] !== r.korban[f]).map(([f]) => ({ at: new Date().toISOString(), by: me(getDB())?.nama || '', field: f, from: r.korban[f], to: draft[f] }));
      if (!changes.length) { toast('Tidak ada perubahan jumlah korban.', 'info'); return; }
      run(async () => {
        await patchKorban(code, draft, changes);
        draft = null;
        toast('Jumlah korban disimpan.');
        draw();
      });
    };

    const onClick = (event) => {
      if (event.target.closest('[data-open-tptl]')) { tptl = true; draw(); return; }
      if (event.target.closest('[data-tptl-cancel]')) { tptl = false; draw(); return; }
      if (event.target.closest('[data-tptl-save]')) { setStatus('Tidak Perlu Tindak Lanjut'); tptl = false; draw(); return; }
      if (event.target.closest('[data-open-close]')) { close = true; closeStep = 0; closeSum = ''; closeErr = ''; draw(); return; }
      if (event.target.closest('[data-close-cancel]')) { close = false; closeStep = 0; closeSum = ''; closeErr = ''; draw(); return; }
      if (event.target.closest('[data-close-back]')) { closeStep = Math.max(0, closeStep - 1); closeErr = ''; draw(); return; }
      if (event.target.closest('[data-close-next]')) { nextCloseStep(); return; }
      const quick = event.target.closest('[data-note]');
      if (quick) { addNote(quick.dataset.note); return; }
      if (event.target.closest('[data-add-note]')) { addNote(note); return; }
      if (event.target.closest('[data-cancel-korban]')) { draft = null; draw(); return; }
      if (event.target.closest('[data-save-korban]')) { saveKorban(); return; }
      const stepBtn = event.target.closest('[data-step]');
      if (stepBtn) {
        const wrap = stepBtn.closest('[data-stepper]');
        const field = wrap?.querySelector('[data-step-input]')?.dataset.stepInput;
        if (!field) return;
        const current = draft?.[field] ?? byCode(getDB(), code)?.korban[field] ?? 0;
        draft = { ...(draft || byCode(getDB(), code).korban), [field]: Math.max(0, current + Number(stepBtn.dataset.step)) };
        draw();
      }
    };

    const nextCloseStep = () => {
      const r = byCode(getDB(), code);
      const user = me(getDB());
      const ok = r && (r.penanganan === 'Selesai Ditangani' || r.penanganan === 'Tidak Perlu Tindak Lanjut');
      if (!ok || user?.role !== 'petugas' || !user.aktif) return;
      if (closeStep === 1 && closeSum.trim().length < 30) {
        closeErr = closeSum.trim() ? `Ringkasan minimal 30 karakter (sekarang ${closeSum.trim().length}).` : 'Ringkasan wajib diisi sebelum menutup laporan.';
        draw('ring');
        return;
      }
      if (closeStep < 2) { closeStep += 1; closeErr = ''; draw(); return; }
      run(async () => {
        await tutupLaporan(code, closeSum.trim());
        toast(`${code} ditutup dan dikunci.`);
        close = false; closeStep = 0; closeSum = ''; closeErr = '';
        draw();
      });
    };

    const onInput = (event) => {
      const key = event.target.dataset.model;
      if (key === 'note') { note = event.target.value; return; }
      if (key === 'ring') { closeSum = event.target.value; closeErr = ''; return; }
      if (event.target.dataset.stepInput) {
        const field = event.target.dataset.stepInput;
        const value = Math.max(0, Number(String(event.target.value).replace(/\D/g, '')) || 0);
        draft = { ...(draft || byCode(getDB(), code).korban), [field]: value };
        event.target.value = String(value);
        draw(field);
      }
    };
    const onChange = (event) => { if (event.target.dataset.model === 'st') setStatus(event.target.value); };

    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    wireOverlayClose(root, {
      'detail-tptl': () => { tptl = false; draw(); },
      'detail-close': () => { close = false; closeStep = 0; closeSum = ''; closeErr = ''; draw(); },
    });
    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onChange);
    };
  });
}

function TutupModal({ open = false, step = 0, sum = '', err = '', r = {} } = {}) {
  const user = me(getDB());
  const ok = r.penanganan === 'Selesai Ditangani' || r.penanganan === 'Tidak Perlu Tindak Lanjut';
  return Modal({
    id: 'detail-close',
    title: 'Tutup Laporan (Case Closed)',
    open,
    children: `
      <div class="mb-5">${Steps({ steps: ['Cek status', 'Ringkasan', 'Konfirmasi'], current: step })}</div>
      ${step === 0 ? (ok
        ? Alert({ tone: 'ok', title: 'Status memenuhi syarat', children: 'Laporan memenuhi syarat untuk ditutup.' })
        : Alert({ tone: 'crit', title: 'Laporan belum dapat ditutup', children: `Status saat ini <strong class="font-medium text-ink">${esc(r.penanganan)}</strong>. Ubah status ke <strong class="font-medium text-ink">Selesai Ditangani atau Tidak Perlu Tindak Lanjut</strong> terlebih dahulu.` })) : ''}
      ${step === 1 ? Field({ label: 'Ringkasan keseluruhan bencana dan penanganan', req: true, id: 'ring', error: err, help: 'Tulis kronologi singkat, dampak, dan tindakan yang dilakukan. Tampil publik.', children: `<textarea id="ring" rows="6" class="inp" data-model="ring" aria-invalid="${err ? 'true' : 'false'}" placeholder="Tulis ringkasan penanganan">${esc(sum)}</textarea>` }) : ''}
      ${step === 2 ? `<div class="space-y-3">${Alert({ tone: 'warn', iconName: 'lock', title: 'Data laporan akan DIKUNCI', children: 'Setelah ditutup, petugas tidak dapat mengubah status, korban, maupun catatan. Hanya Admin yang dapat melakukan koreksi, dan setiap koreksi tercatat di log audit.' })}${DL([['Laporan', esc(r.code)], ['Ditutup oleh', esc(user?.nama || '')]])}</div>` : ''}`,
    footer: `${step > 0 ? Btn('Kembali', { attrs: 'data-close-back' }) : ''}${Btn('Batal', { attrs: 'data-close-cancel' })}${Btn(step === 2 ? 'Tutup dan kunci laporan' : 'Lanjut', { v: step === 2 ? 'danger' : 'primary', attrs: `data-close-next ${ok ? '' : 'disabled'}` })}`,
  });
}

/* ---------------- Buat Pengumuman ---------------- */
export function buatPengumuman(ctx = {}) {
  const initialUser = me(getDB());
  const initialKab = initialUser?.wilayah !== 'Nasional' ? initialUser?.wilayah || '' : '';
  const initialProv = Object.keys(WILAYAH).find((p) => WILAYAH[p][initialKab]) || '';
  let f = { title: '', body: '', severity: 'Informasi', jenis: '', prov: initialProv, kab: initialKab, kec: '', kel: '', reportCode: '' };
  let err = {};
  let confirm = false;

  const render = () => {
    const d = getDB();
    const user = me(d);
    const kabs = f.prov ? Object.keys(WILAYAH[f.prov]) : [];
    const kecs = f.prov && f.kab ? Object.keys(WILAYAH[f.prov][f.kab]) : [];
    const kels = f.prov && f.kab && f.kec ? WILAYAH[f.prov][f.kab][f.kec] : [];
    const linkable = d.reports.filter((r) => r.verif === 'Resmi' && isActive(r) && (!f.kab || r.kab === f.kab));
    return `
      <div>
        ${PageHead({ title: 'Buat Pengumuman', desc: 'Pengumuman tampil di halaman Pengumuman dan detail laporan terkait. Label Evakuasi juga tampil sebagai banner merah di seluruh situs publik.' })}
        <div class="grid xl:grid-cols-2 gap-5 items-start">
          ${Card({
            title: 'Editor',
            children: `<div class="space-y-4">
              ${Field({ label: 'Judul', req: true, id: 'jd', error: err.title, children: `<input id="jd" class="inp" data-model="title" value="${esc(f.title)}" aria-invalid="${err.title ? 'true' : 'false'}" />` })}
              <div class="grid sm:grid-cols-2 gap-4">
                ${Field({ label: 'Label', req: true, id: 'sv', children: `<select id="sv" class="inp" data-model="severity">${['Informasi', 'Imbauan', 'Peringatan', 'Evakuasi'].map((s) => `<option${s === f.severity ? ' selected' : ''}>${s}</option>`).join('')}</select>` })}
                ${Field({ label: 'Jenis bencana', req: true, id: 'jn', error: err.jenis, children: `<select id="jn" class="inp" data-model="jenis" aria-invalid="${err.jenis ? 'true' : 'false'}"><option value="">Pilih jenis</option>${d.categories.filter((c) => c.aktif).map((c) => `<option${c.nama === f.jenis ? ' selected' : ''}>${esc(c.nama)}</option>`).join('')}</select>` })}
                ${Field({ label: 'Provinsi', req: true, id: 'pv', error: err.prov, children: `<select id="pv" class="inp" data-model="prov" aria-invalid="${err.prov ? 'true' : 'false'}"><option value="">Pilih provinsi</option>${Object.keys(WILAYAH).map((p) => `<option${p === f.prov ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>` })}
                ${Field({ label: 'Kabupaten/kota', req: true, id: 'wl', error: err.kab, children: `<select id="wl" class="inp" data-model="kab" aria-invalid="${err.kab ? 'true' : 'false'}"><option value="">Pilih kabupaten/kota</option>${kabs.map((k) => `<option${k === f.kab ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select>` })}
                ${Field({ label: 'Kecamatan', req: true, id: 'kc', error: err.kec, children: `<select id="kc" class="inp" data-model="kec" aria-invalid="${err.kec ? 'true' : 'false'}"><option value="">Pilih kecamatan</option>${kecs.map((k) => `<option${k === f.kec ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select>` })}
                ${Field({ label: 'Kelurahan/desa', req: true, id: 'kl', error: err.kel, children: `<select id="kl" class="inp" data-model="kel" aria-invalid="${err.kel ? 'true' : 'false'}"><option value="">Pilih kelurahan/desa</option>${kels.map((k) => `<option${k === f.kel ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select>` })}
              </div>
              ${Field({ label: 'Tautkan ke laporan', id: 'lr', help: 'Opsional. Memilih laporan akan menyesuaikan lokasi pengumuman.', children: `<select id="lr" class="inp" data-model="reportCode"><option value="">Tidak ditautkan</option>${linkable.filter((r) => !f.jenis || r.jenis === f.jenis).map((r) => `<option value="${esc(r.code)}"${r.code === f.reportCode ? ' selected' : ''}>${esc(r.code)} · ${esc(r.jenis)} · Kel. ${esc(r.kel)}</option>`).join('')}</select>` })}
              <div>
                <label for="bd" class="lbl">Isi<span class="text-crit ml-0.5">*</span></label>
                <div class="rounded-md border ${err.body ? 'border-crit' : 'border-line'} overflow-hidden">
                  <div class="flex gap-0.5 px-1.5 py-1 border-b border-line bg-app" role="toolbar" aria-label="Format teks">
                    <button type="button" data-format="bold" aria-label="Tebal" title="Tebal" class="p-1.5 rounded text-ink2 hover:bg-white hover:text-ink">${icon('bold')}</button>
                    <button type="button" data-format="italic" aria-label="Miring" title="Miring" class="p-1.5 rounded text-ink2 hover:bg-white hover:text-ink">${icon('italic')}</button>
                    <button type="button" data-format="list" aria-label="Daftar" title="Daftar" class="p-1.5 rounded text-ink2 hover:bg-white hover:text-ink">${icon('list')}</button>
                    <button type="button" data-format="link" aria-label="Tautan" title="Tautan" class="p-1.5 rounded text-ink2 hover:bg-white hover:text-ink">${icon('link-2')}</button>
                  </div>
                  <textarea id="bd" rows="7" class="w-full px-3 py-2 text-sm outline-none focus-visible:outline-none resize-y" data-model="body" placeholder="Tulis isi pengumuman">${esc(f.body)}</textarea>
                </div>
                ${err.body ? `<p class="err">${esc(err.body)}</p>` : ''}
              </div>
              <div class="flex justify-end">${Btn('Terbitkan', { v: 'primary', attrs: 'data-check' })}</div>
            </div>`,
          })}
          ${Card({
            title: 'Tampilan untuk Warga',
            children: `<div class="rounded-md border border-line p-4">
              <div class="flex flex-wrap gap-2">${SevBadge(f.severity)}${f.jenis ? Badge('navy', esc(f.jenis), { dot: false }) : ''}</div>
              <h3 class="text-base font-semibold mt-2">${f.title ? esc(f.title) : '<span class="text-mute">Judul pengumuman</span>'}</h3>
              <div class="mt-1.5">${f.body ? MD(f.body) : '<p class="text-sm text-mute">Isi pengumuman tampil di sini.</p>'}</div>
              ${f.reportCode ? `<p class="text-[13px] link mt-2">Laporan ${esc(f.reportCode)}</p>` : ''}
              <p class="cap mt-3">${esc(f.kel || 'Kelurahan/desa')}, ${esc(f.kec || 'Kecamatan')}, ${esc(f.kab || 'Kabupaten/kota')}${f.prov ? `, ${esc(f.prov)}` : ''} · ${esc(user?.instansi)}</p>
            </div>
            ${f.severity === 'Evakuasi' ? `<div class="mt-3">${Alert({ tone: 'crit', title: 'Juga tampil sebagai banner darurat', children: 'Banner merah ditampilkan di atas semua halaman publik.' })}</div>` : ''}`,
          })}
        </div>
        <h2 class="text-sm font-semibold mt-6 mb-2">Riwayat pengumuman</h2>
        ${DataTable(d.announcements, [
          { key: 'sev', header: 'Label', render: (a) => SevBadge(a.severity), sort: (a) => a.severity },
          { key: 'jenis', header: 'Jenis', render: (a) => esc(a.jenis), sort: (a) => a.jenis },
          { key: 'isi', header: 'Isi', render: (a) => `<p class="font-medium">${esc(a.title)}</p><p class="cap line-clamp-1">${esc(String(a.body).replace(/[*_[\]]/g, ''))}</p>`, className: 'min-w-[280px]' },
          { key: 'wl', header: 'Wilayah', render: (a) => `<p>${esc(a.kel)}, ${esc(a.kec)}</p><p class="cap">${esc(a.kab)}, ${esc(a.prov)}</p>`, sort: (a) => `${a.prov}${a.kab}${a.kec}${a.kel}` },
          { key: 'at', header: 'Waktu', render: (a) => `<span class="whitespace-nowrap">${esc(fmt(a.at))}</span>`, sort: (a) => a.at },
          { key: 'by', header: 'Petugas', render: (a) => esc(a.by), sort: (a) => a.by },
        ], { id: 'riwayat-pengumuman', rowKey: (a) => a.id, initialSort: ['at', 'desc'] })}
        ${Modal({
          id: 'publish-announcement',
          title: 'Terbitkan pengumuman',
          open: confirm,
          children: `<p class="text-sm text-ink2">Pengumuman <strong class="text-ink font-medium">${esc(f.severity)}</strong> untuk <strong class="text-ink font-medium">${esc(f.kel)}, ${esc(f.kec)}, ${esc(f.kab)}</strong> akan langsung tampil publik. Pengumuman yang sudah terbit tidak dapat dihapus.</p>`,
          footer: `${Btn('Batal', { attrs: 'data-publish-cancel' })}${Btn('Terbitkan', { v: 'primary', attrs: 'data-publish-save' })}`,
        })}
      </div>`;
  };

  return page('Buat Pengumuman', render, (root, ctxPage, drawRender) => {
    const draw = (focusKey) => paint(root, drawRender(), focusKey);
    const check = () => {
      const er = {};
      if (f.title.trim().length < 8) er.title = 'Judul minimal 8 karakter.';
      if (f.body.trim().length < 20) er.body = 'Isi pengumuman minimal 20 karakter.';
      if (!f.jenis) er.jenis = 'Pilih jenis bencana.';
      if (!f.prov) er.prov = 'Pilih provinsi tujuan.';
      if (!f.kab) er.kab = 'Pilih wilayah tujuan.';
      if (!f.kec) er.kec = 'Pilih kecamatan tujuan.';
      if (!f.kel) er.kel = 'Pilih kelurahan/desa tujuan.';
      err = er;
      if (!Object.keys(er).length) confirm = true;
      draw();
    };
    const publish = () => run(async () => {
      await createAnnouncement({ ...f, title: f.title.trim(), reportCode: f.reportCode || undefined });
      toast('Pengumuman diterbitkan dan tampil di situs publik.');
      confirm = false;
      f = { ...f, title: '', body: '', reportCode: '' };
      draw();
    });

    const setField = (key, value, clear = []) => {
      f = { ...f, [key]: value, ...clear.reduce((a, k) => ({ ...a, [k]: '' }), {}) };
      if (clear.includes('kab')) f.reportCode = '';
      draw(key);
    };

    const wrapFormat = (before, after = before, placeholder = 'teks') => {
      const el = root.querySelector('[data-model="body"]');
      if (!el) return;
      const s = el.selectionStart ?? f.body.length;
      const e = el.selectionEnd ?? s;
      const selected = f.body.slice(s, e) || placeholder;
      f = { ...f, body: f.body.slice(0, s) + before + selected + after + f.body.slice(e) };
      draw('body');
      requestAnimationFrame(() => {
        const next = root.querySelector('[data-model="body"]');
        if (next) { next.focus(); next.setSelectionRange(s + before.length, s + before.length + selected.length); }
      });
    };

    const onClick = (event) => {
      if (event.target.closest('[data-check]')) { check(); return; }
      if (event.target.closest('[data-publish-cancel]')) { confirm = false; draw(); return; }
      if (event.target.closest('[data-publish-save]')) { publish(); return; }
      const fmtBtn = event.target.closest('[data-format]');
      if (fmtBtn) {
        const kind = fmtBtn.dataset.format;
        if (kind === 'bold') wrapFormat('**');
        if (kind === 'italic') wrapFormat('_');
        if (kind === 'list') setField('body', `${f.body}${f.body && !f.body.endsWith('\n') ? '\n' : ''}- `);
        if (kind === 'link') wrapFormat('[', '](https://bpbd.go.id)', 'teks tautan');
      }
    };
    const onInput = (event) => {
      const key = event.target.dataset.model;
      if (!key) return;
      f = { ...f, [key]: event.target.value };
      err = {};
      draw(key);
    };
    const onChange = (event) => {
      const key = event.target.dataset.model;
      if (!key) return;
      if (key === 'prov') setField('prov', event.target.value, ['kab', 'kec', 'kel']);
      else if (key === 'kab') setField('kab', event.target.value, ['kec', 'kel']);
      else if (key === 'kec') setField('kec', event.target.value, ['kel']);
      else if (key === 'reportCode') {
        const r = getDB().reports.find((x) => x.code === event.target.value);
        f = r ? { ...f, reportCode: r.code, jenis: r.jenis, prov: r.prov, kab: r.kab, kec: r.kec, kel: r.kel } : { ...f, reportCode: '' };
        draw();
      } else { f = { ...f, [key]: event.target.value }; draw(); }
    };

    mountTable(root, 'riwayat-pengumuman', {
      rows: getDB().announcements,
      cols: [
        { key: 'sev', header: 'Label', render: (a) => SevBadge(a.severity), sort: (a) => a.severity },
        { key: 'jenis', header: 'Jenis', render: (a) => esc(a.jenis), sort: (a) => a.jenis },
        { key: 'isi', header: 'Isi', render: (a) => `<p class="font-medium">${esc(a.title)}</p><p class="cap line-clamp-1">${esc(String(a.body).replace(/[*_[\]]/g, ''))}</p>`, className: 'min-w-[280px]' },
        { key: 'wl', header: 'Wilayah', render: (a) => `<p>${esc(a.kel)}, ${esc(a.kec)}</p><p class="cap">${esc(a.kab)}, ${esc(a.prov)}</p>`, sort: (a) => `${a.prov}${a.kab}${a.kec}${a.kel}` },
        { key: 'at', header: 'Waktu', render: (a) => `<span class="whitespace-nowrap">${esc(fmt(a.at))}</span>`, sort: (a) => a.at },
        { key: 'by', header: 'Petugas', render: (a) => esc(a.by), sort: (a) => a.by },
      ],
      rowKey: (a) => a.id,
      initialSort: ['at', 'desc'],
    }, {}, () => draw());

    wireOverlayClose(root, { 'publish-announcement': () => { confirm = false; draw(); } });
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onChange);
    };
  });
}

/* ---------------- Log (shared) ---------------- */
export function logPage(ctx = {}) {
  let loading = true;
  let actor = '';
  let aksi = '';
  let q = '';
  let role = '';
  let tableState = {};

  const render = () => {
    const logs = getDB().logs;
    const rows = logs.filter((l) => (!actor || l.actor === actor) && (!aksi || l.aksi === aksi) && (!role || l.role === role) && (!q || `${l.code} ${l.detail}`.toLowerCase().includes(q.toLowerCase())));
    const chips = [[actor && [actor, () => { actor = ''; }]], [aksi && [aksi, () => { aksi = ''; }]], [role && [role, () => { role = ''; }]], [q && [`"${q}"`, () => { q = ''; }]]].flat().filter(Boolean);
    const cols = [
      { key: 'at', header: 'Waktu', render: (l) => `<span class="whitespace-nowrap">${esc(fmt(l.at))}</span>`, sort: (l) => l.at },
      { key: 'actor', header: 'Aktor', render: (l) => `<p>${esc(l.actor)}</p><p class="cap capitalize">${esc(l.role)}</p>`, sort: (l) => l.actor },
      { key: 'aksi', header: 'Aksi', render: (l) => `<span class="font-medium">${esc(l.aksi)}</span>`, sort: (l) => l.aksi },
      { key: 'code', header: 'Laporan', render: (l) => (l.code ? `<span class="text-navy">${esc(l.code)}</span>` : '<span class="text-mute">—</span>'), sort: (l) => l.code || '' },
      { key: 'det', header: 'Detail', render: (l) => `<span class="text-ink2">${esc(l.detail)}</span>`, className: 'min-w-[260px]' },
    ];
    return `
      <div>
        ${PageHead({
          title: 'Log Penanganan',
          desc: 'Jejak audit seluruh aksi petugas, relawan, admin, dan sistem.',
          actions: Btn(`${icon('download')}Ekspor CSV`, { attrs: 'data-export-log' }),
        })}
        <div class="flex items-center gap-2 mb-4 text-[13px] text-ink2 border-l-[3px] border-navy bg-white rounded-r-md px-3 py-2 border border-l-navy border-line">${icon('shield-check', 'text-navy')}Log bersifat append-only: tidak dapat diubah atau dihapus.</div>
        ${DataTable(rows, cols, {
          id: 'log',
          rowKey: (l) => l.id,
          loading,
          initialSort: ['at', 'desc'],
          toolbar: `<div class="w-full"><div class="flex flex-wrap gap-2">
            <div class="relative">${icon('search', 'absolute left-2.5 top-1/2 -translate-y-1/2 text-mute')}<input aria-label="Cari log" class="inp pl-8 !w-52" data-model="q" placeholder="Kode atau detail" value="${esc(q)}" /></div>
            ${Sel({ label: 'Aktor', name: 'actor', value: actor, placeholder: 'Semua aktor', options: [...new Set(logs.map((l) => l.actor))] })}
            ${Sel({ label: 'Aksi', name: 'aksi', value: aksi, placeholder: 'Semua aksi', options: [...new Set(logs.map((l) => l.aksi))] })}
            ${Sel({ label: 'Peran', name: 'role', value: role, placeholder: 'Semua peran', options: ['petugas', 'relawan', 'admin', 'sistem'] })}
          </div>${Chips(chips)}</div>`,
        })}
      </div>`;
  };

  return page('Log Penanganan', render, (root, ctxPage, drawRender) => {
    const draw = (focusKey) => paint(root, drawRender(), focusKey);
    const timer = setTimeout(() => { loading = false; draw(); }, LOAD_MS);
    const onInput = (event) => { if (event.target.dataset.model === 'q') { q = event.target.value; draw('q'); } };
    const onChange = (event) => {
      const key = event.target.dataset.sel;
      if (key === 'actor') actor = event.target.value;
      if (key === 'aksi') aksi = event.target.value;
      if (key === 'role') role = event.target.value;
      if (key) draw();
    };
    const onChip = (event) => {
      const chip = event.target.closest('[data-chip]');
      const clear = event.target.closest('[data-chip-clear]');
      if (!chip && !clear) return;
      if (clear || chip.dataset.chip === '0') actor = '';
      if (clear || chip.dataset.chip === '1') aksi = '';
      if (clear || chip.dataset.chip === '2') role = '';
      if (clear || chip.dataset.chip === '3') q = '';
      draw();
    };
    const onExport = () => {
      const logs = getDB().logs;
      const rows = logs.filter((l) => (!actor || l.actor === actor) && (!aksi || l.aksi === aksi) && (!role || l.role === role) && (!q || `${l.code} ${l.detail}`.toLowerCase().includes(q.toLowerCase())));
      downloadCSV('log_appb.csv', [['Waktu', 'Aktor', 'Peran', 'Aksi', 'Laporan', 'Detail'], ...rows.map((l) => [fmt(l.at), l.actor, l.role, l.aksi, l.code || '', l.detail])]);
    };
    const attach = () => {
      const logs = getDB().logs;
      const rows = logs.filter((l) => (!actor || l.actor === actor) && (!aksi || l.aksi === aksi) && (!role || l.role === role) && (!q || `${l.code} ${l.detail}`.toLowerCase().includes(q.toLowerCase())));
      mountDataTable(root, 'log', {
        rows,
        cols: [
          { key: 'at', header: 'Waktu', render: (l) => `<span class="whitespace-nowrap">${esc(fmt(l.at))}</span>`, sort: (l) => l.at },
          { key: 'actor', header: 'Aktor', render: (l) => `<p>${esc(l.actor)}</p><p class="cap capitalize">${esc(l.role)}</p>`, sort: (l) => l.actor },
          { key: 'aksi', header: 'Aksi', render: (l) => `<span class="font-medium">${esc(l.aksi)}</span>`, sort: (l) => l.aksi },
          { key: 'code', header: 'Laporan', render: (l) => (l.code ? `<span class="text-navy">${esc(l.code)}</span>` : '<span class="text-mute">—</span>'), sort: (l) => l.code || '' },
          { key: 'det', header: 'Detail', render: (l) => `<span class="text-ink2">${esc(l.detail)}</span>`, className: 'min-w-[260px]' },
        ],
        rowKey: (l) => l.id,
        loading,
        initialSort: ['at', 'desc'],
      }, tableState, draw);
    };
    attach();
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('click', onChip);
    root.addEventListener('click', (event) => { if (event.target.closest('[data-export-log]')) onExport(); });
    return () => { clearTimeout(timer); root.removeEventListener('input', onInput); root.removeEventListener('change', onChange); root.removeEventListener('click', onChip); };
  });
}

export const PetugasDashboard = dashboard;
export const Verifikasi = verifikasi;
export const PenangananList = penangananList;
export const PenangananDetail = penangananDetail;
export const LaporanPublikOperasional = laporanPublikOperasional;
export const BuatPengumuman = buatPengumuman;
export const LogPage = logPage;
export { base, operationalBase };
