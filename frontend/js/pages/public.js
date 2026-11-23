import {
  getDB, byCode, me, isActive, isPublic, isOwn, canView, canUpdate,
  findActiveResmi, statusOf, WILAYAH, submitReport, addSusulan, login,
} from '../store.js';
import {
  esc, icon, paint, fmt, rel, link, options, Btn, LinkBtn, Badge, StatusBadge,
  RStatus, SevBadge, Field, DL, Alert, Empty, Card, Thumbs, Timeline, Modal,
  MapPH, Sel, Chips, MD, Crumbs, Skel, toast, AutoRefresh, Tip,
} from '../ui.js';

/* ------------------------------------------------------------------ */
/* Small bridge helpers (ctx → DOM)                                     */
/* ------------------------------------------------------------------ */

function goTo(ctx, path, replace = false) {
  if (typeof ctx?.navigate === 'function') {
    ctx.navigate(path, replace);
    return;
  }
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function queryGet(ctx, key) {
  return ctx?.query?.get?.(key) || '';
}

function querySet(ctx, key, value) {
  if (typeof ctx?.setQuery === 'function') {
    ctx.setQuery(key, value);
    return;
  }
  const params = new URLSearchParams(window.location.search);
  if (value) params.set(key, value);
  else params.delete(key);
  const search = params.toString();
  history.replaceState({}, '', `${location.pathname}${search ? `?${search}` : ''}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function querySetAll(ctx, values = {}) {
  const clean = {};
  Object.entries(values || {}).forEach(([k, v]) => { if (v) clean[k] = v; });
  if (typeof ctx?.setQueryAll === 'function') {
    ctx.setQueryAll(clean);
    return;
  }
  const params = new URLSearchParams();
  Object.entries(clean).forEach(([k, v]) => params.set(k, v));
  const search = params.toString();
  history.replaceState({}, '', `${location.pathname}${search ? `?${search}` : ''}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/* ---------------- Beranda ---------------- */
export function beranda(ctx = {}) {
  const render = () => {
    const d = getDB();
    const reports = d.reports || [];
    const ann = d.announcements || [];
    const pub = reports.filter(isPublic);
    const aktif = pub.filter(isActive);
    const sedang = pub.filter((r) => r.penanganan === 'Sedang Ditangani');
    const selesai = pub.filter((r) => (r.penanganan === 'Selesai Ditangani' || r.penanganan === 'Case Closed') && Date.now() - +new Date(r.createdAt) < 30 * 86400000);
    const kpis = [
      ['Laporan resmi aktif', aktif.length, 'di 6 provinsi'],
      ['Sedang ditangani', sedang.length, 'oleh BPBD setempat'],
      ['Selesai 30 hari', selesai.length, 'termasuk Case Closed'],
    ];
    return `
      <div class="space-y-8">
        <section class="grid lg:grid-cols-[1fr_380px] gap-8 items-end border-b border-line pb-8">
          <div>
            <p class="text-[13px] font-medium text-navy mb-2">Layanan pelaporan resmi BNPB · BPBD</p>
            <h1 class="h1 max-w-2xl">Laporkan kejadian bencana di sekitar Anda</h1>
            <p class="text-base text-ink2 mt-3 max-w-xl">Laporan diterima petugas BPBD setempat, diverifikasi, lalu ditampilkan ke publik beserta status penanganannya.</p>
          </div>
          <div class="text-[13px] text-ink2 border-l-[3px] border-crit pl-4">
            <p class="font-medium text-ink">Keadaan darurat yang mengancam jiwa?</p>
            <p class="mt-0.5">Hubungi <strong class="text-ink">112</strong> lebih dulu. Formulir ini tidak menggantikan panggilan darurat.</p>
          </div>
        </section>
        <section class="grid sm:grid-cols-3 gap-3" aria-label="Ringkasan">
          ${kpis.map(([l, v, s]) => `
            <div class="card px-4 py-3 flex items-baseline justify-between gap-3">
              <div><p class="text-[13px] text-ink2">${esc(l)}</p><p class="cap">${esc(s)}</p></div>
              <p class="text-[30px] font-semibold leading-none">${v}</p>
            </div>`).join('')}
        </section>
        <section class="grid lg:grid-cols-[1.3fr_1fr] gap-6">
          ${Card({
            title: 'Pengumuman terbaru',
            pad: false,
            actions: link('/pengumuman', 'Semua pengumuman', 'text-[13px] link'),
            children: `<ul>
              ${ann.slice(0, 3).map((a) => `
                <li class="grid grid-cols-[96px_1fr] sm:grid-cols-[96px_1fr_auto] gap-x-3 gap-y-1 px-4 py-3 border-b border-line last:border-0">
                  ${SevBadge(a.severity)}
                  <div class="min-w-0"><p class="text-sm font-medium">${esc(a.title)}</p><p class="cap">${esc(a.jenis)} · ${esc(a.kab)}, ${esc(a.prov)}</p></div>
                  <p class="cap col-start-2 sm:col-start-auto whitespace-nowrap">${fmt(a.at)}</p>
                </li>`).join('')}
            </ul>`,
          })}
          ${Card({ title: 'Sebaran laporan resmi', actions: AutoRefresh(), children: MapPH(aktif, 240) })}
        </section>
      </div>`;
  };
  return {
    title: 'Beranda',
    html: render(),
    mount() { return () => {}; },
  };
}

/* ---------------- Lapor Bencana ---------------- */
export function lapor(ctx = {}) {
  const blank = () => ({ jenis: '', prov: '', kab: '', kec: '', kel: '', alamat: '', deskripsi: '', pelapor: '', hp: '' });
  let f = blank();
  let foto = [];
  let err = {};
  let dup = null;
  let locating = false;
  let drag = false;
  let locTimer = null;
  const sec = 'card p-4 sm:p-5 space-y-4';

  const kabs = () => (f.prov ? Object.keys(WILAYAH[f.prov] || {}) : []);
  const kecs = () => (f.kab ? Object.keys(WILAYAH[f.prov]?.[f.kab] || {}) : []);
  const kels = () => (f.kec ? (WILAYAH[f.prov]?.[f.kab]?.[f.kec] || []) : []);

  const inp = (key, extra = '') => `<input id="${key}" data-model="${key}" class="inp" value="${esc(f[key])}" aria-invalid="${err[key] ? 'true' : 'false'}" ${extra} />`;
  const sel = (key, items, placeholder, disabled = false) => `
    <select id="${key}" data-model="${key}" class="inp" ${disabled ? 'disabled' : ''} aria-invalid="${err[key] ? 'true' : 'false'}">
      ${options(items, f[key], placeholder)}
    </select>`;

  const render = () => {
    const cats = (getDB().categories || []).filter((c) => c.aktif);
    const done = [f.jenis, f.kel, f.alamat.length >= 10, f.deskripsi.length >= 20].filter(Boolean).length;
    return `
      <div>
        ${Crumbs([['Beranda', '/'], ['Lapor Bencana']])}
        <h1 class="h2 mt-3">Lapor Bencana</h1>
        <p class="text-ink2 mt-1 max-w-2xl">Isi 4 bagian di bawah. Kolom bertanda <span class="text-crit">*</span> wajib diisi. Tidak perlu membuat akun.</p>
        <form data-lapor-form novalidate class="grid lg:grid-cols-[1fr_320px] gap-6 mt-6 items-start">
          <div class="space-y-4">
            <section class="${sec}">
              <h2 class="text-base font-semibold"><span class="text-mute mr-2">1</span>Jenis kejadian</h2>
              ${Field({
                label: 'Jenis bencana', req: true, id: 'jenis', error: err.jenis,
                help: 'Pilih yang paling mirip. Jika ragu, pilih yang paling berbahaya.',
                children: sel('jenis', cats.map((c) => c.nama), 'Pilih jenis bencana'),
              })}
            </section>
            <section class="${sec}">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-base font-semibold"><span class="text-mute mr-2">2</span>Lokasi</h2>
                ${Btn(icon('locate-fixed') + (locating ? 'Mencari lokasi…' : 'Gunakan lokasi saya'), { sm: true, attrs: `data-loc ${locating ? 'disabled' : ''}` })}
              </div>
              <div class="grid sm:grid-cols-2 gap-4">
                ${Field({ label: 'Provinsi', req: true, id: 'prov', error: err.prov, children: sel('prov', Object.keys(WILAYAH), 'Pilih provinsi') })}
                ${Field({ label: 'Kabupaten/Kota', req: true, id: 'kab', error: err.kab, children: sel('kab', kabs(), f.prov ? 'Pilih kabupaten/kota' : 'Pilih provinsi dulu', !f.prov) })}
                ${Field({ label: 'Kecamatan', req: true, id: 'kec', error: err.kec, children: sel('kec', kecs(), f.kab ? 'Pilih kecamatan' : 'Pilih kabupaten dulu', !f.kab) })}
                ${Field({ label: 'Kelurahan/Desa', req: true, id: 'kel', error: err.kel, children: sel('kel', kels(), f.kec ? 'Pilih kelurahan/desa' : 'Pilih kecamatan dulu', !f.kec) })}
              </div>
              ${Field({
                label: 'Alamat detail', req: true, id: 'alamat', error: err.alamat,
                help: 'Contoh: Jl. Jatinegara Barat RT 05/RW 02, dekat masjid.',
                children: inp('alamat'),
              })}
            </section>
            <section class="${sec}">
              <h2 class="text-base font-semibold"><span class="text-mute mr-2">3</span>Kejadian</h2>
              ${Field({
                label: 'Deskripsi', req: true, id: 'deskripsi', error: err.deskripsi,
                help: 'Tulis apa yang terjadi, sejak kapan, dan apakah ada orang terluka atau terjebak.',
                children: `<textarea id="deskripsi" data-model="deskripsi" rows="5" maxlength="500" class="inp resize-y" aria-invalid="${err.deskripsi ? 'true' : 'false'}">${esc(f.deskripsi)}</textarea>`,
              })}
              <p class="cap -mt-3 text-right ${f.deskripsi.length > 450 ? 'text-warn' : ''}">${f.deskripsi.length}/500</p>
              <div>
                <p class="lbl">Foto <span class="font-normal text-ink2">(opsional, maks. 5)</span></p>
                <div data-dropzone class="rounded-md border border-dashed px-4 py-5 flex flex-col sm:flex-row sm:items-center gap-3 ${drag ? 'border-navy bg-info-t' : 'border-slate-300 bg-app'}">
                  ${icon('upload', '!w-5 !h-5 text-ink2')}
                  <p class="text-sm text-ink2 flex-1">Seret foto ke sini, atau pilih dari galeri. Foto membantu petugas memeriksa laporan lebih cepat.</p>
                  <div class="flex gap-2">
                    ${Btn(icon('image-plus') + 'Pilih file', { sm: true, attrs: 'data-pick-file' })}
                    ${Btn(icon('camera') + 'Ambil Foto dengan Kamera', { sm: true, attrs: 'data-pick-cam' })}
                  </div>
                  <input data-file-input type="file" accept="image/*" multiple hidden />
                  <input data-cam-input type="file" accept="image/*" capture="environment" hidden />
                </div>
                ${foto.length > 0 ? `<ul class="mt-2 flex flex-wrap gap-2">${foto.map((n, i) => `
                  <li class="flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-sm border border-line bg-white text-xs">
                    ${icon('camera', '!w-3.5 !h-3.5 text-mute')}${esc(n.slice(0, 24))}
                    <button type="button" data-remove-photo="${i}" aria-label="Hapus ${esc(n)}" class="p-0.5 hover:bg-app rounded">${icon('x', '!w-3 !h-3')}</button>
                  </li>`).join('')}</ul>` : ''}
              </div>
            </section>
            <section class="${sec}">
              <h2 class="text-base font-semibold"><span class="text-mute mr-2">4</span>Kontak pelapor <span class="text-sm font-normal text-ink2">(opsional)</span></h2>
              <div class="grid sm:grid-cols-2 gap-4">
                ${Field({ label: 'Nama', id: 'pelapor', help: 'Boleh dikosongkan. Nama tidak ditampilkan ke publik.', children: `<input id="pelapor" data-model="pelapor" class="inp" value="${esc(f.pelapor)}" />` })}
                ${Field({ label: 'Nomor HP', id: 'hp', error: err.hp, help: 'Petugas mungkin menelepon untuk memastikan lokasi.', children: `<input id="hp" data-model="hp" class="inp" inputmode="tel" placeholder="08xx-xxxx-xxxx" value="${esc(f.hp)}" aria-invalid="${err.hp ? 'true' : 'false'}" />` })}
              </div>
            </section>
          </div>
          <aside class="lg:sticky lg:top-20 card p-4 space-y-4">
            <div><h2 class="text-sm font-semibold">Ringkasan laporan</h2><p class="cap">${done}/4 bagian wajib terisi</p>
              <div class="h-1 rounded-full bg-line mt-2"><div class="h-1 rounded-full bg-navy transition-all" style="width: ${done * 25}%"></div></div></div>
            ${DL([
              ['Jenis', f.jenis ? esc(f.jenis) : '—'],
              ['Lokasi', f.kel ? `Kel. ${esc(f.kel)}, ${esc(f.kec)}, ${esc(f.kab)}` : '—'],
              ['Alamat', f.alamat ? esc(f.alamat) : '—'],
              ['Foto', `${foto.length} file`],
            ], 1)}
            ${Alert({ tone: 'info', children: 'Laporan baru berstatus <strong class="text-ink font-medium">Tertunda</strong> sampai diverifikasi petugas.' })}
            ${Btn('Kirim laporan', { v: 'primary', type: 'submit', cls: 'w-full' })}
          </aside>
        </form>
        ${Modal({
          id: 'dup-modal',
          open: !!dup,
          title: 'Laporan aktif sudah ada',
          footer: Btn('Kembali ke formulir', { attrs: 'data-dup-close' }),
          children: dup ? `
            <div class="space-y-4">
              <p class="text-sm text-ink2">Sudah ada laporan <strong class="text-ink font-medium">${esc(dup.jenis)}</strong> yang aktif di <strong class="text-ink font-medium">Kel. ${esc(dup.kel)}</strong>. Satu kejadian hanya dicatat satu kali agar petugas tidak bekerja ganda.</p>
              <div class="rounded-md border border-line p-3 flex flex-wrap items-center gap-3 justify-between">
                <div><p class="text-sm font-semibold">${esc(dup.jenis)} · Kel. ${esc(dup.kel)}</p><p class="cap">Dilaporkan ${fmt(dup.createdAt)}</p></div>
                <div class="flex items-center gap-2">${RStatus(dup)}${link(`/laporan/${encodeURIComponent(dup.code)}`, 'Lihat laporan', 'text-sm link')}</div>
              </div>
              <p class="cap">Laporan baru ditolak karena kejadian yang sama masih aktif.</p>
            </div>` : '',
        })}
      </div>`;
  };

  const up = (key, value) => {
    f = { ...f, [key]: value };
    if (key === 'prov') { f.kab = ''; f.kec = ''; f.kel = ''; }
    if (key === 'kab') { f.kec = ''; f.kel = ''; }
    if (key === 'kec') f.kel = '';
    if (err[key]) { err = { ...err, [key]: '' }; }
    paint(pageRoot, render());
  };

  const addFiles = (files) => {
    if (!files) return;
    foto = [...foto, ...Array.from(files).map((x) => x.name)].slice(0, 5);
    paint(pageRoot, render());
  };

  const useLoc = () => {
    locating = true;
    paint(pageRoot, render());
    const current = f;
    locTimer = setTimeout(() => {
      f = {
        ...f,
        prov: 'DKI Jakarta', kab: 'Kota Jakarta Timur', kec: 'Jatinegara', kel: 'Kampung Melayu',
        alamat: current.alamat || 'Sekitar Jl. Jatinegara Barat (titik GPS -6.2251, 106.8665)',
      };
      locating = false;
      err = {};
      locTimer = null;
      paint(pageRoot, render());
    }, 700);
  };

  const dropClasses = (active) => {
    const zone = pageRoot.querySelector('[data-dropzone]');
    if (!zone) return;
    zone.classList.toggle('border-navy', active);
    zone.classList.toggle('bg-info-t', active);
    zone.classList.toggle('border-slate-300', !active);
    zone.classList.toggle('bg-app', !active);
  };

  const submit = async (event) => {
    event.preventDefault();
    const er = {};
    if (!f.jenis) er.jenis = 'Pilih jenis bencana.';
    if (!f.prov) er.prov = 'Pilih provinsi.';
    else if (!f.kab) er.kab = 'Pilih kabupaten/kota.';
    else if (!f.kec) er.kec = 'Pilih kecamatan.';
    else if (!f.kel) er.kel = 'Pilih kelurahan/desa.';
    if (f.alamat.trim().length < 10) er.alamat = 'Tulis alamat minimal 10 karakter, mis. nama jalan dan RT/RW.';
    if (f.deskripsi.trim().length < 20) er.deskripsi = `Ceritakan kejadian minimal 20 karakter (sekarang ${f.deskripsi.trim().length}).`;
    if (f.hp && !/^0\d{9,12}$/.test(f.hp.replace(/[-\s]/g, ''))) er.hp = 'Nomor HP harus diawali 0 dan berisi 10–13 angka.';
    err = er;
    if (Object.keys(er).length) {
      paint(pageRoot, render());
      pageRoot.querySelector(`#${CSS.escape(Object.keys(er)[0])}`)?.focus();
      return;
    }
    const ex = findActiveResmi(getDB(), f.jenis, f.kel);
    if (ex) { dup = ex; paint(pageRoot, render()); return; }
    try {
      const r = await submitReport({ ...f, pelapor: f.pelapor || 'Anonim', foto: foto.length });
      goTo(ctx, `/lapor/sukses/${r.code}`);
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  let pageRoot = null;
  return {
    title: 'Lapor Bencana',
    html: render(),
    mount(root) {
      pageRoot = root;
      const onInput = (event) => {
        const t = event.target;
        if (t.matches?.('[data-model]') && t.tagName !== 'SELECT' && !t.matches('input[type="file"]')) up(t.dataset.model, t.value);
      };
      const onChange = (event) => {
        const t = event.target;
        if (t.matches?.('[data-file-input], [data-cam-input]')) {
          addFiles(t.files);
          return;
        }
        if (t.matches?.('[data-model]') && t.tagName === 'SELECT') up(t.dataset.model, t.value);
      };
      const onClick = (event) => {
        if (event.target.closest?.('[data-loc]')) { useLoc(); return; }
        if (event.target.closest?.('[data-pick-file]')) { pageRoot.querySelector('[data-file-input]')?.click(); return; }
        if (event.target.closest?.('[data-pick-cam]')) { pageRoot.querySelector('[data-cam-input]')?.click(); return; }
        const rm = event.target.closest?.('[data-remove-photo]');
        if (rm) {
          const i = Number(rm.dataset.removePhoto);
          foto = foto.filter((_, j) => j !== i);
          paint(pageRoot, render());
          return;
        }
        if (event.target.closest?.('[data-dup-close]') || event.target.closest?.('[data-modal-close]')) {
          dup = null;
          paint(pageRoot, render());
        }
      };
      const onSubmitEvt = (event) => {
        if (event.target.matches?.('[data-lapor-form]')) submit(event);
      };
      const onDragOver = (event) => {
        const zone = event.target.closest?.('[data-dropzone]');
        if (!zone) return;
        event.preventDefault();
        drag = true;
        dropClasses(true);
      };
      const onDragLeave = (event) => {
        const zone = event.target.closest?.('[data-dropzone]');
        if (!zone) return;
        drag = false;
        dropClasses(false);
      };
      const onDrop = (event) => {
        const zone = event.target.closest?.('[data-dropzone]');
        if (!zone) return;
        event.preventDefault();
        drag = false;
        dropClasses(false);
        addFiles(event.dataTransfer?.files);
      };
      const onKey = (event) => {
        if (event.key === 'Escape' && dup) {
          dup = null;
          paint(pageRoot, render());
        }
      };
      root.addEventListener('input', onInput);
      root.addEventListener('change', onChange);
      root.addEventListener('click', onClick);
      root.addEventListener('submit', onSubmitEvt);
      root.addEventListener('dragover', onDragOver);
      root.addEventListener('dragleave', onDragLeave);
      root.addEventListener('drop', onDrop);
      window.addEventListener('keydown', onKey);
      return () => {
        if (locTimer) clearTimeout(locTimer);
        root.removeEventListener('input', onInput);
        root.removeEventListener('change', onChange);
        root.removeEventListener('click', onClick);
        root.removeEventListener('submit', onSubmitEvt);
        root.removeEventListener('dragover', onDragOver);
        root.removeEventListener('dragleave', onDragLeave);
        root.removeEventListener('drop', onDrop);
        window.removeEventListener('keydown', onKey);
      };
    },
  };
}

/* ---------------- LaporSukses ---------------- */
export function laporSukses(ctx = {}) {
  const code = ctx.params?.code || '';
  const render = () => {
    const r = byCode(getDB(), code);
    if (!r || !canView(r)) {
      return Empty('Laporan tidak ditemukan.', LinkBtn('/lapor', 'Buat laporan'));
    }
    return `
      <div class="max-w-2xl">
        ${Alert({ tone: 'ok', title: 'Laporan terkirim' })}
        <div class="card p-5 mt-4">
          <p class="cap">Laporan bencana</p>
          <div class="flex flex-wrap items-center gap-3 mt-1">
            <p class="text-2xl font-semibold tracking-tight">Laporan ${esc(r.jenis)} di ${esc(r.kel)}</p>
            ${StatusBadge('Tertunda')}
          </div>
          <p class="text-sm text-ink2 mt-3">Laporan sudah diterima dan akan tampil publik setelah diverifikasi petugas.</p>
          <div class="border-t border-line mt-4 pt-4">${DL([
            ['Jenis', esc(r.jenis)],
            ['Kelurahan', `Kel. ${esc(r.kel)}, ${esc(r.kab)}`],
            ['Waktu kirim', fmt(r.createdAt)],
            ['Foto', `${r.foto} file`],
          ])}</div>
        </div>
        <div class="flex flex-wrap gap-2 mt-4">
          ${LinkBtn('/', 'Kembali ke Beranda', { v: 'primary' })}
          ${LinkBtn('/laporan', 'Lihat Laporan Publik', { v: 'ghost' })}
        </div>
      </div>`;
  };
  return {
    title: 'Laporan terkirim',
    html: render(),
    mount() { return () => {}; },
  };
}

/* ---------------- Laporan Publik ---------------- */
const STATUS_PUB = ['Belum Ditangani', 'Sedang Ditangani', 'Selesai Ditangani', 'Tidak Perlu Tindak Lanjut', 'Case Closed'];

export function laporanPublik(ctx = {}) {
  let filter = {
    jenis: queryGet(ctx, 'jenis'),
    prov: queryGet(ctx, 'prov'),
    status: queryGet(ctx, 'status'),
  };
  let q = '';
  let view = 'list';
  let loading = true;
  let timer = null;
  let chipActions = [];
  let pageRoot = null;

  const rowsFor = (d) => {
    const all = d.reports || [];
    return all
      .filter((r) => isPublic(r) || (isOwn(r) && r.verif === 'Tertunda'))
      .filter((r) => (!filter.jenis || r.jenis === filter.jenis)
        && (!filter.prov || r.prov === filter.prov)
        && (!filter.status || statusOf(r) === filter.status)
        && (!q || `${r.code} ${r.kel} ${r.kab} ${r.jenis}`.toLowerCase().includes(q.toLowerCase())))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  };

  const render = () => {
    const d = getDB();
    const all = d.reports || [];
    const cats = d.categories || [];
    const rows = rowsFor(d);
    const rejected = all.filter((r) => isOwn(r) && r.verif === 'Ditolak');

    const chips = [];
    chipActions = [];
    if (filter.jenis) { chips.push(filter.jenis); chipActions.push(() => setP('jenis', '')); }
    if (filter.prov) { chips.push(filter.prov); chipActions.push(() => setP('prov', '')); }
    if (filter.status) { chips.push(filter.status); chipActions.push(() => setP('status', '')); }
    if (q) { chips.push(`"${q}"`); chipActions.push(() => { q = ''; paint(pageRoot, render()); }); }

    return `
      <div>
        <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div><h1 class="h2">Laporan Publik</h1><p class="text-ink2 mt-1">Laporan Resmi dan laporan Tertunda milik perangkat ini.</p></div>
          ${AutoRefresh()}
        </div>
        <div class="card p-3">
          <div class="flex flex-wrap items-center gap-2">
            <div class="relative flex-1 min-w-[200px]">
              ${icon('search', 'absolute left-2.5 top-1/2 -translate-y-1/2 text-mute')}
              <input class="inp pl-8" placeholder="Cari kode, kelurahan, kabupaten" aria-label="Cari laporan" data-model="q" value="${esc(q)}" />
            </div>
            ${Sel({ label: 'Jenis', name: 'jenis', value: filter.jenis, placeholder: 'Semua jenis', options: cats.map((c) => c.nama) })}
            ${Sel({ label: 'Wilayah', name: 'prov', value: filter.prov, placeholder: 'Semua provinsi', options: Object.keys(WILAYAH) })}
            ${Sel({ label: 'Status penanganan', name: 'status', value: filter.status, placeholder: 'Semua status', options: STATUS_PUB })}
            <div class="inline-flex p-0.5 rounded-md border border-line bg-app ml-auto" role="radiogroup" aria-label="Tampilan">
              <button type="button" role="radio" aria-checked="${view === 'list'}" data-view="list" class="h-8 px-3 inline-flex items-center gap-1.5 rounded-[5px] text-[13px] font-medium ${view === 'list' ? 'bg-white border border-line text-ink' : 'text-ink2 border border-transparent'}">${icon('list')}Daftar</button>
              <button type="button" role="radio" aria-checked="${view === 'map'}" data-view="map" class="h-8 px-3 inline-flex items-center gap-1.5 rounded-[5px] text-[13px] font-medium ${view === 'map' ? 'bg-white border border-line text-ink' : 'text-ink2 border border-transparent'}">${icon('map')}Peta</button>
            </div>
          </div>
          ${Chips(chips)}
        </div>
        ${rejected.map((r) => Alert({ tone: 'crit', title: `${r.code} ditolak`, children: esc(r.rejectReason) })).join('')}
        <p class="cap mt-3 mb-2">${rows.length} laporan</p>
        ${view === 'map'
          ? `<div class="card p-3">${MapPH(rows, 460)}</div>`
          : `<div class="card overflow-hidden">
            ${loading
              ? Skel(6, 4)
              : rows.length === 0
                ? Empty('Tidak ada laporan resmi yang cocok dengan filter.', Btn('Hapus filter', { sm: true, attrs: 'data-clear-filters' }))
                : `
                  <div class="hidden lg:grid grid-cols-[1fr_auto] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_150px_200px_20px] items-center gap-x-6 px-5 h-10 bg-app border-b border-line text-[11px] font-semibold uppercase tracking-wide text-mute">
                    <span>Jenis bencana</span><span>Lokasi</span><span>Dilaporkan</span><span>Status penanganan</span><span></span>
                  </div>
                  <ul class="divide-y divide-line">${rows.map((r) => `
                    <li>
                      <a href="/laporan/${encodeURIComponent(r.code)}" data-link class="group grid grid-cols-[1fr_auto] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_150px_200px_20px] items-center gap-x-6 gap-y-1.5 px-5 py-3.5 hover:bg-app transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-navy">
                        <div class="min-w-0"><p class="text-sm font-medium text-ink truncate">${esc(r.jenis)}</p><p class="text-xs text-mute font-mono mt-0.5">${esc(r.code)}</p></div>
                        <div class="min-w-0 text-sm text-ink2 flex items-start gap-1.5 col-span-2 lg:col-span-1 row-start-2 lg:row-start-auto">${icon('map-pin', 'mt-0.5 shrink-0 text-mute')}<span class="truncate">Kel. ${esc(r.kel)}, ${esc(r.kab)}, ${esc(r.prov)}</span></div>
                        <div class="row-start-3 lg:row-start-auto flex items-center gap-1.5 lg:block"><p class="text-sm text-ink tabular-nums flex items-center gap-1.5">${icon('clock', '!w-3.5 !h-3.5 text-mute lg:hidden')}${rel(r.createdAt)}</p><p class="hidden lg:block text-xs text-mute tabular-nums mt-0.5">${fmt(r.createdAt)}</p></div>
                        <span class="row-start-3 col-start-2 lg:row-start-auto lg:col-start-auto justify-self-end lg:justify-self-start">${RStatus(r)}</span>
                        ${icon('arrow-right', 'hidden lg:block text-mute transition-transform group-hover:translate-x-0.5 group-hover:text-ink')}
                      </a>
                    </li>`).join('')}</ul>`}
          </div>`}
      </div>`;
  };

  const repaint = () => paint(pageRoot, render());

  const setP = (key, value) => {
    filter = { ...filter, [key]: value };
    repaint();
    querySet(ctx, key, value);
  };

  const clearAll = (clearQuery = true) => {
    filter = { jenis: '', prov: '', status: '' };
    q = '';
    chipActions = [];
    repaint();
    if (clearQuery) querySetAll(ctx, {});
  };

  return {
    title: 'Laporan Publik',
    html: render(),
    mount(root) {
      pageRoot = root;
      timer = setTimeout(() => { loading = false; repaint(); }, 500);
      const onInput = (event) => {
        const t = event.target;
        if (t.matches?.('[data-model="q"]')) { q = t.value; repaint(); }
      };
      const onChange = (event) => {
        const t = event.target;
        const key = t.dataset?.sel;
        if (key && ['jenis', 'prov', 'status'].includes(key)) setP(key, t.value);
      };
      const onClick = (event) => {
        const v = event.target.closest?.('[data-view]');
        if (v) { view = v.dataset.view; repaint(); return; }
        const chip = event.target.closest?.('[data-chip]');
        if (chip) { const i = Number(chip.dataset.chip); chipActions[i]?.(); return; }
        if (event.target.closest?.('[data-chip-clear]') || event.target.closest?.('[data-clear-filters]')) clearAll();
      };
      root.addEventListener('input', onInput);
      root.addEventListener('change', onChange);
      root.addEventListener('click', onClick);
      return () => {
        if (timer) clearTimeout(timer);
        root.removeEventListener('input', onInput);
        root.removeEventListener('change', onChange);
        root.removeEventListener('click', onClick);
      };
    },
  };
}

/* ---------------- Detail ---------------- */
export function detailPublik(ctx = {}) {
  const code = ctx.params?.code || '';
  const r0 = byCode(getDB(), code);
  const render = () => {
    const d = getDB();
    const r = byCode(d, code);
    const ann = d.announcements || [];
    if (!r || !canView(r, d)) {
      return `<div>
        ${Crumbs([['Laporan Publik', '/laporan'], ['Detail laporan']])}
        <div class="card mt-4">${Empty('Laporan tidak ditemukan atau belum diverifikasi.', LinkBtn('/laporan', 'Kembali ke daftar'))}</div>
      </div>`;
    }
    const closed = !canUpdate(r, d);
    const related = ann.filter((a) => a.reportCode === r.code || a.kab === r.kab);
    const k = r.korban || {};
    return `
      <div>
        ${Crumbs([['Laporan Publik', '/laporan'], [`${r.jenis} di ${r.kel}`]])}
        <div class="flex flex-wrap items-start justify-between gap-3 mt-3 mb-5">
          <div>
            <div class="flex flex-wrap items-center gap-2"><h1 class="h2">${esc(r.jenis)} · Kel. ${esc(r.kel)}</h1></div>
            <div class="flex flex-wrap items-center gap-2 mt-2">${RStatus(r)}</div>
          </div>
          ${closed
            ? Tip('Pembaruan warga hanya untuk laporan Tertunda milik perangkat ini.', Btn(icon('lock') + 'Tambah pembaruan', { attrs: 'disabled' }))
            : LinkBtn(`/laporan/${encodeURIComponent(r.code)}/susulan`, 'Tambah pembaruan', { v: 'primary' })}
        </div>
        ${r.penanganan === 'Case Closed' ? `<div class="mb-4">${Alert({ tone: 'info', iconName: 'lock', title: `Laporan ditutup pada ${fmt(r.closedAt)}`, children: esc(r.ringkasan) })}</div>` : ''}
        <div class="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
          <div class="space-y-4">
            ${Card({
              title: 'Ringkasan',
              children: `
                ${DL([
                  ['Jenis bencana', esc(r.jenis)],
                  ['Lokasi', `Kel. ${esc(r.kel)}, Kec. ${esc(r.kec)}, ${esc(r.kab)}, ${esc(r.prov)}`],
                  ['Alamat', esc(r.alamat)],
                  ['Dilaporkan', fmt(r.createdAt)],
                  ['Diverifikasi', r.verifiedAt ? fmt(r.verifiedAt) : '—'],
                ])}
                <div class="border-t border-line mt-4 pt-4"><p class="cap mb-1">Deskripsi</p><p class="text-sm">${esc(r.deskripsi)}</p></div>
                <div class="border-t border-line mt-4 pt-4"><p class="cap mb-2">Foto (${r.foto})</p>${Thumbs(r.foto)}</div>`,
            })}
            ${Card({
              title: 'Jumlah korban',
              children: `<div class="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line rounded-md overflow-hidden border border-line">
                ${[
                  ['Luka-luka', k.luka], ['Hilang', k.hilang],
                  ['Meninggal Dunia', k.meninggal], ['Mengungsi/Selamat', k.mengungsi],
                ].map(([l, v]) => `<div class="bg-white p-3"><p class="cap">${esc(l)}</p><p class="text-xl font-semibold">${Number(v || 0).toLocaleString('id-ID')}</p></div>`).join('')}
              </div>`,
            })}
            ${Card({
              title: `Pembaruan susulan (${(r.susulan || []).length})`,
              pad: false,
              children: (r.susulan || []).length === 0
                ? Empty('Belum ada pembaruan dari warga.')
                : `<ul>${[...r.susulan].reverse().map((s) => `
                    <li class="px-4 py-3 border-b border-line last:border-0"><p class="text-sm">${esc(s.isi)}</p><p class="cap mt-1">${esc(s.nama)} · ${fmt(s.at)}${s.foto > 0 ? ` · ${s.foto} foto` : ''}</p></li>`).join('')}</ul>`,
            })}
          </div>
          <div class="space-y-4">
            ${Card({
              title: 'Riwayat status',
              children: Timeline((r.statusHistory || []).map((h) => ({ at: fmt(h.at), title: StatusBadge(h.status) }))),
            })}
            ${Card({
              title: 'Pengumuman terkait',
              pad: false,
              children: related.length === 0
                ? Empty('Tidak ada pengumuman untuk wilayah ini.')
                : `<ul>${related.map((a) => `
                    <li class="px-4 py-3 border-b border-line last:border-0">${SevBadge(a.severity)}<p class="text-sm font-medium mt-1">${esc(a.title)}</p><p class="cap">${fmt(a.at)}</p></li>`).join('')}</ul>`,
            })}
          </div>
        </div>
      </div>`;
  };
  return {
    title: r0 ? `${r0.jenis} · Kel. ${r0.kel}` : 'Detail laporan',
    html: render(),
    mount() { return () => {}; },
  };
}

/* ---------------- Susulan ---------------- */
export function susulan(ctx = {}) {
  const code = ctx.params?.code || '';
  const user0 = me(getDB());
  let isi = '';
  let nama = user0?.nama || '';
  let foto = 0;
  let err = '';
  let pageRoot = null;

  const render = () => {
    const d = getDB();
    const r = byCode(d, code);
    if (!r || !canView(r, d)) {
      return Empty('Laporan tidak ditemukan.', LinkBtn('/laporan', 'Kembali'));
    }
    const closed = !canUpdate(r, d);
    return `
      <div class="max-w-2xl">
        ${Crumbs([['Laporan Publik', '/laporan'], [`${r.jenis} di ${r.kel}`, `/laporan/${encodeURIComponent(r.code)}`], ['Tambah pembaruan']])}
        <h1 class="h2 mt-3">Tambah pembaruan</h1>
        <p class="text-ink2 mt-1">${esc(r.jenis)} · Kel. ${esc(r.kel)}, ${esc(r.kab)}</p>
        ${closed ? `<div class="mt-4">${Alert({ tone: 'crit', title: 'Pembaruan tidak diizinkan. Warga hanya dapat memperbarui laporan Tertunda milik perangkat ini.', children: 'Hubungi BPBD setempat bila ada kejadian baru di lokasi ini.' })}</div>` : ''}
        <form data-susulan-form novalidate class="card p-5 mt-4 space-y-4">
          ${Field({
            label: 'Kondisi terbaru', req: true, id: 'isi', error: err,
            help: 'Contoh: air naik 20 cm, ada warga belum dievakuasi, butuh selimut.',
            children: `<textarea id="isi" data-model="isi" rows="5" maxlength="500" ${closed ? 'disabled' : ''} class="inp" aria-invalid="${err ? 'true' : 'false'}">${esc(isi)}</textarea>`,
          })}
          <p class="cap -mt-3 text-right">${isi.length}/500</p>
          ${Field({ label: 'Nama (opsional)', id: 'nm', children: `<input id="nm" data-model="nama" class="inp" ${closed ? 'disabled' : ''} value="${esc(nama)}" />` })}
          <div><p class="lbl">Foto (opsional)</p>
            <div class="flex items-center gap-2">${Btn(icon('camera') + 'Tambah foto', { sm: true, attrs: `data-add-photo ${closed || foto >= 3 ? 'disabled' : ''}` })}<span class="cap">${foto} foto dipilih</span></div>
            ${foto > 0 ? `<div class="mt-2">${Thumbs(foto, 56)}</div>` : ''}
          </div>
          <div class="flex gap-2 pt-2 border-t border-line">
            ${Btn('Kirim pembaruan', { v: 'primary', type: 'submit', attrs: closed ? 'disabled' : '' })}
            ${LinkBtn(`/laporan/${encodeURIComponent(r.code)}`, 'Batal', { v: 'ghost' })}
          </div>
        </form>
      </div>`;
  };

  const send = async (event) => {
    event.preventDefault();
    const r = byCode(getDB(), code);
    if (!r) return;
    const closed = !canUpdate(r);
    if (closed) return;
    if (isi.trim().length < 10) {
      err = 'Tulis pembaruan minimal 10 karakter.';
      paint(pageRoot, render());
      pageRoot.querySelector('#isi')?.focus();
      return;
    }
    try {
      await addSusulan(r.code, { nama: nama || 'Anonim', isi: isi.trim(), foto });
      goTo(ctx, `/laporan/${r.code}`);
      toast('Pembaruan terkirim dan tampil di laporan.');
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  return {
    title: 'Tambah pembaruan',
    html: render(),
    mount(root) {
      pageRoot = root;
      const onInput = (event) => {
        const t = event.target;
        if (t.dataset?.model === 'isi') { isi = t.value; err = ''; paint(root, render()); }
        else if (t.dataset?.model === 'nama') { nama = t.value; paint(root, render()); }
      };
      const onClick = (event) => {
        if (!event.target.closest?.('[data-add-photo]')) return;
        const r = byCode(getDB(), code);
        if (!r || !canUpdate(r) || foto >= 3) return;
        foto += 1;
        paint(root, render());
      };
      const onSubmit = (event) => {
        if (event.target.matches?.('[data-susulan-form]')) send(event);
      };
      root.addEventListener('input', onInput);
      root.addEventListener('click', onClick);
      root.addEventListener('submit', onSubmit);
      return () => {
        root.removeEventListener('input', onInput);
        root.removeEventListener('click', onClick);
        root.removeEventListener('submit', onSubmit);
      };
    },
  };
}

/* ---------------- Pengumuman ---------------- */
export function pengumumanPublik(ctx = {}) {
  const keys = ['jenis', 'prov', 'kab', 'kec', 'kel', 'kategori'];
  const readFilters = () => {
    const out = {};
    keys.forEach((k) => { out[k] = queryGet(ctx, k); });
    return out;
  };
  let filter = readFilters();
  let chipActions = [];
  let pageRoot = null;

  const rowsFor = (d) => {
    const ann = d.announcements || [];
    return ann
      .filter((a) => (!filter.jenis || a.jenis === filter.jenis)
        && (!filter.prov || a.prov === filter.prov)
        && (!filter.kab || a.kab === filter.kab)
        && (!filter.kec || a.kec === filter.kec)
        && (!filter.kel || a.kel === filter.kel)
        && (!filter.kategori || a.severity === filter.kategori))
      .sort((a, b) => +new Date(b.at) - +new Date(a.at));
  };

  const render = () => {
    const d = getDB();
    const cats = (d.categories || []).filter((c) => c.aktif);
    const rows = rowsFor(d);
    const kabs = filter.prov ? Object.keys(WILAYAH[filter.prov] || {}) : [];
    const kecs = filter.prov && filter.kab ? Object.keys(WILAYAH[filter.prov]?.[filter.kab] || {}) : [];
    const kels = filter.prov && filter.kab && filter.kec ? (WILAYAH[filter.prov]?.[filter.kab]?.[filter.kec] || []) : [];

    const chips = [];
    chipActions = [];
    if (filter.jenis) { chips.push(`Bencana: ${filter.jenis}`); chipActions.push(() => setP('jenis', '')); }
    if (filter.prov) { chips.push(`Provinsi: ${filter.prov}`); chipActions.push(() => setLocation('prov', '')); }
    if (filter.kab) { chips.push(`Kabupaten/kota: ${filter.kab}`); chipActions.push(() => setLocation('kab', '')); }
    if (filter.kec) { chips.push(`Kecamatan: ${filter.kec}`); chipActions.push(() => setLocation('kec', '')); }
    if (filter.kel) { chips.push(`Kelurahan/desa: ${filter.kel}`); chipActions.push(() => setLocation('kel', '')); }
    if (filter.kategori) { chips.push(`Label: ${filter.kategori}`); chipActions.push(() => setP('kategori', '')); }

    return `
      <div>
        <div class="flex flex-wrap items-end justify-between gap-3 mb-4"><div><h1 class="h2">Pengumuman</h1><p class="text-ink2 mt-1">Diterbitkan oleh petugas BPBD untuk wilayah masing-masing.</p></div>${AutoRefresh()}</div>
        <div class="card p-4">
          <div class="grid gap-4">
            <div>
              <p class="text-sm font-semibold mb-2">Kategori</p>
              <div class="grid sm:grid-cols-2 gap-2">
                ${Field({ label: 'Kategori bencana', children: Sel({ className: '!w-full', label: 'Kategori bencana', name: 'jenis', value: filter.jenis, placeholder: 'Semua kategori bencana', options: cats.map((c) => c.nama) }) })}
                ${Field({ label: 'Jenis pengumuman', children: Sel({ className: '!w-full', label: 'Jenis pengumuman', name: 'kategori', value: filter.kategori, placeholder: 'Semua jenis pengumuman', options: ['Evakuasi', 'Peringatan', 'Imbauan', 'Informasi'] }) })}
              </div>
            </div>
            <div class="pt-4 border-t border-line">
              <p class="text-sm font-semibold mb-2">Lokasi</p>
              <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                ${Field({ label: 'Provinsi', children: Sel({ className: '!w-full', label: 'Provinsi', name: 'prov', value: filter.prov, placeholder: 'Semua provinsi', options: Object.keys(WILAYAH) }) })}
                ${Field({ label: 'Kabupaten/kota', children: Sel({ className: '!w-full', label: 'Kabupaten atau kota', name: 'kab', value: filter.kab, placeholder: filter.prov ? 'Semua kabupaten/kota' : 'Pilih provinsi dahulu', options: kabs, disabled: !filter.prov }) })}
                ${Field({ label: 'Kecamatan', children: Sel({ className: '!w-full', label: 'Kecamatan', name: 'kec', value: filter.kec, placeholder: filter.kab ? 'Semua kecamatan' : 'Pilih kabupaten/kota dahulu', options: kecs, disabled: !filter.kab }) })}
                ${Field({ label: 'Kelurahan/desa', children: Sel({ className: '!w-full', label: 'Kelurahan atau desa', name: 'kel', value: filter.kel, placeholder: filter.kec ? 'Semua kelurahan/desa' : 'Pilih kecamatan dahulu', options: kels, disabled: !filter.kec }) })}
              </div>
            </div>
          </div>
          ${Chips(chips)}
        </div>
        <p class="cap mt-3 mb-2">${rows.length} pengumuman</p>
        <div class="card">
          ${rows.length === 0
            ? Empty('Tidak ada pengumuman untuk filter ini.', Btn('Hapus filter', { sm: true, attrs: 'data-clear-filters' }))
            : rows.map((a) => `
              <article class="grid md:grid-cols-[110px_1fr_200px] gap-x-4 gap-y-2 px-4 py-4 border-b border-line last:border-0">
                <div>${SevBadge(a.severity)}</div>
                <div class="min-w-0"><p class="cap mb-1">Jenis bencana</p><div class="mb-1.5">${Badge('navy', esc(a.jenis), { dot: false })}</div><h2 class="text-base font-semibold">${esc(a.title)}</h2><div class="mt-1.5">${MD(a.body || '')}</div>
                  ${a.reportCode ? link(`/laporan/${encodeURIComponent(a.reportCode)}`, 'Lihat laporan terkait', 'text-[13px] link mt-2 inline-block') : ''}</div>
                <div class="cap md:text-right"><p>Lokasi</p><p class="text-ink font-medium">${esc(a.kel)}, ${esc(a.kec)}</p><p>${esc(a.kab)}</p><p>${esc(a.prov)}</p><p class="mt-1">${fmt(a.at)}</p></div>
              </article>`).join('')}
        </div>
      </div>`;
  };

  const repaint = () => paint(pageRoot, render());

  const setP = (key, value) => {
    filter = { ...filter, [key]: value };
    repaint();
    querySet(ctx, key, value);
  };

  const setLocation = (key, value) => {
    const levels = ['prov', 'kab', 'kec', 'kel'];
    const next = { ...filter, [key]: value };
    levels.slice(levels.indexOf(key) + 1).forEach((level) => { next[level] = ''; });
    filter = next;
    repaint();
    querySetAll(ctx, next);
  };

  const clearFilters = () => {
    filter = {};
    keys.forEach((k) => { filter[k] = ''; });
    repaint();
    querySetAll(ctx, {});
  };

  return {
    title: 'Pengumuman',
    html: render(),
    mount(root) {
      pageRoot = root;
      const onChange = (event) => {
        const key = event.target.dataset?.sel;
        if (!key || !keys.includes(key)) return;
        if (['prov', 'kab', 'kec', 'kel'].includes(key)) setLocation(key, event.target.value);
        else setP(key, event.target.value);
      };
      const onClick = (event) => {
        const chip = event.target.closest?.('[data-chip]');
        if (chip) { const i = Number(chip.dataset.chip); chipActions[i]?.(); return; }
        if (event.target.closest?.('[data-chip-clear]') || event.target.closest?.('[data-clear-filters]')) clearFilters();
      };
      root.addEventListener('change', onChange);
      root.addEventListener('click', onClick);
      return () => {
        root.removeEventListener('change', onChange);
        root.removeEventListener('click', onClick);
      };
    },
  };
}

/* ---------------- Masuk ---------------- */
export function masuk(ctx = {}) {
  let email = '';
  let pw = '';
  let keep = true;
  let err = {};
  let pageRoot = null;

  const render = () => {
    const users = getDB().users || [];
    return `
      <div class="grid lg:grid-cols-[400px_1fr] gap-8 items-start max-w-4xl">
        <div class="card p-6">
          <h1 class="h3">Masuk</h1>
          <p class="text-sm text-ink2 mt-1">Untuk petugas BPBD, relawan terdaftar, dan admin sistem.</p>
          ${err.form ? `<div class="mt-4">${Alert({ tone: err.off ? 'warn' : 'crit', title: err.form, children: err.off ? 'Hubungi admin BPBD provinsi untuk mengaktifkan kembali.' : '' })}</div>` : ''}
          <form data-masuk-form novalidate class="space-y-4 mt-4">
            ${Field({ label: 'Email atau nama pengguna', id: 'em', error: err.email, children: `<input id="em" data-model="email" class="inp" autocomplete="username" value="${esc(email)}" aria-invalid="${err.email ? 'true' : 'false'}" />` })}
            ${Field({ label: 'Kata sandi', id: 'pw', error: err.pw, children: `<input id="pw" data-model="pw" type="password" class="inp" autocomplete="current-password" value="${esc(pw)}" aria-invalid="${err.pw ? 'true' : 'false'}" />` })}
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-keep class="accent-navy w-4 h-4" ${keep ? 'checked' : ''} />Tetap masuk selama penugasan</label>
            ${Btn('Masuk', { v: 'primary', type: 'submit', cls: 'w-full' })}
          </form>
        </div>
        <div class="space-y-4">
          <div class="rounded-lg border border-dashed border-slate-300 p-4 bg-white">
            <div class="flex items-center gap-2">${Badge('slate', 'Demo', { dot: false })}<h2 class="text-sm font-semibold">Pratinjau peran</h2></div>
            <p class="cap mt-1">Hanya untuk prototipe. Tidak tersedia di sistem produksi.</p>
            <div class="flex flex-wrap gap-2 mt-3">
              ${Btn('Masuk sebagai Petugas', { attrs: 'data-demo="u1"' })}
              ${Btn('Masuk sebagai Relawan', { attrs: 'data-demo="u7"' })}
              ${Btn('Masuk sebagai Admin', { attrs: 'data-demo="a1"' })}
            </div>
          </div>
          <div class="text-[13px] text-ink2 space-y-1.5">
            <p class="flex gap-1.5">${icon('info', 'mt-0.5 text-mute')}Data dari branch <code class="text-ink">ken</code>. Kata sandi bawaan <code class="text-ink">appb2026</code>; admin dapat menggantinya per akun. Coba <code class="text-ink">admin_demo</code> atau <code class="text-ink">petugas_medan_demo</code>.</p>
            <p>Warga tidak perlu akun untuk melapor. ${link('/lapor', 'Lapor Bencana', 'link')}</p>
          </div>
        </div>
      </div>`;
  };

  const go = async (id, password = 'appb2026', onError) => {
    try {
      const result = await login(id, password);
      const u = (getDB().users || []).find((x) => x.id === id) || {};
      const role = result?.role || u.role || 'warga';
      goTo(ctx, role === 'admin' ? '/admin' : role === 'relawan' ? '/relawan' : '/petugas');
    } catch (error) {
      if (onError) onError(error);
      else toast(error.message, 'error');
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const er = {};
    if (!email) er.email = 'Isi email atau nama pengguna.';
    if (!pw) er.pw = 'Isi kata sandi.';
    if (er.email || er.pw) { err = er; paint(pageRoot, render()); return; }
    const identifier = email.trim();
    const users = getDB().users || [];
    const u = users.find((x) => x.email.toLowerCase() === identifier.toLowerCase() || x.email.split('@')[0] === identifier);
    await go(u?.id || identifier, pw, (error) => {
      err = {
        form: error.message,
        off: /tidak aktif|dinonaktifkan/i.test(error.message),
      };
      if (pageRoot) paint(pageRoot, render());
    });
  };

  return {
    title: 'Masuk',
    html: render(),
    mount(root) {
      pageRoot = root;
      const onInput = (event) => {
        const t = event.target;
        if (t.dataset?.model === 'email') { email = t.value; err = {}; paint(root, render()); }
        else if (t.dataset?.model === 'pw') { pw = t.value; err = {}; paint(root, render()); }
      };
      const onChange = (event) => {
        if (event.target.matches?.('[data-keep]')) { keep = event.target.checked; paint(root, render()); }
      };
      const onClick = async (event) => {
        const demo = event.target.closest?.('[data-demo]');
        if (demo) await go(demo.dataset.demo);
      };
      const onSubmit = (event) => {
        if (event.target.matches?.('[data-masuk-form]')) submit(event);
      };
      root.addEventListener('input', onInput);
      root.addEventListener('change', onChange);
      root.addEventListener('click', onClick);
      root.addEventListener('submit', onSubmit);
      return () => {
        root.removeEventListener('input', onInput);
        root.removeEventListener('change', onChange);
        root.removeEventListener('click', onClick);
        root.removeEventListener('submit', onSubmit);
      };
    },
  };
}

/* ---------------- NotFound ---------------- */
export function notFound(ctx = {}) {
  return {
    title: 'Halaman tidak ditemukan',
    html: `<div class="max-w-md">
      <p class="cap">Kode 404</p>
      <h1 class="h2 mt-1">Halaman tidak ditemukan</h1>
      <p class="text-ink2 mt-2">Alamat yang Anda buka tidak tersedia.</p>
      <div class="mt-4">${LinkBtn('/', 'Kembali ke Beranda')}</div>
    </div>`,
    mount() { return () => {}; },
  };
}

/* Aliases ( lowers + PascalCase ) */
export const Beranda = beranda;
export const Lapor = lapor;
export const LaporSukses = laporSukses;
export const LaporanPublik = laporanPublik;
export const DetailPublik = detailPublik;
export const Susulan = susulan;
export const PengumumanPublik = pengumumanPublik;
export const Masuk = masuk;
export const NotFound = notFound;

/* Legacy import name kept as an alias so older routers keep working. */
export const pengumuman = pengumumanPublik;
