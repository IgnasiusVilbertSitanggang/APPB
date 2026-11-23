import { start } from './router.js';
import * as pub from './pages/public.js';
import * as petugas from './pages/petugas.js';
import * as admin from './pages/admin.js';
import * as config from './pages/config.js';
import { design } from './pages/design.js';

const routes = [
  { path: '/', view: pub.beranda },
  { path: '/lapor', view: pub.lapor },
  { path: '/lapor/sukses/:code', view: pub.laporSukses },
  { path: '/laporan', view: pub.laporanPublik },
  { path: '/laporan/:code/susulan', view: pub.susulan },
  { path: '/laporan/:code', view: pub.detailPublik },
  { path: '/pengumuman', view: pub.pengumumanPublik },
  { path: '/masuk', view: pub.masuk },
  { path: '/_design', view: design },

  { path: '/petugas', area: 'petugas', view: petugas.dashboard },
  { path: '/petugas/verifikasi', area: 'petugas', view: petugas.verifikasi },
  { path: '/petugas/penanganan', area: 'petugas', view: petugas.penangananList },
  { path: '/petugas/penanganan/:code', area: 'petugas', view: petugas.penangananDetail },
  { path: '/petugas/bantuan', area: 'petugas', view: admin.bantuan },
  { path: '/petugas/laporan-publik', area: 'petugas', view: petugas.laporanPublikOperasional },
  { path: '/petugas/pengumuman', area: 'petugas', view: petugas.buatPengumuman },
  { path: '/petugas/log', area: 'petugas', view: petugas.logPage },

  { path: '/relawan', area: 'relawan', view: petugas.dashboard },
  { path: '/relawan/penanganan', area: 'relawan', view: petugas.penangananList },
  { path: '/relawan/penanganan/:code', area: 'relawan', view: petugas.penangananDetail },
  { path: '/relawan/laporan-publik', area: 'relawan', view: petugas.laporanPublikOperasional },
  { path: '/relawan/log', area: 'relawan', view: petugas.logPage },

  { path: '/admin', area: 'admin', view: admin.dashboard },
  { path: '/admin/import', area: 'admin', redirect: '/admin/import/wilayah' },
  { path: '/admin/import/wilayah', area: 'admin', view: admin.importWilayah },
  { path: '/admin/petugas', area: 'admin', view: () => admin.kelolaAkun('petugas') },
  { path: '/admin/relawan', area: 'admin', view: () => admin.kelolaAkun('relawan') },
  { path: '/admin/bantuan', area: 'admin', view: admin.bantuan },
  { path: '/admin/kategori', area: 'admin', view: admin.kategori },
  { path: '/admin/historis', area: 'admin', view: admin.historis },
  { path: '/admin/koreksi', area: 'admin', view: admin.koreksi },
  { path: '/admin/konfigurasi', area: 'admin', view: config.konfigurasi },
  { path: '/admin/log', area: 'admin', view: petugas.logPage },

  { path: '*', view: pub.notFound },
];

start(routes, document.getElementById('app'));
