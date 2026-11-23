import { CONFIG } from './config.js';
import { getDB, me, session } from './store.js';
import { KAB_POS } from './wilayah.js';

/* ------------------------------------------------------------------ */
/* Format & dasar — mengikuti src/data/store.ts + src/components/ui.tsx  */
/* ------------------------------------------------------------------ */

const dateFull = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
});
const timeOnly = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const dateOnly = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
});

export const fmt = (iso) => (iso ? `${dateFull.format(new Date(iso))} WIB` : '—');
export const fmtTime = (iso) => (iso ? `${timeOnly.format(new Date(iso))} WIB` : '—');
export const fmtDate = (iso) => (iso ? dateOnly.format(new Date(iso)) : '—');

export function rel(iso) {
  if (!iso) return '—';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} mnt lalu`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} jam lalu`;
  return `${Math.floor(minutes / 1440)} hari lalu`;
}

export function esc(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function icon(name, cls = '') {
  return `<i data-lucide="${esc(name)}"${cls ? ` class="${cls}"` : ''}></i>`;
}

export function refreshIcons(root = document) {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons({ attrs: { 'stroke-width': 1.5 } });
  }
}

export function link(to, text, cls = '') {
  return `<a href="${esc(to)}" data-link class="${cls}">${text}</a>`;
}
export const navigateLink = link;

export function paint(root, html, focusKey) {
  let active = null;
  if (focusKey === undefined && document.activeElement && root.contains(document.activeElement)) {
    const el = document.activeElement;
    if (el.dataset && el.dataset.model) active = { key: el.dataset.model, start: el.selectionStart, end: el.selectionEnd };
  } else if (focusKey) {
    active = typeof focusKey === 'string' ? { key: focusKey } : focusKey;
  }
  root.innerHTML = html;
  refreshIcons(root);
  if (active?.key) {
    const el = root.querySelector(`[data-model="${CSS.escape(active.key)}"]`);
    if (el) {
      el.focus();
      if (active.start !== undefined && el.setSelectionRange) {
        try { el.setSelectionRange(active.start, active.end ?? active.start); } catch { /* input type tertentu */ }
      }
    }
  }
}

export function afterFakeLoad(ms, done) {
  return setTimeout(done, ms);
}

/** Mirrors `useFakeLoad` from the original React UI. */
export function useFakeLoad(ms = 500) {
  const state = { loading: true };
  const timer = setTimeout(() => { state.loading = false; }, ms);
  return { state, timer };
}

/* ------------------------------------------------------------------ */
/* Button, badge, form                                                  */
/* ------------------------------------------------------------------ */

const BTN_BASE = 'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_SIZE = { md: 'h-9 px-3.5 text-sm', sm: 'h-8 px-2.5 text-[13px]' };
const BTN_VARIANT = {
  primary: 'bg-navy text-white hover:bg-navyh',
  secondary: 'bg-white text-ink border border-line hover:bg-app',
  ghost: 'text-ink2 hover:bg-app hover:text-ink',
  danger: 'bg-crit text-white hover:bg-[#991b1b]',
};

export function Btn(label, { v = 'secondary', sm = false, cls = '', attrs = '', type = 'button' } = {}) {
  return `<button type="${type}" class="${BTN_BASE} ${sm ? BTN_SIZE.sm : BTN_SIZE.md} ${BTN_VARIANT[v] || BTN_VARIANT.secondary} ${cls}" ${attrs}>${label}</button>`;
}

export function LinkBtn(to, label, { v = 'secondary', cls = '' } = {}) {
  const vs = {
    primary: 'bg-navy text-white hover:bg-navyh',
    secondary: 'bg-white text-ink border border-line hover:bg-app',
    ghost: 'text-ink2 hover:bg-app',
    danger: 'bg-crit text-white',
  };
  return `<a href="${esc(to)}" data-link class="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${vs[v] || vs.secondary} ${cls}">${label}</a>`;
}

const TONES = {
  slate: 'bg-slate-100 text-slate-700', amber: 'bg-warn-t text-warn', blue: 'bg-info-t text-info',
  red: 'bg-crit-t text-crit', green: 'bg-ok-t text-ok', dark: 'bg-slate-700 text-white', navy: 'bg-info-t text-navy',
};
const DOT = {
  slate: 'bg-slate-500', amber: 'bg-warn', blue: 'bg-info', red: 'bg-crit',
  green: 'bg-ok', dark: 'bg-white', navy: 'bg-navy',
};

export function Badge(tone = 'slate', children = '', { dot = true, iconName = '' } = {}) {
  const inner = iconName
    ? `<span class="[&_svg]:!w-3 [&_svg]:!h-3">${icon(iconName)}</span>`
    : dot ? `<span class="w-1.5 h-1.5 rounded-full ${DOT[tone] || DOT.slate}"></span>` : '';
  return `<span class="inline-flex items-center gap-1.5 h-[22px] px-1.5 rounded-sm text-xs font-medium whitespace-nowrap ${TONES[tone] || TONES.slate}">${inner}${children}</span>`;
}

export function HistBadge() { return Badge('slate', 'Historis', { dot: false }); }
export function severityBadge(s) {
  const tone = { Evakuasi: 'red', Peringatan: 'amber', Imbauan: 'blue', Informasi: 'slate' }[s] || 'slate';
  return Badge(tone, esc(s));
}
export const SevBadge = severityBadge;

export function statusOf(r) {
  if (!r) return '—';
  return r.verif === 'Resmi' ? (r.penanganan || 'Belum Ditangani') : r.verif;
}

const STATUS_TONE = {
  Tertunda: 'amber', Resmi: 'blue', Ditolak: 'red', 'Belum Ditangani': 'amber',
  'Sedang Ditangani': 'blue', 'Selesai Ditangani': 'green',
  'Tidak Perlu Tindak Lanjut': 'slate', 'Case Closed': 'dark',
};

export function StatusBadge(s) {
  return Badge(STATUS_TONE[s] || 'slate', esc(s), { iconName: s === 'Case Closed' ? 'lock' : '' });
}
export function RStatus(r) { return StatusBadge(statusOf(r)); }
export function badge(s) { return StatusBadge(s); }

export function Field({ label = '', help = '', error = '', children = '', req = false, id = '' } = {}) {
  return `<div>
    <label${id ? ` for="${esc(id)}"` : ''} class="lbl">${esc(label)}${req ? '<span class="text-crit ml-0.5" aria-hidden>*</span>' : ''}</label>
    ${children}
    ${error ? `<p class="err" role="alert">${icon('circle-x', '!w-3.5 !h-3.5')}${esc(error)}</p>` : help ? `<p class="help">${esc(help)}</p>` : ''}
  </div>`;
}

export function field(label, control, help = '') {
  return Field({ label, children: control, help });
}

export function options(items, selected = '', placeholder = '— Pilih —') {
  const head = placeholder === null ? '' : `<option value="">${esc(placeholder)}</option>`;
  return head + items.map((item) => {
    const value = typeof item === 'string' ? item : item.value;
    const text = typeof item === 'string' ? item : item.text;
    return `<option value="${esc(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(text)}</option>`;
  }).join('');
}

export function Sel({ value = '', options: items = [], placeholder = '', label = '', className = '', disabled = false, name = '', attrs = '' } = {}) {
  return `<select aria-label="${esc(label)}" ${name ? `data-sel="${esc(name)}" data-model="${esc(name)}"` : ''} class="inp !w-auto min-w-[150px] ${className}" ${disabled ? 'disabled' : ''} ${attrs}>
    ${options(items, value, placeholder)}
  </select>`;
}

export function Toggle({ on = false, label = '', disabled = false, name = '' } = {}) {
  return `<button type="button" role="switch" aria-checked="${on}" aria-label="${esc(label)}" ${name ? `data-toggle="${esc(name)}"` : ''} ${disabled ? 'disabled' : ''}
    class="relative inline-flex items-center shrink-0 w-9 h-5 p-0.5 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-50 disabled:cursor-not-allowed ${on ? 'bg-ok' : 'bg-slate-300'}">
    <span class="block w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? 'translate-x-4' : 'translate-x-0'}"></span>
  </button>`;
}

export function Segmented({ value = '', options: items = [], label = '', name = '', disabled = false } = {}) {
  return `<div role="radiogroup" aria-label="${esc(label)}" class="inline-flex p-0.5 rounded-md border border-line bg-app">
    ${items.map((o) => `<button type="button" role="radio" aria-checked="${value === o}" ${disabled ? 'disabled' : ''} ${name ? `data-segment="${esc(name)}"` : ''} data-value="${esc(o)}"
      class="h-7 px-3 rounded-[5px] text-[13px] font-medium transition-colors disabled:cursor-not-allowed ${value === o ? 'bg-white text-ink border border-line' : 'text-ink2 hover:text-ink border border-transparent'}">${esc(o)}</button>`).join('')}
  </div>`;
}

export function Stepper({ value = 0, label = '', name = '', disabled = false } = {}) {
  return `<div class="inline-flex items-center rounded-md border border-line bg-white h-9" data-stepper="${esc(name)}">
    <button type="button" aria-label="Kurangi ${esc(label)}" ${disabled || value <= 0 ? 'disabled' : ''} data-step="-1" class="w-8 h-full grid place-items-center text-ink2 hover:bg-app disabled:opacity-40">${icon('minus')}</button>
    <input aria-label="${esc(label)}" ${disabled ? 'disabled' : ''} value="${value}" data-step-input="${esc(name)}" class="w-16 h-full text-center border-x border-line text-sm disabled:bg-app" inputmode="numeric" />
    <button type="button" aria-label="Tambah ${esc(label)}" ${disabled ? 'disabled' : ''} data-step="1" class="w-8 h-full grid place-items-center text-ink2 hover:bg-app disabled:opacity-40">${icon('plus')}</button>
  </div>`;
}

export function Steps({ steps = [], current = 0 } = {}) {
  return `<ol class="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
    ${steps.map((s, i) => `<li class="flex items-center gap-2">
      <span class="w-6 h-6 rounded-full grid place-items-center text-xs font-semibold border ${i < current ? 'bg-navy border-navy text-white' : i === current ? 'border-navy text-navy bg-info-t' : 'border-line text-mute bg-white'}">${i < current ? icon('check', '!w-3.5 !h-3.5') : i + 1}</span>
      <span class="${i === current ? 'font-medium text-ink' : 'text-ink2'}">${esc(s)}</span>
      ${i < steps.length - 1 ? '<span class="w-6 sm:w-10 h-px bg-line"></span>' : ''}
    </li>`).join('')}
  </ol>`;
}

/* ------------------------------------------------------------------ */
/* Layout bits                                                          */
/* ------------------------------------------------------------------ */

export function Crumbs(items = []) {
  return `<nav aria-label="Breadcrumb" class="flex items-center gap-1 text-[13px] text-ink2 min-w-0">
    ${items.map(([label, to], i) => `<span class="flex items-center gap-1 min-w-0">
      ${i > 0 ? icon('chevron-right', '!w-3.5 !h-3.5 text-mute') : ''}
      ${to ? link(to, esc(label), 'hover:text-ink truncate') : `<span class="text-ink font-medium truncate">${esc(label)}</span>`}
    </span>`).join('')}
  </nav>`;
}

export function PageHead({ title = '', desc = '', actions = '', meta = '' } = {}) {
  return `<div class="flex flex-wrap items-end justify-between gap-3 mb-5">
    <div class="min-w-0"><h1 class="h2">${esc(title)}</h1>
      ${desc ? `<p class="text-ink2 mt-1 max-w-3xl">${desc}</p>` : ''}${meta}</div>
    ${actions ? `<div class="flex flex-wrap gap-2">${actions}</div>` : ''}
  </div>`;
}

export function Card({ title = '', actions = '', children = '', className = '', pad = true } = {}) {
  return `<section class="card ${className}">
    ${title ? `<header class="flex items-center justify-between gap-2 px-4 h-12 border-b border-line"><h2 class="text-sm font-semibold">${title}</h2>${actions}</header>` : ''}
    <div class="${pad ? 'p-4' : ''}">${children}</div>
  </section>`;
}

export function KPI({ label = '', value = '', sub = '', tone = '' } = {}) {
  const bar = tone === 'crit' ? 'bg-crit' : tone === 'warn' ? 'bg-warn' : tone === 'ok' ? 'bg-ok' : 'bg-navy';
  return `<div class="card p-4 relative overflow-hidden">
    <span class="absolute left-0 top-0 h-full w-[3px] ${bar}"></span>
    <p class="cap">${esc(label)}</p>
    <p class="text-[30px] leading-tight font-semibold mt-1">${value}</p>
    ${sub ? `<p class="cap mt-1">${sub}</p>` : ''}
  </div>`;
}

export function DL(items = [], cols = 2) {
  return `<dl class="grid gap-x-6 gap-y-3 ${cols === 2 ? 'sm:grid-cols-2' : ''}">
    ${items.map(([k, v]) => `<div class="min-w-0"><dt class="cap">${esc(k)}</dt><dd class="text-sm text-ink mt-0.5 break-words">${v}</dd></div>`).join('')}
  </dl>`;
}

const ALERT_TONE = {
  info: ['bg-info-t border-blue-200 text-info', 'info'],
  warn: ['bg-warn-t border-amber-200 text-warn', 'triangle-alert'],
  crit: ['bg-crit-t border-red-200 text-crit', 'circle-x'],
  ok: ['bg-ok-t border-green-200 text-ok', 'circle-check-big'],
};

export function Alert({ tone = 'info', title = '', children = '', iconName = '' } = {}) {
  const [color, defaultIcon] = ALERT_TONE[tone] || ALERT_TONE.info;
  return `<div role="${tone === 'crit' ? 'alert' : 'status'}" class="flex gap-2.5 rounded-md border px-3 py-2.5 text-sm ${color}">
    <span class="mt-0.5">${icon(iconName || defaultIcon)}</span>
    <div class="min-w-0">${title ? `<p class="font-medium">${esc(title)}</p>` : ''}${children ? `<div class="text-ink2">${children}</div>` : ''}</div>
  </div>`;
}

export function Empty(text = '', action = '') {
  return `<div class="px-4 py-10 text-sm text-ink2 flex flex-col items-start gap-3 sm:items-center"><p>${esc(text)}</p>${action}</div>`;
}
export const empty = Empty;

export function Skel(rows = 5, cols = 5) {
  return `<div class="p-3 space-y-3" aria-busy="true" aria-label="Memuat data">
    ${Array.from({ length: rows }).map(() => `<div class="flex gap-4">${Array.from({ length: cols }).map((_, j) => `<div class="skel h-4 flex-1" style="max-width:${j === 0 ? 120 : 'none'}px"></div>`).join('')}</div>`).join('')}
  </div>`;
}
export function skeleton() { return Skel(5, 5); }
export const errorBox = (message) => Alert({ tone: 'crit', title: 'Terjadi kesalahan', children: esc(message) });

export function Thumbs(n = 0, size = 72) {
  if (!n) return '<p class="cap">Tidak ada foto.</p>';
  return `<ul class="flex flex-wrap gap-2">${Array.from({ length: n }).map((_, i) => `
    <li class="rounded-md bg-slate-100 border border-line grid place-items-center text-mute" style="width:${size}px;height:${size}px" aria-label="Foto ${i + 1}">${icon('camera', '!w-5 !h-5')}</li>`).join('')}</ul>`;
}

export function Timeline(items = []) {
  return `<ol class="relative">${items.map((it, i) => `
    <li class="relative pl-6 pb-4 last:pb-0">
      ${i < items.length - 1 ? '<span class="absolute left-[5px] top-3 bottom-0 w-px bg-line"></span>' : ''}
      <span class="absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-navy bg-white"></span>
      <div class="text-sm">${it.title}</div>
      <p class="cap">${esc(it.at)}${it.by ? ` · ${esc(it.by)}` : ''}</p>
      ${it.body ? `<div class="text-sm text-ink2 mt-1">${it.body}</div>` : ''}
    </li>`).join('')}</ol>`;
}

export function Tip(text = '', children = '') {
  return `<span class="relative inline-flex group" tabIndex="0" aria-label="${esc(text)}">
    ${children}
    <span role="tooltip" class="pointer-events-none absolute bottom-full left-0 mb-2 w-max max-w-[260px] rounded-md bg-ink text-white text-xs px-2 py-1.5 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">${esc(text)}</span>
  </span>`;
}

/* ------------------------------------------------------------------ */
/* Overlay                                                              */
/* ------------------------------------------------------------------ */

export function Modal({ id = 'modal', title = '', children = '', footer = '', wide = false, open = false } = {}) {
  return `<div id="${esc(id)}" class="${open ? '' : 'hidden '}fixed inset-0 z-50 grid place-items-center p-4 anim-fade" data-modal>
    <div class="absolute inset-0 bg-slate-900/40" data-modal-close></div>
    <div role="dialog" aria-modal="true" aria-label="${esc(title)}" class="relative w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] flex flex-col bg-white rounded-lg border border-line shadow-[0_12px_32px_-8px_rgba(15,23,42,.25)] anim-rise">
      <header class="flex items-center justify-between gap-3 px-5 h-14 border-b border-line shrink-0">
        <h2 class="text-base font-semibold">${esc(title)}</h2>
        <button type="button" data-modal-close aria-label="Tutup" class="p-1.5 rounded-md text-ink2 hover:bg-app">${icon('x')}</button>
      </header>
      <div class="p-5 overflow-y-auto">${children}</div>
      ${footer ? `<footer class="flex flex-wrap justify-end gap-2 px-5 py-3 border-t border-line bg-app rounded-b-lg shrink-0">${footer}</footer>` : ''}
    </div>
  </div>`;
}

export function Drawer({ id = 'drawer', title = '', sub = '', children = '', footer = '', open = false } = {}) {
  return `<div id="${esc(id)}" class="${open ? '' : 'hidden '}fixed inset-0 z-40 anim-fade" data-drawer>
    <div class="absolute inset-0 bg-slate-900/30" data-modal-close></div>
    <aside role="dialog" aria-modal="true" aria-label="${esc(title)}" class="absolute right-0 top-0 h-full w-full max-w-[520px] bg-white border-l border-line flex flex-col anim-slide shadow-[0_12px_32px_-8px_rgba(15,23,42,.25)]">
      <header class="flex items-start justify-between gap-3 px-5 py-4 border-b border-line">
        <div class="min-w-0"><h2 class="text-base font-semibold">${esc(title)}</h2>${sub}</div>
        <button type="button" data-modal-close aria-label="Tutup" class="p-1.5 rounded-md text-ink2 hover:bg-app">${icon('x')}</button>
      </header>
      <div class="flex-1 overflow-y-auto p-5">${children}</div>
      ${footer ? `<footer class="flex flex-wrap gap-2 px-5 py-3 border-t border-line bg-app">${footer}</footer>` : ''}
    </aside>
  </div>`;
}

export function openOverlay(root, id) {
  const el = root.querySelector(`#${CSS.escape(id)}`);
  if (el) el.classList.remove('hidden');
}
export function closeOverlay(root, id) {
  const el = root.querySelector(`#${CSS.escape(id)}`);
  if (el) el.classList.add('hidden');
}
export const mountModal = (root, id) => ({
  open: () => openOverlay(root, id),
  close: () => closeOverlay(root, id),
});

export function Toasts() {
  return `<div class="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[min(380px,calc(100vw-2rem))]" aria-live="polite" id="toast-list"></div>`;
}

export function toast(text = '', kind = 'success') {
  const root = document.getElementById('toast-list') || document.getElementById('toast-root');
  if (!root) return;
  const color = kind === 'error' ? 'text-red-300' : kind === 'info' ? 'text-blue-300' : 'text-green-300';
  const ico = kind === 'error' ? 'circle-x' : kind === 'info' ? 'info' : 'circle-check-big';
  const node = document.createElement('div');
  node.className = 'anim-rise flex items-start gap-2.5 rounded-md bg-ink text-white px-3.5 py-3 text-sm shadow-[0_12px_32px_-8px_rgba(15,23,42,.35)]';
  node.innerHTML = `<span class="${color}">${icon(ico)}</span><span>${esc(text)}</span>`;
  root.appendChild(node);
  refreshIcons(node);
  setTimeout(() => node.remove(), CONFIG.toastDuration);
}

/* ------------------------------------------------------------------ */
/* Peta skematis                                                        */
/* ------------------------------------------------------------------ */

export function MapPH(reports = [], height = 280, onPick = false) {
  const pins = reports.map((r, i) => {
    const [x, y] = KAB_POS[r.kab] || [300, 200];
    return { r, x: x + ((i * 7) % 11) - 5, y: y + ((i * 5) % 9) - 4 };
  });
  const col = (r) => (r.verif === 'Tertunda' ? '#64748B' : '#15803D');
  return `<div class="relative rounded-md border border-line bg-[#F1F5F9] overflow-hidden" style="height:${height}px">
    <svg viewBox="140 60 420 200" preserveAspectRatio="xMidYMid slice" class="w-full h-full" role="img" aria-label="Peta sebaran ${reports.length} laporan">
      <defs><pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#E2E8F0" strokeWidth=".5" /></pattern></defs>
      <rect x="0" y="0" width="700" height="400" fill="url(#g)" />
      <g fill="#E2E8F0" stroke="#CBD5E1" strokeWidth=".6">
        <path d="M150 70 L185 92 L215 125 L240 160 L248 185 L230 182 L205 160 L180 130 L160 100 Z" />
        <path d="M248 192 L290 195 L340 205 L370 212 L372 222 L330 222 L290 218 L255 210 Z" />
        <path d="M385 218 L400 220 L410 226 L398 228 Z" /><path d="M412 222 L430 224 L426 232 L412 230 Z" />
        <path d="M290 105 L340 90 L380 100 L395 130 L375 165 L330 172 L300 150 Z" />
        <path d="M470 90 L500 85 L492 110 L515 115 L500 130 L515 160 L490 150 L485 125 L470 140 L475 110 Z" />
      </g>
      ${pins.map(({ r, x, y }) => `<g class="${onPick ? 'cursor-pointer' : ''}" ${onPick ? `data-pin="${esc(r.code)}"` : ''}>
        <circle cx="${x}" cy="${y}" r="5.5" fill="${col(r)}" fillOpacity=".18" />
        <circle cx="${x}" cy="${y}" r="2.6" fill="${col(r)}" stroke="#fff" strokeWidth=".8"><title>${esc(`${r.code} · ${r.jenis} · Kel. ${r.kel}`)}</title></circle>
      </g>`).join('')}
    </svg>
    <div class="absolute left-2 bottom-2 flex flex-wrap gap-x-3 gap-y-1 bg-white/95 border border-line rounded-md px-2 py-1 text-[11px] text-ink2">
      ${[['#B91C1C', 'Besar'], ['#B45309', 'Sedang'], ['#15803D', 'Kecil']].map(([c, l]) => `<span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full" style="background:${c}"></span>${l}</span>`).join('')}
    </div>
    <span class="absolute right-2 top-2 text-[11px] text-ink2 bg-white/95 border border-line rounded px-1.5 py-0.5">Peta skematis · bukan skala</span>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Tabel data (mengikuti DataTable di src/components/ui.tsx)             */
/* ------------------------------------------------------------------ */

export function DataTable(rows = [], cols = [], opts = {}) {
  const id = opts.id || 'dt';
  const state = opts.state || {};
  const sort = state.sort || opts.initialSort || null;
  const size = state.size || 10;
  const wantedPage = state.page || 0;
  const dense = state.dense || false;
  const sel = new Set(state.sel || []);
  const rowKey = opts.rowKey || ((r) => r.id);
  const sorted = sort
    ? [...rows].sort((a, b) => {
        const c = cols.find((x) => x.key === sort[0]);
        if (!c?.sort) return 0;
        const va = c.sort(a), vb = c.sort(b);
        return (va < vb ? -1 : va > vb ? 1 : 0) * (sort[1] === 'asc' ? 1 : -1);
      })
    : rows;
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const p = Math.min(wantedPage, pages - 1);
  const view = sorted.slice(p * size, p * size + size);
  const allOn = view.length > 0 && view.every((r) => sel.has(rowKey(r)));
  const py = dense ? 'py-1.5' : 'py-2.5';
  const clearSelection = () => { sel.clear(); };
  const bulkHtml = sel.size > 0 && opts.bulk ? `<span class="text-sm font-medium">${sel.size} dipilih</span>${opts.bulk([...sel], clearSelection)}` : (opts.toolbar || '');
  return `<div class="card overflow-hidden" data-table="${esc(id)}">
    <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-line min-h-12">
      <div class="flex flex-wrap items-center gap-2">${bulkHtml}</div>
      <div class="flex items-center gap-1 ml-auto">
        <span class="cap mr-1">${rows.length} baris</span>
        <button type="button" data-table-dense aria-label="${dense ? 'Kerapatan normal' : 'Kerapatan rapat'}" title="${dense ? 'Kerapatan normal' : 'Kerapatan rapat'}" class="p-1.5 rounded-md text-ink2 hover:bg-app">${icon(dense ? 'rows-3' : 'rows-4')}</button>
      </div>
    </div>
    <div class="overflow-auto max-h-[640px]">
      ${opts.loading ? Skel(6, Math.min(cols.length, 6)) : rows.length === 0
        ? (opts.empty || Empty('Tidak ada data yang cocok dengan filter.'))
        : `<table class="w-full text-sm border-separate border-spacing-0">
          <thead class="sticky top-0 z-[1]"><tr>
            ${opts.selectable ? `<th class="th w-10"><input type="checkbox" aria-label="Pilih semua di halaman ini" data-select-all ${allOn ? 'checked' : ''} class="accent-navy" /></th>` : ''}
            ${cols.map((c) => `<th class="th ${c.className || ''}" aria-sort="${sort?.[0] === c.key ? (sort[1] === 'asc' ? 'ascending' : 'descending') : ''}">
              ${c.sort ? `<button type="button" data-sort-key="${esc(c.key)}" class="inline-flex items-center gap-1 hover:text-ink">${c.header}${sort?.[0] === c.key ? icon(sort[1] === 'asc' ? 'chevron-up' : 'chevron-down', '!w-3.5 !h-3.5') : icon('chevrons-up-down', '!w-3.5 !h-3.5 text-mute')}</button>` : c.header}
            </th>`).join('')}
          </tr></thead>
          <tbody>${view.map((r) => {
            const k = String(rowKey(r));
            return `<tr data-row-key="${esc(k)}" ${opts.onRow ? 'tabindex="0"' : ''} class="${opts.onRow ? 'cursor-pointer' : ''} hover:bg-app ${sel.has(k) ? 'bg-info-t/60' : ''} ${opts.rowClass ? opts.rowClass(r) : ''}">
              ${opts.selectable ? `<td class="td ${py}" data-no-row><input type="checkbox" aria-label="Pilih baris ${esc(k)}" data-select-row="${esc(k)}" ${sel.has(k) ? 'checked' : ''} class="accent-navy" /></td>` : ''}
              ${cols.map((c) => `<td class="td ${py} ${c.className || ''}">${c.render(r)}</td>`).join('')}
            </tr>`;
          }).join('')}</tbody>
        </table>`}
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-line text-[13px] text-ink2">
      <label class="flex items-center gap-2">Baris per halaman
        <select data-table-size class="h-7 rounded-md border border-line bg-white px-1.5">${[10, 25, 50].map((n) => `<option${size === n ? ' selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <div class="flex items-center gap-2">
        <span>${sorted.length ? `${p * size + 1}–${Math.min(sorted.length, (p + 1) * size)} dari ${sorted.length}` : '0 dari 0'}</span>
        ${Btn('Sebelumnya', { sm: true, attrs: `data-table-page="-1" ${p === 0 ? 'disabled' : ''} aria-label="Halaman sebelumnya"` })}
        ${Btn('Berikutnya', { sm: true, attrs: `data-table-page="1" ${p >= pages - 1 ? 'disabled' : ''} aria-label="Halaman berikutnya"` })}
      </div>
    </div>
  </div>`;
}

export function mountTable(root, id, opts, onState) {
  const el = root.querySelector(`[data-table="${CSS.escape(id)}"]`);
  if (!el) return;
  const state = opts.state || {};
  const rows = opts.rows || [];
  const rowKey = opts.rowKey || ((r) => r.id);
  const commit = () => onState(state);

  el.addEventListener('click', (event) => {
    const sortBtn = event.target.closest('[data-sort-key]');
    if (sortBtn) {
      const key = sortBtn.dataset.sortKey;
      state.sort = state.sort?.[0] === key ? [key, state.sort[1] === 'asc' ? 'desc' : 'asc'] : [key, 'asc'];
      state.page = 0;
      commit();
      return;
    }
    if (event.target.closest('[data-table-dense]')) {
      state.dense = !state.dense;
      commit();
      return;
    }
    const pageBtn = event.target.closest('[data-table-page]');
    if (pageBtn) {
      const size = state.size || 10;
      const pages = Math.max(1, Math.ceil(rows.length / size));
      state.page = Math.max(0, Math.min(pages - 1, (state.page || 0) + Number(pageBtn.dataset.tablePage)));
      commit();
      return;
    }
    if (event.target.closest('[data-clear-selection]')) {
      state.sel = [];
      commit();
      return;
    }
    if (event.target.closest('input, button, a, [data-no-row]')) return;
    const tr = event.target.closest('[data-row-key]');
    if (tr && opts.onRow) {
      const row = rows.find((r) => String(rowKey(r)) === tr.dataset.rowKey);
      if (row) opts.onRow(row);
    }
  });

  el.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const tr = event.target.closest('[data-row-key]');
    if (tr && opts.onRow) {
      const row = rows.find((r) => String(rowKey(r)) === tr.dataset.rowKey);
      if (row) opts.onRow(row);
    }
  });

  el.addEventListener('change', (event) => {
    if (event.target.matches('[data-select-all]')) {
      const size = state.size || 10;
      const page = state.page || 0;
      const sorted = state.sort ? [...rows].sort((a, b) => {
        const c = (opts.cols || []).find((x) => x.key === state.sort[0]);
        if (!c?.sort) return 0;
        const va = c.sort(a), vb = c.sort(b);
        return (va < vb ? -1 : va > vb ? 1 : 0) * (state.sort[1] === 'asc' ? 1 : -1);
      }) : rows;
      const view = sorted.slice(page * size, page * size + size);
      const next = new Set(state.sel || []);
      const allOn = view.length > 0 && view.every((r) => next.has(String(rowKey(r))));
      view.forEach((r) => allOn ? next.delete(String(rowKey(r))) : next.add(String(rowKey(r))));
      state.sel = [...next];
      commit();
      return;
    }
    const rowBox = event.target.closest('[data-select-row]');
    if (rowBox) {
      const next = new Set(state.sel || []);
      const k = rowBox.dataset.selectRow;
      next.has(k) ? next.delete(k) : next.add(k);
      state.sel = [...next];
      commit();
      return;
    }
    if (event.target.matches('[data-table-size]')) {
      state.size = Number(event.target.value);
      state.page = 0;
      commit();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Chips & markdown                                                     */
/* ------------------------------------------------------------------ */

export function Chips(items = []) {
  if (!items.length) return '';
  return `<div class="flex flex-wrap items-center gap-1.5 mt-2">
    ${items.map(([label], i) => `<span class="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-sm bg-info-t text-navy text-xs font-medium">
      ${esc(label)}<button type="button" data-chip="${i}" aria-label="Hapus filter ${esc(label)}" class="p-0.5 rounded hover:bg-blue-100">${icon('x', '!w-3 !h-3')}</button>
    </span>`).join('')}
    <button type="button" data-chip-clear class="text-xs text-ink2 hover:text-ink underline underline-offset-2 ml-1">Hapus semua</button>
  </div>`;
}

function markdownInline(s = '', k = '') {
  const parts = String(s).split(/(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((p, i) => {
    if (/^\*\*.+\*\*$/.test(p)) return `<strong class="font-semibold">${esc(p.slice(2, -2))}</strong>`;
    if (/^_.+_$/.test(p)) return `<em>${esc(p.slice(1, -1))}</em>`;
    const m = p.match(/^\[(.+)\]\((.+)\)$/);
    if (m) return `<a href="${esc(m[2])}" class="link" target="_blank" rel="noreferrer">${esc(m[1])}</a>`;
    return `<span>${esc(p)}</span>`;
  }).join('');
}

export function MD(text = '') {
  const lines = String(text).split('\n');
  const out = [];
  let list = [];
  const flush = () => {
    if (!list.length) return;
    out.push(`<ul class="list-disc pl-5 space-y-0.5">${list.map((l, i) => `<li>${markdownInline(l, i)}</li>`).join('')}</ul>`);
    list = [];
  };
  lines.forEach((line, i) => {
    if (line.startsWith('- ')) list.push(line.slice(2));
    else { flush(); if (line.trim()) out.push(`<p>${markdownInline(line, i)}</p>`); }
  });
  flush();
  return `<div class="space-y-1.5 text-sm text-ink">${out.join('')}</div>`;
}

export function downloadCSV(name, rows = []) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function confirmAction(message) { return window.confirm(message); }

export function table(headers = [], rows = []) {
  if (!rows.length) return Empty('Tidak ada data yang cocok dengan filter.');
  return `<div class="card overflow-hidden"><div class="overflow-auto max-h-[640px]">
    <table class="w-full text-sm border-separate border-spacing-0">
      <thead class="sticky top-0 z-[1]"><tr>${headers.map((h) => `<th class="th">${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((cells) => `<tr class="hover:bg-app">${cells.map((c) => `<td class="td py-2.5">${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  </div></div>`;
}

/* ------------------------------------------------------------------ */
/* Shell (mengikuti src/components/Layouts.tsx)                         */
/* ------------------------------------------------------------------ */

function Wordmark(to = '/', compact = false) {
  return `<a href="${esc(to)}" data-link class="flex items-center gap-2.5 min-w-0" aria-label="APPB Beranda">
    <span class="grid place-items-center w-8 h-8 rounded-md bg-navy text-white text-[11px] font-semibold tracking-wide shrink-0">APPB</span>
    ${compact ? '' : '<span class="hidden sm:block text-[13px] leading-tight text-ink2 max-w-[220px]">Aplikasi Pelaporan dan Pengelolaan Bencana</span>'}
  </a>`;
}

export function OfflineBanner() {
  const d = getDB();
  if (!d.offline) return '';
  return `<div data-offline-slot role="status" class="flex items-center gap-2 px-4 h-8 text-[13px] bg-warn-t text-warn border-b border-amber-200">${icon('wifi-off')}Koneksi tidak stabil. Data akan dimuat ulang otomatis.</div>`;
}

export function AutoRefresh() {
  const d = getDB();
  return `<span data-autorefresh class="inline-flex items-center gap-1.5 text-xs text-ink2" aria-live="polite">
    <span class="w-2 h-2 rounded-full ${d.offline ? 'bg-warn' : 'bg-ok'}"></span>
    Diperbarui otomatis tiap 10 detik · terakhir ${fmtTime(d.lastSync)}
  </span>`;
}

const NAV_GROUPS = {
  petugas: [
    ['Operasional', [['/petugas', 'Dashboard', 'layout-dashboard'], ['/petugas/verifikasi', 'Verifikasi', 'shield-check'], ['/petugas/penanganan', 'Penanganan', 'activity'], ['/petugas/bantuan', 'Bantuan', 'package-open']]],
    ['Informasi', [['/petugas/laporan-publik', 'Laporan Publik', 'file-text'], ['/petugas/pengumuman', 'Pengumuman', 'megaphone'], ['/petugas/log', 'Log', 'scroll-text']]],
  ],
  relawan: [
    ['Operasional', [['/relawan', 'Dashboard', 'layout-dashboard'], ['/relawan/penanganan', 'Penanganan', 'activity']]],
    ['Informasi', [['/relawan/laporan-publik', 'Laporan Publik', 'file-text'], ['/relawan/log', 'Log', 'scroll-text']]],
  ],
  admin: [
    ['Ringkasan', [['/admin', 'Dashboard', 'layout-dashboard']]],
    ['Data master', [['/admin/import/wilayah', 'Data Wilayah', 'map-pinned'], ['/admin/petugas', 'Petugas', 'users'], ['/admin/relawan', 'Relawan', 'users'], ['/admin/kategori', 'Kategori Bencana', 'tags'], ['/admin/historis', 'Data Historis', 'history']]],
    ['Operasional', [['/admin/bantuan', 'Bantuan', 'package-open'], ['/admin/koreksi', 'Koreksi Laporan', 'file-pen-line']]],
    ['Konfigurasi', [['/admin/konfigurasi', 'Konfigurasi DB & Tampilan', 'settings']]],
    ['Audit', [['/admin/log', 'Log', 'scroll-text']]],
  ],
};

function sideNav(area, rail, pending, path) {
  return `<nav aria-label="Navigasi aplikasi" class="flex-1 overflow-y-auto py-3">
    ${NAV_GROUPS[area].map(([group, items]) => `<div class="mb-3">
      <p class="px-4 pb-1 text-[11px] font-medium uppercase tracking-wider text-mute ${rail ? 'md:hidden xl:block' : ''}">${esc(group)}</p>
      ${items.map(([to, label, ico]) => {
        const active = to === `/${area}` ? path === to : path === to || path.startsWith(`${to}/`);
        return `<a href="${esc(to)}" data-link title="${esc(label)}" class="relative flex items-center gap-2.5 h-9 px-4 text-sm ${rail ? 'md:justify-center xl:justify-start' : ''} ${active ? 'text-navy font-medium bg-info-t before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-navy' : 'text-ink2 hover:bg-app hover:text-ink'}">
          ${icon(ico, '!w-[18px] !h-[18px]')}
          <span class="${rail ? 'md:hidden xl:inline' : ''}">${esc(label)}</span>
          ${label === 'Verifikasi' && pending > 0 ? `<span data-pending-count class="ml-auto text-[11px] font-semibold bg-warn-t text-warn rounded-sm px-1.5 ${rail ? 'md:hidden xl:inline' : ''}">${pending}</span>` : ''}
        </a>`;
      }).join('')}
    </div>`).join('')}
  </nav>`;
}

export function Forbidden(area = 'petugas', inactive = false) {
  const role = area === 'admin' ? 'admin sistem' : area;
  return `<div class="min-h-screen bg-app grid place-items-start sm:place-items-center p-6">
    <div class="max-w-md">
      <p class="cap font-medium">Kode 403</p>
      <h1 class="h2 mt-1 flex items-center gap-2">${icon('shield-alert', '!w-5 !h-5 text-crit')}Akses ditolak</h1>
      <p class="text-ink2 mt-2">${inactive ? 'Akun Anda sudah dinonaktifkan. Hubungi admin BPBD untuk mengaktifkannya kembali.' : `Halaman ini hanya untuk ${role}. Masuk dengan akun ${role} yang aktif untuk melanjutkan.`}</p>
      <div class="flex gap-2 mt-5">${LinkBtn('/', 'Kembali ke Beranda')}${LinkBtn('/masuk', 'Masuk', { v: 'primary' })}</div>
    </div>
  </div>`;
}

function publicHeader(ctx = {}) {
  const role = session.role();
  const path = ctx.path || window.location.pathname;
  const links = [['/', 'Beranda'], ['/laporan', 'Laporan Publik'], ['/pengumuman', 'Pengumuman']];
  const nav = (cls = '') => links.map(([to, label]) => {
    const active = to === '/' ? path === '/' : path.startsWith(to);
    return `<a href="${esc(to)}" data-link class="${cls} px-3 h-9 inline-flex items-center rounded-md text-sm ${active ? 'text-navy font-medium bg-info-t' : 'text-ink2 hover:text-ink hover:bg-app'}">${label}</a>`;
  }).join('');
  const dashTo = role === 'admin' ? '/admin' : role === 'relawan' ? '/relawan' : '/petugas';
  return `<header class="bg-white border-b border-line sticky top-0 z-30">
    <div class="w-full mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 h-14 flex items-center gap-4">
      ${Wordmark()}
      <nav class="hidden md:flex items-center gap-1 ml-4" aria-label="Navigasi utama">${nav()}</nav>
      <div class="ml-auto hidden md:flex items-center gap-2">
        ${LinkBtn('/lapor', 'Lapor Bencana', { v: 'primary' })}
        ${role === 'warga' ? LinkBtn('/masuk', 'Masuk', { v: 'ghost' }) : LinkBtn(dashTo, 'Ke Dashboard')}
      </div>
      <button type="button" class="md:hidden ml-auto p-2 rounded-md hover:bg-app" aria-label="Menu" data-mobile-menu aria-expanded="false">${icon('menu', '!w-5 !h-5')}</button>
    </div>
    <nav class="md:hidden border-t border-line px-4 py-3 flex-col gap-1 anim-fade hidden" data-mobile-nav>
      ${nav('w-full')}
      <div class="flex gap-2 pt-2">${LinkBtn('/lapor', 'Lapor Bencana', { v: 'primary', cls: 'flex-1' })}${LinkBtn('/masuk', 'Masuk', { cls: 'flex-1' })}</div>
    </nav>
  </header>`;
}

function publicFooter() {
  return `<footer class="border-t border-line bg-white">
    <div class="w-full mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-5 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink2">
      <span>Darurat: <strong class="text-ink font-semibold">112</strong></span>
      <span>Call Center BNPB: <strong class="text-ink font-semibold">117</strong></span>
      <span>Dikelola oleh BNPB bersama BPBD provinsi dan kabupaten/kota</span>
      ${link('/_design', 'Komponen & status', 'ml-auto hover:text-ink')}
    </div>
  </footer>`;
}

function appLayout(content, ctx = {}) {
  const d = getDB();
  const area = ctx.area;
  const user = me(d) || {};
  const path = ctx.path || window.location.pathname;
  const pending = d.reports.filter((r) => r.verif === 'Tertunda').length;
  const notifs = d.logs.slice(0, 6);
  const groups = NAV_GROUPS[area];
  const all = groups.flatMap((g) => g[1]);
  const current = [...all].sort((a, b) => b[0].length - a[0].length)
    .find(([to]) => path === to || path.startsWith(`${to}/`));
  const sub = current && path !== current[0] ? path.split('/').pop() : null;
  const areaLabel = area === 'admin' ? 'Admin' : area === 'relawan' ? 'Relawan' : 'Petugas';
  const consoleLabel = area === 'admin' ? 'Konsol Admin' : area === 'relawan' ? 'Konsol Relawan' : 'Konsol Petugas';
  return `<div class="min-h-screen bg-app">
    <aside class="hidden md:flex fixed inset-y-0 left-0 z-30 flex-col bg-white border-r border-line w-16 xl:w-60">
      <div class="h-14 flex items-center px-4 border-b border-line md:justify-center xl:justify-start">
        <span>${Wordmark(`/${area}`, true)}</span>
        <span class="hidden xl:block ml-2.5 text-xs text-ink2 leading-tight">${consoleLabel}</span>
      </div>
      ${sideNav(area, true, pending, path)}
      <div class="border-t border-line p-3 text-[11px] text-mute md:hidden xl:block">Versi 2.4.1 · Server Jakarta-1</div>
    </aside>
    <div class="md:hidden fixed inset-0 z-40 anim-fade hidden" data-app-drawer>
      <div class="absolute inset-0 bg-slate-900/30" data-drawer-close></div>
      <aside class="absolute inset-y-0 left-0 w-64 bg-white border-r border-line flex flex-col anim-slide">
        <div class="h-14 flex items-center justify-between px-4 border-b border-line">${Wordmark(`/${area}`, true)}<button type="button" data-drawer-close aria-label="Tutup menu" class="p-1.5 rounded-md hover:bg-app">${icon('x')}</button></div>
        ${sideNav(area, false, pending, path)}
      </aside>
    </div>
    <div class="min-w-0 md:pl-16 xl:pl-60">
      <header class="sticky top-0 z-20 h-14 bg-white border-b border-line flex items-center gap-3 px-4 lg:px-6">
        <button type="button" class="md:hidden p-1.5 -ml-1.5 rounded-md hover:bg-app" aria-label="Buka menu" data-drawer-open>${icon('menu', '!w-5 !h-5')}</button>
        <nav aria-label="Breadcrumb" class="hidden sm:flex items-center gap-1 text-[13px] text-ink2 min-w-0">
          <span>${areaLabel}</span><span class="text-mute">/</span>
          ${sub ? `${link(current[0], esc(current[1]), 'hover:text-ink')}<span class="text-mute">/</span><span class="text-ink font-medium truncate">${esc(sub)}</span>` : `<span class="text-ink font-medium">${esc(current?.[1] || '')}</span>`}
        </nav>
        <form class="ml-auto relative w-full max-w-[280px] lg:max-w-[360px] min-w-0" role="search" data-global-search>
          ${icon('search', 'absolute left-2.5 top-1/2 -translate-y-1/2 text-mute')}
          <input placeholder="Cari kode laporan, mis. 00123" aria-label="Pencarian global" class="inp !h-8 pl-8 text-[13px]" data-search-input />
        </form>
        <div class="relative">
          <button type="button" aria-label="Notifikasi, ${pending} baru" class="relative p-2 rounded-md text-ink2 hover:bg-app" data-bell>${icon('bell', '!w-5 !h-5')}
            ${pending > 0 ? `<span data-bell-count class="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-sm bg-crit text-white text-[10px] font-semibold grid place-items-center">${pending}</span>` : ''}
          </button>
          <div class="absolute right-0 top-11 w-[min(360px,calc(100vw-2rem))] card shadow-[0_12px_32px_-8px_rgba(15,23,42,.25)] anim-rise hidden" data-bell-panel>
            <p class="px-4 h-10 flex items-center border-b border-line text-sm font-semibold">Notifikasi</p>
            <ul class="max-h-80 overflow-y-auto">${notifs.map((l) => `<li class="px-4 py-2.5 border-b border-line last:border-0 text-[13px]">
              <p><span class="font-medium">${esc(l.aksi)}</span>${l.code ? ` · <span class="text-navy">${esc(l.code)}</span>` : ''}</p>
              <p class="cap">${esc(l.actor)} · ${rel(l.at)}</p></li>`).join('')}</ul>
            ${link(`/${area}/log`, 'Lihat semua log', 'block px-4 h-10 leading-10 text-[13px] link border-t border-line')}
          </div>
        </div>
        <div class="relative">
          <button type="button" aria-expanded="false" class="flex items-center gap-2 h-9 pl-1 pr-2 rounded-md hover:bg-app" data-user-menu>
            <span class="w-7 h-7 rounded-full bg-slate-200 text-ink text-xs font-semibold grid place-items-center">${esc((user.nama || '?').split(' ').map((s) => s[0]).slice(0, 2).join(''))}</span>
            <span class="hidden lg:block text-left leading-tight"><span class="block text-[13px] font-medium">${esc(user.nama || '')}</span><span class="block text-[11px] text-ink2">${esc(user.instansi || '')}</span></span>
            ${icon('chevron-down', 'text-mute')}
          </button>
          <div class="absolute right-0 top-11 w-64 card shadow-[0_12px_32px_-8px_rgba(15,23,42,.25)] anim-rise p-1 hidden" data-user-panel>
            <div class="px-3 py-2.5 border-b border-line mb-1">
              <p class="text-sm font-medium">${esc(user.nama || '')}</p><p class="cap truncate">${esc(user.email || '')}</p>
              <div class="mt-1.5">${Badge(session.role() === 'admin' ? 'dark' : 'navy', session.role() === 'admin' ? 'Admin Sistem' : session.role() === 'relawan' ? 'Relawan' : 'Petugas')}</div>
            </div>
            ${link('/', 'Lihat situs publik', 'flex items-center gap-2 px-3 h-9 rounded-md text-sm text-ink2 hover:bg-app')}
            <button type="button" data-action="logout" class="w-full flex items-center gap-2 px-3 h-9 rounded-md text-sm text-crit hover:bg-crit-t">${icon('log-out')}Keluar</button>
          </div>
        </div>
      </header>
      <main data-page class="p-4 lg:p-6 2xl:p-8 w-full">${content}</main>
    </div>
    ${Toasts()}
  </div>`;
}

/** Pasang shell ke root. Tanpa `area` → layout publik; dengan `area` → layout aplikasi. */
export function mountShell(root, ctx = {}, content = '') {
  if (ctx.area) {
    root.innerHTML = appLayout(content, ctx);
  } else {
    const d = getDB();
    const emergency = d.announcements.find((a) => a.severity === 'Evakuasi');
    root.innerHTML = `<div class="min-h-screen flex flex-col">
      ${emergency ? `<div class="bg-crit text-white text-[13px]">
        <div class="w-full mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-2 flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-2">
          ${icon('triangle-alert', 'mt-0.5 sm:mt-0')}
          <p class="min-w-0"><span class="font-semibold">${esc(emergency.severity.toUpperCase())} · ${esc(emergency.kab)}:</span> ${esc(emergency.title)}.</p>
          ${link('/pengumuman', 'Baca pengumuman', 'ml-auto underline underline-offset-2 whitespace-nowrap')}
        </div>
      </div>` : ''}
      ${publicHeader(ctx)}
      ${OfflineBanner()}
      <main data-page class="flex-1 min-w-0 w-full mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-6 sm:py-8">${content}</main>
      ${publicFooter()}
      ${Toasts()}
    </div>`;
  }
  refreshIcons(root);
  return root;
}

export function updateShellStatus(root) {
  const d = getDB();
  root.querySelectorAll('[data-autorefresh]').forEach((el) => { el.outerHTML = AutoRefresh(); });
  const slot = root.querySelector('[data-offline-slot]');
  if (slot) slot.outerHTML = OfflineBanner();
  else if (d.offline && !root.querySelector('[data-offline-slot]')) {
    const header = root.querySelector('header');
    if (header) header.insertAdjacentHTML('beforebegin', OfflineBanner());
  }
  const pending = d.reports.filter((r) => r.verif === 'Tertunda').length;
  root.querySelectorAll('[data-pending-count], [data-bell-count]').forEach((el) => {
    el.textContent = String(pending);
    el.classList.toggle('hidden', pending === 0);
  });
  refreshIcons(root);
}
