'use strict';
/* Seans — kişisel film ve dizi arşivi.
   Veri kaynağı: TMDB. Kayıtlar sadece bu cihazın tarayıcısında saklanır. */

/* ============ Yardımcılar ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt1 = n => (n == null || isNaN(n)) ? '—' : (Math.round(n * 10) / 10).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtInt = n => Math.round(n).toLocaleString('tr-TR');
const IMG = 'https://image.tmdb.org/t/p/';
const img = (p, size = 'w342') => p ? IMG + size + p : '';
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

async function runLimited(tasks, limit) {
  const out = new Array(tasks.length); let i = 0;
  const worker = async () => { while (i < tasks.length) { const k = i++; try { out[k] = await tasks[k](); } catch { out[k] = null; } } };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}

/* ============ Sabitler ============ */
const TYPES = {
  movie: { label: 'Film', plural: 'Filmler', one: 'film', acc: 'filmi' },
  tv: { label: 'Dizi', plural: 'Diziler', one: 'dizi', acc: 'diziyi' },
};
const GENRES = {
  movie: { 28: 'Aksiyon', 12: 'Macera', 16: 'Animasyon', 35: 'Komedi', 80: 'Suç', 99: 'Belgesel', 18: 'Dram', 10751: 'Aile', 14: 'Fantastik', 36: 'Tarih', 27: 'Korku', 10402: 'Müzik', 9648: 'Gizem', 10749: 'Romantik', 878: 'Bilim Kurgu', 10770: 'TV Filmi', 53: 'Gerilim', 10752: 'Savaş', 37: 'Vahşi Batı' },
  tv: { 10759: 'Aksiyon & Macera', 16: 'Animasyon', 35: 'Komedi', 80: 'Suç', 99: 'Belgesel', 18: 'Dram', 10751: 'Aile', 10762: 'Çocuk', 9648: 'Gizem', 10763: 'Haber', 10764: 'Gerçeklik', 10765: 'Bilim Kurgu & Fantazi', 10766: 'Pembe Dizi', 10767: 'Talk Show', 10768: 'Savaş & Politika', 37: 'Vahşi Batı' },
};
// Film ve dizi türleri TMDB'de farklı; harmanlama için eşleştirme
const MAP_M2T = { 28: [10759], 12: [10759], 878: [10765], 14: [10765], 10752: [10768], 16: [16], 35: [35], 80: [80], 99: [99], 18: [18], 10751: [10751], 9648: [9648], 37: [37] };
const MAP_T2M = { 10759: [28, 12], 10765: [878, 14], 10768: [10752], 16: [16], 35: [35], 80: [80], 99: [99], 18: [18], 10751: [10751], 9648: [9648], 37: [37] };

const CRITERIA = {
  movie: [['story', 'Senaryo'], ['acting', 'Oyunculuk'], ['visual', 'Görsellik'], ['music', 'Müzik'], ['pace', 'Tempo'], ['impact', 'Duygusal etki'], ['rewatch', 'Tekrar izlenirlik']],
  tv: [['story', 'Senaryo'], ['acting', 'Oyunculuk'], ['visual', 'Görsellik'], ['music', 'Müzik'], ['pace', 'Tempo'], ['impact', 'Duygusal etki'], ['rewatch', 'Tekrar izlenirlik'], ['binge', 'Bağımlılık'], ['consistency', 'Tutarlılık'], ['finale', 'Final']],
};
const CRIT_LABEL = Object.fromEntries([...CRITERIA.tv]);
const TAGS = ['Kafa yoran', 'Hafif', 'Nöbet sonrası', 'Birlikte izlenir', 'Ağlattı', 'Güldürdü', 'Görsel şölen', 'Gerdi', 'Klasik', 'Abartılmış'];
const WORDS = ['', 'Zaman kaybı', 'Çok kötü', 'Kötü', 'Zayıf', 'Vasat', 'İdare eder', 'İyi', 'Çok iyi', 'Harika', 'Başyapıt'];
const STATUS = { want: 'İzleyeceğim', watching: 'İzliyorum', done: 'İzledim', dropped: 'Yarıda bıraktım', dismissed: 'İlgilenmiyorum' };
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const LEVELS = [[0, 'Figüran'], [60, 'Seyirci'], [200, 'Sinefil Adayı'], [450, 'Sinefil'], [900, 'Eleştirmen'], [1600, 'Yönetmen Koltuğu'], [3000, 'Efsane']];

const ICONS = {
  home: '<path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 10 5.6 4.6l14.5 2.2L19.4 10"/><path d="M9 5.3 10.6 10M14.3 6.1 15.8 10"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  archive: '<rect x="4" y="4" width="6.5" height="9" rx="1"/><rect x="13.5" y="4" width="6.5" height="6" rx="1"/><rect x="4" y="15.5" width="6.5" height="4.5" rx="1"/><rect x="13.5" y="12.5" width="6.5" height="7.5" rx="1"/>',
  stats: '<path d="M5 20v-7M10 20V5M15 20v-9M20 20v-4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  bolt: '<path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z"/>',
  ticket: '<path d="M3.5 8a2 2 0 0 0 2-2h13a2 2 0 0 0 2 2v2.2a1.8 1.8 0 0 0 0 3.6V16a2 2 0 0 0-2 2h-13a2 2 0 0 0-2-2v-2.2a1.8 1.8 0 0 0 0-3.6z"/><path d="M14.5 7v10" stroke-dasharray="1.6 1.8"/>',
  stack: '<path d="M4 8.5 12 4l8 4.5-8 4.5z"/><path d="m4 12.5 8 4.5 8-4.5M4 16.5 12 21l8-4.5"/>',
  crown: '<path d="M4 17.5 3 7.5l5 4 4-6.5 4 6.5 5-4-1 10z"/><path d="M4 20.5h16"/>',
  tv: '<rect x="3" y="6" width="18" height="12.5" rx="2"/><path d="m8.5 2.5 3.5 3.5 3.5-3.5M8 21.5h8"/>',
  pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  note: '<path d="M6 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 6 20z"/><path d="M14.5 3.5V8H19M9 12.5h6.5M9 16h4.5"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 3.5 5.5 3.5 8.5s-.9 5.9-3.5 8.5c-2.6-2.6-3.5-5.5-3.5-8.5s.9-5.9 3.5-8.5"/>',
  flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.7 0-3.8 3.4-5.6 4-9.8 3 2 4.2 4.5 4 6.6 1-.6 1.6-1.6 1.8-2.6C17.6 11 18 13 18 15.3 18 18.6 15.6 21 12 21z"/>',
  heart: '<path d="M12 20s-7.5-4.4-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.6 12 20 12 20z"/>',
  film: '<rect x="3.5" y="4" width="17" height="16" rx="1.5"/><path d="M7.5 4v16M16.5 4v16M3.5 8.5h4M3.5 12h4M3.5 15.5h4M16.5 8.5h4M16.5 12h4M16.5 15.5h4"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v5a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 5 19V7a.5.5 0 0 1 .5-.5h5"/>',
  shuffle: '<path d="M4 7h3.5c4.5 0 4.5 10 9 10H20M4 17h3.5c1.6 0 2.6-1.3 3.4-3M14 10c.8-1.7 1.8-3 3.4-3H20M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;

const BADGES = [
  { id: 'first', name: 'İlk Bilet', desc: 'İlk kaydını arşive ekle', ic: 'ticket', test: c => c.done >= 1 },
  { id: 'ten', name: 'Onluk Seri', desc: '10 yapım izle', ic: 'stack', test: c => c.done >= 10 },
  { id: 'fifty', name: 'Elli Perde', desc: '50 yapım izle', ic: 'film', test: c => c.done >= 50 },
  { id: 'hundred', name: 'Yüzlük Kulüp', desc: '100 yapım izle', ic: 'crown', test: c => c.done >= 100 },
  { id: 'marathon', name: 'Maratoncu', desc: 'Bir diziyi bitir', ic: 'tv', test: c => c.tvDone >= 1 },
  { id: 'detail', name: 'Detaycı', desc: '10 detaylı puanlama yap', ic: 'pen', test: c => c.detailed >= 10 },
  { id: 'notes', name: 'Not Defteri', desc: '5 yapıma not düş', ic: 'note', test: c => c.notes >= 5 },
  { id: 'explorer', name: 'Kâşif', desc: 'Önerilerden 3 tanesini izle', ic: 'compass', test: c => c.recWatched >= 3 },
  { id: 'classic', name: 'Klasikçi', desc: '1980 öncesinden 5 yapım izle', ic: 'clock', test: c => c.old >= 5 },
  { id: 'world', name: 'Dünya Turu', desc: '5 farklı dilde yapım izle', ic: 'globe', test: c => c.langs >= 5 },
  { id: 'harsh', name: 'Sert Eleştirmen', desc: '15+ puanda TMDB ortalamasının belirgin altında kal', ic: 'flame', test: c => c.rated >= 15 && c.gap <= -0.7 },
  { id: 'kind', name: 'Kalbi Geniş', desc: '15+ puanda TMDB ortalamasının belirgin üstünde kal', ic: 'heart', test: c => c.rated >= 15 && c.gap >= 0.7 },
];

/* ============ Depolama ============ */
const DB_KEY = 'seans.db.v1', KEY_KEY = 'seans.apikey', CACHE_KEY = 'seans.cache.v1';
function lsGet(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch { return fb; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }

const S = {
  db: { items: {}, settings: { cross: true, rateMode: 'detailed', mode: 'movie' }, meta: { recWatched: 0, badges: [] } },
  view: 'home',
  meta: new Map(),
  recs: { movie: null, tv: null },
  recShown: { movie: new Set(), tv: new Set() },
  recKeys: new Set(),
  deck: { movie: [], tv: [] }, boost: { movie: [], tv: [] }, deckSeen: new Set(), deckRun: 0, deckBusy: false,
  search: { q: '', res: [], loading: false, err: '' },
  archive: { status: 'all', sort: 'recent', q: '' },
};
const mode = () => S.db.settings.mode === 'tv' ? 'tv' : 'movie';

function loadDB() {
  const d = lsGet(DB_KEY, null);
  if (d && d.items) {
    S.db.items = d.items;
    Object.assign(S.db.settings, d.settings || {});
    Object.assign(S.db.meta, d.meta || {});
  }
}
function save() { if (!lsSet(DB_KEY, S.db)) toast('Kaydedilemedi: tarayıcı depolaması dolu olabilir. Ayarlar\'dan yedek al.', 'err'); }
const getKey = () => String(lsGet(KEY_KEY, '') || '').trim();

let DC = lsGet(CACHE_KEY, {}) || {};
let dcT;
function cacheGet(k) { const e = DC[k]; return e && Date.now() - e.t < 7 * 864e5 ? e.d : null; }
function cachePut(k, d) {
  DC[k] = { t: Date.now(), d };
  clearTimeout(dcT);
  dcT = setTimeout(() => {
    const ks = Object.keys(DC);
    if (ks.length > 220) ks.sort((a, b) => DC[a].t - DC[b].t).slice(0, ks.length - 170).forEach(x => delete DC[x]);
    if (!lsSet(CACHE_KEY, DC)) { DC = {}; lsSet(CACHE_KEY, DC); }
  }, 600);
}

/* ============ TMDB ============ */
const API = 'https://api.themoviedb.org/3';
async function tmdb(path, params = {}, key = getKey()) {
  if (!key) throw new Error('NOKEY');
  const u = new URL(API + path);
  const p = Object.assign({ language: 'tr-TR' }, params);
  for (const [k, v] of Object.entries(p)) if (v != null && v !== '') u.searchParams.set(k, v);
  const headers = { accept: 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key; else u.searchParams.set('api_key', key);
  let r;
  try { r = await fetch(u, { headers }); } catch { throw new Error('NET'); }
  if (r.status === 401) throw new Error('AUTH');
  if (r.status === 404) throw new Error('404');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
function errText(e) {
  const m = e && e.message;
  return ({
    NOKEY: 'Önce Ayarlar\'dan TMDB anahtarını gir.',
    AUTH: 'TMDB anahtarı kabul edilmedi. Ayarlar\'dan kontrol et.',
    NET: 'İnternete bağlanılamadı. Bağlantını kontrol edip tekrar dene.',
    404: 'Bu yapım TMDB\'de bulunamadı.',
  })[m] || 'TMDB yanıt vermedi (' + esc(m) + '). Biraz sonra tekrar dene.';
}

function fromList(type, r) {
  const t = r.media_type === 'movie' || r.media_type === 'tv' ? r.media_type : type;
  return {
    key: t + ':' + r.id, type: t, id: r.id,
    title: r.title || r.name || '', original: r.original_title || r.original_name || '',
    year: (r.release_date || r.first_air_date || '').slice(0, 4),
    poster: r.poster_path || null, backdrop: r.backdrop_path || null,
    genres: (r.genre_ids || []).map(id => ({ id, name: GENRES[t][id] || '' })),
    vote: r.vote_average || 0, votes: r.vote_count || 0, lang: r.original_language || '',
    overview: r.overview || '', rich: false,
  };
}
function normalize(type, d) {
  const isM = type === 'movie';
  const credits = isM ? d.credits : d.aggregate_credits;
  const cast = ((credits && credits.cast) || []).slice(0, 12).map(c => ({ id: c.id, name: c.name, role: isM ? (c.character || '') : ((c.roles && c.roles[0] && c.roles[0].character) || ''), photo: c.profile_path || null }));
  const people = isM
    ? ((d.credits && d.credits.crew) || []).filter(c => c.job === 'Director').map(c => ({ id: c.id, name: c.name }))
    : (d.created_by || []).map(c => ({ id: c.id, name: c.name }));
  const kw = isM ? (d.keywords && d.keywords.keywords) : (d.keywords && d.keywords.results);
  const prov = d['watch/providers'] && d['watch/providers'].results && d['watch/providers'].results.TR;
  const vids = (d.videos && d.videos.results) || [];
  const trailer = vids.find(v => v.site === 'YouTube' && v.type === 'Trailer') || vids.find(v => v.site === 'YouTube');
  const pmap = l => (l || []).map(p => ({ name: p.provider_name, logo: p.logo_path }));
  return {
    key: type + ':' + d.id, type, id: d.id,
    title: (isM ? d.title : d.name) || '', original: (isM ? d.original_title : d.original_name) || '',
    year: ((isM ? d.release_date : d.first_air_date) || '').slice(0, 4),
    poster: d.poster_path || null, backdrop: d.backdrop_path || null,
    overview: d.overview || '', tagline: d.tagline || '',
    genres: (d.genres || []).map(g => ({ id: g.id, name: GENRES[type][g.id] || g.name })),
    people, cast,
    keywords: (kw || []).slice(0, 20).map(k => ({ id: k.id, name: k.name })),
    runtime: isM ? (d.runtime || null) : ((d.episode_run_time && d.episode_run_time[0]) || null),
    seasons: isM ? null : (d.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0).map(s => ({ n: s.season_number, eps: s.episode_count })),
    episodes: isM ? null : (d.number_of_episodes || null),
    showStatus: d.status || '',
    lang: d.original_language || '', vote: d.vote_average || 0, votes: d.vote_count || 0,
    providers: prov ? { flat: pmap(prov.flatrate), rent: pmap(prov.rent), buy: pmap(prov.buy), link: prov.link || '' } : null,
    trailer: trailer ? trailer.key : null,
    rich: true,
  };
}
function remember(m) {
  const old = S.meta.get(m.key);
  if (old && old.rich && !m.rich) return old;
  S.meta.set(m.key, m);
  return m;
}
const inflight = new Map();
async function getDetails(type, id) {
  const k = type + ':' + id;
  const c = cacheGet(k);
  if (c) { remember(c); return c; }
  if (inflight.has(k)) return inflight.get(k);
  const pr = (async () => {
    const ap = type === 'movie' ? 'credits,keywords,watch/providers,videos' : 'aggregate_credits,keywords,watch/providers,videos';
    const d = await tmdb(`/${type}/${id}`, { append_to_response: ap, include_video_language: 'tr,en' });
    if (!d.overview) { try { const en = await tmdb(`/${type}/${id}`, { language: 'en-US' }); d.overview = en.overview || ''; } catch { /* boş kalsın */ } }
    const m = normalize(type, d);
    cachePut(k, m); remember(m);
    return m;
  })();
  inflight.set(k, pr);
  try { return await pr; } finally { inflight.delete(k); }
}
const metaOf = key => S.meta.get(key) || S.db.items[key] || null;

/* ============ Arşiv kayıtları ============ */
const ITEM_FIELDS = ['type', 'id', 'title', 'original', 'year', 'poster', 'backdrop', 'genres', 'people', 'cast', 'keywords', 'runtime', 'episodes', 'seasons', 'lang', 'vote'];
function itemFields(m) {
  const o = {};
  for (const f of ITEM_FIELDS) if (m[f] !== undefined) o[f] = m[f];
  if (o.cast) o.cast = o.cast.slice(0, 6).map(c => ({ id: c.id, name: c.name }));
  if (o.keywords) o.keywords = o.keywords.slice(0, 15);
  o.rich = !!m.rich;
  return o;
}
function upsert(m, patch = {}) {
  let it = S.db.items[m.key];
  if (!it) { it = Object.assign({ key: m.key, addedAt: Date.now() }, itemFields(m)); S.db.items[m.key] = it; }
  else if (m.rich && !it.rich) Object.assign(it, itemFields(m));
  Object.assign(it, patch, { updatedAt: Date.now() });
  save();
  if (!it.rich) queueEnrich(it.key);
  return it;
}
function removeItem(key) { delete S.db.items[key]; save(); }
const userScore = it => it && it.rating && it.rating.overall != null ? it.rating.overall : (it && it.status === 'dropped' ? 3 : null);
const itemsOf = t => Object.values(S.db.items).filter(i => i.type === t);

const enrichQ = new Set(); let enriching = false;
function queueEnrich(k) { enrichQ.add(k); runEnrich(); }
async function runEnrich() {
  if (enriching || !getKey()) return;
  enriching = true;
  try {
    while (enrichQ.size) {
      const k = enrichQ.values().next().value; enrichQ.delete(k);
      const it = S.db.items[k];
      if (!it || it.rich) continue;
      try { const m = await getDetails(it.type, it.id); if (S.db.items[k]) { Object.assign(S.db.items[k], itemFields(m)); save(); } }
      catch (e) { if (e.message === 'AUTH' || e.message === 'NOKEY' || e.message === 'NET') { enrichQ.add(k); break; } }
    }
  } finally { enriching = false; }
}

/* ============ Seviye ve rozetler ============ */
function xpOf() {
  let xp = 0;
  for (const it of Object.values(S.db.items)) {
    if (it.status === 'done') xp += 10; else if (it.status === 'dropped') xp += 4; else if (it.status === 'watching') xp += 3; else if (it.status === 'want') xp += 1;
    if (it.rating && it.rating.overall != null) xp += 2;
    if (it.rating && it.rating.sub && Object.keys(it.rating.sub).length >= 4) xp += 6;
    if (it.note) xp += 2;
  }
  return xp + (S.db.meta.recWatched || 0) * 5;
}
function levelOf(xp) {
  let i = 0; while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++;
  const cur = LEVELS[i], nxt = LEVELS[i + 1];
  return { i, name: cur[1], xp, from: cur[0], to: nxt ? nxt[0] : null, next: nxt ? nxt[1] : null, pct: nxt ? (xp - cur[0]) / (nxt[0] - cur[0]) : 1 };
}
function badgeCtx() {
  const all = Object.values(S.db.items);
  const done = all.filter(i => i.status === 'done');
  const rated = all.filter(i => i.rating && i.rating.overall != null && i.vote > 0);
  return {
    done: done.length,
    tvDone: done.filter(i => i.type === 'tv').length,
    detailed: all.filter(i => i.rating && i.rating.sub && Object.keys(i.rating.sub).length >= 4).length,
    notes: all.filter(i => i.note).length,
    recWatched: S.db.meta.recWatched || 0,
    old: done.filter(i => i.year && +i.year < 1980).length,
    langs: new Set(done.map(i => i.lang).filter(Boolean)).size,
    rated: rated.length,
    gap: rated.length ? avg(rated.map(i => i.rating.overall)) - avg(rated.map(i => i.vote)) : 0,
  };
}
const earnedBadges = () => { const c = badgeCtx(); return BADGES.filter(b => b.test(c)).map(b => b.id); };
function afterChange(prevXp, silent = false) {
  const xp = xpOf(); const a = levelOf(prevXp), b = levelOf(xp);
  const earned = earnedBadges(); const had = new Set(S.db.meta.badges || []);
  const fresh = earned.filter(id => !had.has(id));
  S.db.meta.badges = earned; save();
  if (silent) return;
  if (xp > prevXp) toast(`+${xp - prevXp} XP`, 'xp');
  fresh.forEach((id, i) => { const bd = BADGES.find(x => x.id === id); setTimeout(() => toast(`${icon(bd.ic)}<span>Yeni rozet: <b>${esc(bd.name)}</b></span>`, 'badge', true), 500 + i * 700); });
  if (b.i > a.i) setTimeout(() => celebrate(b.name), 300);
}

/* ============ Öneri motoru ============
   Her tür (film/dizi) için ayrı bir zevk profili kurulur.
   Özellikler: türler, yönetmen/yaratıcı, ilk oyuncular, anahtar kelimeler.
   Ağırlık = puanın senin ortalamandan sapması, az veride sıfıra çekilir.
   Diğer taraftan gelen katkı: %20, kendi verin 15'in altındayken %60'a kadar çıkar. */
function crossWeight(nOwn) { return S.db.settings.cross ? 0.2 + 0.4 * Math.max(0, (15 - nOwn) / 15) : 0; }
function feats(it, target) {
  const out = [];
  for (const g of it.genres || []) {
    const ids = it.type === target ? [g.id] : ((it.type === 'movie' ? MAP_M2T : MAP_T2M)[g.id] || []);
    for (const id of ids) out.push(['g' + id, 1, GENRES[target][id] || g.name]);
  }
  for (const p of it.people || []) out.push(['p' + p.id, 1.2, p.name, it.type === 'movie' ? 'dir' : 'cre']);
  (it.cast || []).slice(0, 5).forEach(c => out.push(['p' + c.id, 0.6, c.name, 'cast']));
  for (const k of (it.keywords || []).slice(0, 15)) out.push(['k' + k.id, 0.5, k.name]);
  return out;
}
function buildProfile(type) {
  const scored = Object.values(S.db.items).filter(i => userScore(i) != null);
  const own = scored.filter(i => i.type === type), other = scored.filter(i => i.type !== type);
  const cross = crossWeight(own.length);
  const base = own.length >= 3 ? own : scored;
  const mean = base.length ? avg(base.map(userScore)) : 6.5;
  const acc = new Map();
  const add = (it, w) => {
    const sc = userScore(it), d = (sc - mean) / 2.5;
    for (const [f, fw, name] of feats(it, type)) {
      let a = acc.get(f); if (!a) { a = { s: 0, c: 0, raw: 0, n: 0, name }; acc.set(f, a); }
      a.s += d * w * fw; a.c += w * fw; a.raw += sc * w; a.n += w;
    }
  };
  own.forEach(i => add(i, 1));
  if (cross > 0) other.forEach(i => add(i, cross));
  const W = new Map();
  for (const [f, a] of acc) W.set(f, { w: a.s / (a.c + 1.5), avg: a.raw / a.n, n: a.n, name: a.name });
  return { W, mean, own, other, cross, nEff: own.length + Math.round(other.length * cross) };
}
function preScore(c, P) {
  let g = 0, gn = 0;
  for (const x of c.genres) { const e = P.W.get('g' + x.id); if (e) { g += e.w; gn++; } }
  let s = gn ? g / gn : 0;
  s += Math.min(0.6, c.src.reduce((a, x) => a + Math.max(0, (x.score - P.mean) / 2.5) * 0.35, 0));
  s += ((c.vote || 6.5) - 6.8) * 0.12;
  if (c.want) s += 0.15;
  return s;
}
function fullScore(m, P, c) {
  const reasons = [];
  let gs = 0, gn = 0, bestG = null;
  for (const x of m.genres || []) {
    const e = P.W.get('g' + x.id);
    if (e) { gs += e.w; gn++; if (e.w > 0.1 && e.n >= 1.5 && (!bestG || e.w > bestG.e.w)) bestG = { x, e }; }
  }
  const genre = gn ? gs / gn : 0;
  let ppl = 0; const pr = [];
  for (const p of m.people || []) { const e = P.W.get('p' + p.id); if (e) { ppl += e.w; if (e.w > 0.08) pr.push({ role: m.type === 'movie' ? 'Yönetmen' : 'Yaratıcı', name: p.name, e }); } }
  for (const p of (m.cast || []).slice(0, 6)) { const e = P.W.get('p' + p.id); if (e) { ppl += e.w * 0.5; if (e.w > 0.08) pr.push({ role: 'Oyuncu', name: p.name, e }); } }
  ppl = Math.tanh(ppl) * 0.8;
  let kw = 0, kn = 0; const kr = [];
  for (const k of m.keywords || []) { const e = P.W.get('k' + k.id); if (e) { kw += e.w; kn++; if (e.w > 0.1) kr.push(k.name); } }
  const kws = kn ? (kw / Math.sqrt(kn)) * 0.5 : 0;
  const src = c ? c.src : [];
  const srcS = Math.min(0.6, src.reduce((a, x) => a + Math.max(0, (x.score - P.mean) / 2.5) * 0.3, 0));
  const q = ((m.vote || 6.5) - 6.8) * 0.12;
  const total = genre * 0.9 + ppl + kws + srcS + q + (c && c.want ? 0.1 : 0);
  const match = clamp(Math.round(100 / (1 + Math.exp(-2.4 * total))), 35, 99);

  if (c && c.want) reasons.push('Zaten listende bekliyor');
  const s0 = [...src].sort((a, b) => b.score - a.score)[0];
  if (s0) reasons.push(`<b>${esc(s0.title)}</b> için ${s0.score} verdin, ona yakın`);
  pr.sort((a, b) => b.e.w - a.e.w).slice(0, 2).forEach(x => reasons.push(`${x.role}: <b>${esc(x.name)}</b> · ortalaman ${fmt1(x.e.avg)}`));
  if (bestG) reasons.push(`<b>${esc(bestG.x.name || bestG.e.name)}</b> türüne ortalaman ${fmt1(bestG.e.avg)}`);
  if (kr.length) reasons.push(`Sevdiğin temalar: ${esc(kr.slice(0, 3).join(', '))}`);
  if (m.vote >= 7.8 && m.votes > 300) reasons.push(`TMDB'de ${fmt1(m.vote)} ortalama`);
  if (!reasons.length) reasons.push('Zevk profilinle genel olarak uyumlu');
  return { match, total, reasons: reasons.slice(0, 3) };
}
async function recommend(type) {
  const P = buildProfile(type);
  if (!P.own.length && !(P.cross > 0 && P.other.length)) return { list: [], P, empty: true };
  const cap = Math.min(5, Math.max(1, P.nEff));
  const lib = S.db.items, shown = S.recShown[type];
  const log = recLog(), now = Date.now();
  const isRecent = k => !!(log[k] && now - log[k] < RECENT_MS);
  const C = new Map();
  const addC = (m, src) => {
    const li = lib[m.key];
    if ((li && li.status !== 'want') || shown.has(m.key)) return;
    let c = C.get(m.key);
    if (!c) { c = Object.assign({}, m, { src: [], want: !!(li && li.status === 'want') }); C.set(m.key, c); }
    if (src) c.src.push(src);
  };
  const tasks = [];
  // Her turda farklı tohumlar, farklı sayfalar ve bazen "benzer" listesi: havuz her seferinde değişir
  const seeds = shuffle(P.own.filter(i => userScore(i) >= Math.max(7, P.mean)).sort((a, b) => userScore(b) - userScore(a)).slice(0, 25)).slice(0, 6);
  for (const s of seeds) {
    const ep = rand(3) === 0 ? 'similar' : 'recommendations';
    tasks.push(() => tmdb(`/${type}/${s.id}/${ep}`, { page: 1 + rand(2) }).then(d => (d.results || []).slice(0, 20).forEach(r => addC(fromList(type, r), { title: s.title, score: userScore(s) }))));
  }
  const topG = [...P.W.entries()].filter(([f, e]) => f[0] === 'g' && e.w > 0.05).sort((a, b) => b[1].w - a[1].w).slice(0, 3).map(([f]) => f.slice(1));
  const minVotes = type === 'movie' ? 600 : 250;
  const disc = params => () => tmdb(`/discover/${type}`, Object.assign({ sort_by: 'vote_average.desc', 'vote_count.gte': minVotes, page: 1 + rand(3) }, params)).then(d => (d.results || []).forEach(r => addC(fromList(type, r))));
  if (topG.length) { tasks.push(disc({ with_genres: topG.join('|') })); tasks.push(disc({ with_genres: topG[0], sort_by: 'popularity.desc', page: 1 + rand(2) })); }
  if (!seeds.length && !topG.length) tasks.push(() => tmdb(`/${type}/top_rated`, { page: 1 + rand(5) }).then(d => (d.results || []).forEach(r => addC(fromList(type, r)))));
  itemsOf(type).filter(i => i.status === 'want').forEach(i => addC(Object.assign({}, i, { overview: '' })));
  const res = await runLimited(tasks, 4);
  if (!C.size) {
    if (tasks.length && res.every(x => x === undefined || x === null)) throw new Error('NET');
    return { list: [], P, noCands: true };
  }
  const pre = [...C.values()].map(c => ({ c, s: preScore(c, P) + (Math.random() - 0.5) * 0.3 - (isRecent(c.key) ? 1 : recPenalty(c.key, log, now)) })).sort((a, b) => b.s - a.s).slice(0, Math.max(20, cap * 4));
  const scored = await runLimited(pre.map(({ c }) => async () => { const m = await getDetails(type, c.id); return Object.assign({ m, c }, fullScore(m, P, c)); }), 5);
  const ok = scored.filter(Boolean).filter(x => { const li = lib[x.m.key]; return !(li && li.status !== 'want'); }).sort((a, b) => b.total - a.total);
  // Son 1 günde gösterilenler dışarıda kalır; aday yetmezse onlardan tamamlanır
  const fresh = ok.filter(x => !isRecent(x.m.key));
  let list = pickDiverse(fresh, cap, log);
  if (list.length < cap) list = list.concat(pickDiverse(ok.filter(x => !list.includes(x)), cap - list.length, log));
  list.sort((a, b) => b.total - a.total);
  list.forEach(x => { shown.add(x.m.key); S.recKeys.add(x.m.key); log[x.m.key] = now; });
  pruneRecLog(); save();
  return { list, P, cap };
}

/* Önerilen yapımların kaydı: uygulama kapanıp açılsa da hatırlanır */
// İlk 1 gün hiç önerilmez. 1. günden 10. güne kadar ceza doğrusal azalır, 10. günde sıfırlanır.
const DAY = 864e5, RECENT_MS = 1 * DAY, RECOVER_MS = 10 * DAY, MAX_PENALTY = 0.4;
function recLog() { if (!S.db.meta.recLog) S.db.meta.recLog = {}; return S.db.meta.recLog; }
function recPenalty(k, log, now) {
  const t = log[k]; if (!t) return 0;
  const age = now - t;
  if (age >= RECOVER_MS) return 0;
  if (age < RECENT_MS) return MAX_PENALTY;
  return MAX_PENALTY * (RECOVER_MS - age) / (RECOVER_MS - RECENT_MS);
}
function pruneRecLog() {
  const L = recLog(), now = Date.now();
  for (const k of Object.keys(L)) if (now - L[k] >= RECOVER_MS) delete L[k];
}
/* En iyi adaylardan ağırlıklı rastgele seçim: puanı yüksek olan daha sık çıkar ama her seferinde aynı 5 gelmez.
   Seçilenle aynı ana türden ya da aynı kaynaktan gelenlerin şansı düşürülür, liste çeşitlenir. */
function pickDiverse(arr, n, log) {
  const now = Date.now();
  const pool = arr.slice(0, Math.max(n * 4, 16)).map(x => ({ x, w: Math.exp((x.total - recPenalty(x.m.key, log, now)) / 0.3) }));
  const out = [];
  while (out.length < n && pool.length) {
    const sum = pool.reduce((a, p) => a + p.w, 0);
    let r = Math.random() * sum, i = 0;
    while (i < pool.length - 1 && (r -= pool[i].w) > 0) i++;
    const p = pool.splice(i, 1)[0]; out.push(p.x);
    const g0 = p.x.m.genres && p.x.m.genres[0] && p.x.m.genres[0].id;
    const srcs = new Set(((p.x.c && p.x.c.src) || []).map(s => s.title));
    for (const q of pool) {
      if (g0 && q.x.m.genres && q.x.m.genres[0] && q.x.m.genres[0].id === g0) q.w *= 0.6;
      if (((q.x.c && q.x.c.src) || []).some(s => srcs.has(s.title))) q.w *= 0.7;
    }
  }
  return out;
}

/* ============ Hızlı puanlama destesi ============ */
async function refillDeck(type) {
  const D = S.deck[type];
  const srcs = [[`/trending/${type}/week`, { page: 1 + rand(3) }], [`/${type}/top_rated`, { page: 1 + rand(10) }], [`/${type}/popular`, { page: 1 + rand(6) }]];
  const [p, params] = srcs[rand(srcs.length)];
  const d = await tmdb(p, params);
  for (const r of shuffle(d.results || [])) {
    const m = fromList(type, r);
    if (S.db.items[m.key] || S.deckSeen.has(m.key) || D.some(x => x.key === m.key) || !m.poster) continue;
    D.push(m);
  }
}
function nextFromDeck(type) {
  const ok = m => m && !S.db.items[m.key] && !S.deckSeen.has(m.key);
  const B = S.boost[type]; while (B.length) { const m = B.shift(); if (ok(m)) return m; }
  const D = S.deck[type]; while (D.length) { const m = D.shift(); if (ok(m)) return m; }
  return null;
}
async function boostFrom(m) {
  try {
    const d = await tmdb(`/${m.type}/${m.id}/recommendations`);
    const B = S.boost[m.type];
    (d.results || []).slice(0, 8).map(r => fromList(m.type, r)).filter(x => x.poster && !S.db.items[x.key] && !S.deckSeen.has(x.key)).slice(0, 3).forEach(x => B.push(x));
  } catch { /* desteye eklenmezse sorun değil */ }
}

/* ============ Arayüz: genel ============ */
const toastRoot = () => $('#toasts');
function toast(html, kind = '', raw = false) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = raw ? html : esc(html);
  toastRoot().appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, kind === 'err' ? 4200 : 2400);
}
function celebrate(name) {
  const el = document.createElement('div');
  el.className = 'celebrate';
  el.innerHTML = `<div class="cel-card"><div class="bulbs"></div><p class="eyebrow">Seviye atladın</p><p class="cel-name">${esc(name)}</p><div class="bulbs"></div></div>`;
  el.addEventListener('click', () => el.remove());
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3100);
}

const sheets = [];
function openSheet(html, cls = '') {
  const w = document.createElement('div');
  w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet-bg" data-act="close-sheet"></div><div class="sheet ${cls}" role="dialog" aria-modal="true"><button class="sheet-x" data-act="close-sheet" aria-label="Kapat">${icon('x')}</button><div class="sheet-body">${html}</div></div>`;
  $('#sheet-root').appendChild(w);
  sheets.push(w);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add('open')));
  return w;
}
function closeSheet(w = sheets[sheets.length - 1]) {
  if (!w) return;
  const i = sheets.indexOf(w); if (i >= 0) sheets.splice(i, 1);
  w.classList.remove('open');
  setTimeout(() => w.remove(), 280);
  if (!sheets.length) { document.body.classList.remove('no-scroll'); render(); }
}
const setSheet = (w, html) => { const b = $('.sheet-body', w); if (b) b.innerHTML = html; };
const errorBox = e => `<div class="errbox">${icon('x')}<p>${errText(e)}</p></div>`;

function poster(m, size = 'w342', cls = '') {
  return m.poster
    ? `<img class="${cls}" src="${img(m.poster, size)}" alt="" loading="lazy" decoding="async">`
    : `<div class="${cls} noposter"><span>${esc(m.title)}</span></div>`;
}
const metaLine = m => [m.year, (m.genres || []).map(g => g.name).filter(Boolean).slice(0, 2).join(', ')].filter(Boolean).join(' · ');

/* ============ Görünümler ============ */
function render() {
  const t = mode();
  document.body.dataset.mode = t;
  $$('.mode-btn').forEach(b => { b.setAttribute('aria-selected', String(b.dataset.mode === t)); });
  $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.view === S.view));
  const v = $('#view');
  v.innerHTML = ({ home: vHome, search: vSearch, archive: vArchive, stats: vStats })[S.view]();
  if (S.view === 'search') { const q = $('#q'); if (q && !S.search.q) q.focus({ preventScroll: true }); }
}

function vHome() {
  const t = mode(), T = TYPES[t];
  const lv = levelOf(xpOf());
  const mine = itemsOf(t);
  const rated = mine.filter(i => userScore(i) != null).length;
  const watching = t === 'tv' ? mine.filter(i => i.status === 'watching').sort((a, b) => b.updatedAt - a.updatedAt) : [];
  const want = mine.filter(i => i.status === 'want').sort((a, b) => b.addedAt - a.addedAt).slice(0, 16);
  const loading = S.recs[t] && S.recs[t].loading;
  return `
  <button class="level" data-act="go" data-view="stats" aria-label="Seviye ve rozetler">
    <span class="lv-name">${esc(lv.name)}</span>
    <span class="lv-bar"><i style="width:${Math.round(lv.pct * 100)}%"></i></span>
    <span class="lv-xp">${fmtInt(lv.xp)} XP${lv.next ? ` · <em>${esc(lv.next)}</em> için ${fmtInt(lv.to - lv.xp)}` : ''}</span>
  </button>
  <section class="hero">
    <div class="curtain" aria-hidden="true"></div>
    <div class="bulbs" aria-hidden="true"></div>
    <p class="eyebrow">Bu gece · ${T.label}</p>
    <h1 class="hero-title">${t === 'movie' ? 'Hangi film?' : 'Hangi dizi?'}</h1>
    <p class="hero-sub">${rated ? `${rated} puanına bakıp sana özel ${T.one} seçerim.` : `Önce birkaç ${T.one} puanla, sana göre seçmeye başlayayım.`}</p>
    <button class="btn-suggest" data-act="suggest" ${loading ? 'disabled' : ''}>
      <span class="bs-main">${loading ? 'Seçiliyor' : 'Öner'}</span>
      <span class="bs-sub">${rated ? 'sana özel 5 seçim' : 'veri bekleniyor'}</span>
    </button>
    <div class="bulbs" aria-hidden="true"></div>
  </section>
  <section id="recs" aria-live="polite">${vRecs()}</section>
  ${watching.length ? `<section class="block"><h2 class="sec-title">Kaldığın yerden</h2><div class="cont-list">${watching.map(contRow).join('')}</div></section>` : ''}
  <button class="quick-card" data-act="quick">
    <span class="qc-icon">${icon('bolt')}</span>
    <span class="qc-text"><b>Hızlı Puanla</b><small>Daha önce izlediğin ${T.plural.toLowerCase()} önüne gelsin, tek dokunuşla puanla. Öneriler hızla keskinleşir.</small></span>
    <span class="qc-count"><b>${rated}</b><small>puan</small></span>
  </button>
  <section class="block">
    <div class="sec-head"><h2 class="sec-title">Listende bekleyenler</h2>${want.length ? `<button class="link" data-act="archive-filter" data-status="want">Tümü</button>` : ''}</div>
    ${want.length ? `<div class="shelf">${want.map(i => `<button class="shelf-item" data-act="detail" data-key="${i.key}">${poster(i, 'w185', 'shelf-img')}<span>${esc(i.title)}</span></button>`).join('')}</div>`
      : `<p class="empty-line">Henüz boş. Bir ${T.one} beğenince <b>İzleyeceğim</b> de, burada dursun.</p>`}
  </section>`;
}
function contRow(i) {
  const p = i.progress || { s: 1, e: 1 };
  const season = (i.seasons || []).find(s => s.n === p.s);
  return `<div class="cont">
    <button class="cont-poster" data-act="detail" data-key="${i.key}">${poster(i, 'w154')}</button>
    <div class="cont-body"><b>${esc(i.title)}</b><span class="mono">S${p.s} · B${p.e}${season ? ` / ${season.eps}` : ''}</span></div>
    <button class="btn-chip" data-act="ep-next" data-key="${i.key}">${icon('plus')}1 bölüm</button>
  </div>`;
}

let recTicker;
function vRecs() {
  const t = mode(), T = TYPES[t], R = S.recs[t];
  if (!R) return '';
  if (R.loading) return `<div class="projector"><div class="reel"><i></i><i></i><i></i><i></i><i></i></div><p class="proj-text" id="proj-text">Arşivin taranıyor…</p></div>`;
  if (R.error) return `<div class="errbox">${icon('x')}<p>${R.error}</p></div>`;
  if (R.empty) return `<div class="nudge"><p>Henüz hiç ${T.one} puanlamadın. Önermem için birkaç tane yeter.</p><button class="btn-primary" data-act="quick">${icon('bolt')}Hızlı Puanla'yı aç</button></div>`;
  if (!R.list.length) return `<div class="nudge"><p>Yeni aday bulamadım. Biraz daha puanlarsan havuz genişler, ya da tekrar dene.</p><button class="btn-ghost" data-act="suggest">${icon('shuffle')}Tekrar dene</button></div>`;
  const fewer = R.list.length < 5;
  return `<div class="recs-head">
      <h2 class="sec-title">Senin için ${R.list.length} ${T.one}</h2>
      <button class="btn-ghost sm" data-act="suggest">${icon('shuffle')}${fewer ? 'Tekrar' : '5 tane daha'}</button>
    </div>
    ${fewer ? `<p class="fewer">Şimdilik ${R.list.length} öneri çıkarabildim. Puanladıkça sayı ve isabet artacak.</p>` : ''}
    <div class="tickets">${R.list.map(ticket).join('')}</div>`;
}
function ticket(x, i) {
  const m = x.m, it = S.db.items[m.key], st = it && it.status;
  const stamp = st === 'done' ? 'İzlendi' : st === 'want' ? 'Listede' : st === 'dismissed' ? 'Geçildi' : st === 'watching' ? 'İzleniyor' : st === 'dropped' ? 'Yarıda' : '';
  const R = 2 * Math.PI * 21;
  return `<article class="ticket ${st === 'dismissed' ? 'gone' : ''}" style="--i:${i}" data-key="${m.key}">
    <button class="tk-poster" data-act="detail" data-key="${m.key}" aria-label="${esc(m.title)} detayı">${poster(m, 'w342')}
      <span class="match" aria-label="Uyum yüzde ${x.match}"><svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="21" class="m-bg"/><circle cx="25" cy="25" r="21" class="m-fg" stroke-dasharray="${(R * x.match / 100).toFixed(1)} ${R.toFixed(1)}"/></svg><b>${x.match}</b><small>uyum</small></span>
    </button>
    <div class="tk-stub">
      <p class="tk-seat mono">SIRA ${'ABCDE'[i] || 'F'} · KOLTUK ${i + 1}</p>
      <h3 class="tk-title">${esc(m.title)} <span>${esc(m.year)}</span></h3>
      <ul class="why">${x.reasons.map(r => `<li>${r}</li>`).join('')}</ul>
      <div class="tk-actions">
        <button class="tk-btn main" data-act="detail" data-key="${m.key}">Detay gör</button>
        <button class="tk-btn" data-act="set-status" data-status="done" data-key="${m.key}">${icon('check')}İzledim</button>
        <button class="tk-btn" data-act="set-status" data-status="want" data-key="${m.key}" aria-label="Listeye ekle">${icon('plus')}Liste</button>
        <button class="tk-btn icon" data-act="set-status" data-status="dismissed" data-key="${m.key}" aria-label="İlgilenmiyorum">${icon('x')}</button>
      </div>
    </div>
    ${stamp ? `<span class="tk-stamp">${stamp}</span>` : ''}
  </article>`;
}
function refreshRecs() {
  const el = $('#recs'); if (el) el.innerHTML = vRecs();
  const b = $('.btn-suggest'); const t = mode(); const loading = S.recs[t] && S.recs[t].loading;
  if (b) { b.disabled = !!loading; $('.bs-main', b).textContent = loading ? 'Seçiliyor' : 'Öner'; }
}

function vSearch() {
  const T = TYPES[mode()];
  return `<div class="page-head"><h1 class="page-title">Ara</h1><p class="muted">Bir ${T.one} bul, arşivine ekle ya da puanla.</p></div>
  <div class="search-box">${icon('search')}<input id="q" type="search" placeholder="${T.label} adı yaz…" value="${esc(S.search.q)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"></div>
  <div id="search-res">${vSearchRes()}</div>`;
}
function vSearchRes() {
  const s = S.search;
  if (s.loading) return `<p class="muted pad">Aranıyor…</p>`;
  if (s.err) return `<div class="errbox">${icon('x')}<p>${s.err}</p></div>`;
  if (!s.q) return `<p class="empty-line">Türkçe ya da orijinal adıyla arayabilirsin.</p>`;
  if (!s.res.length) return `<p class="empty-line">"${esc(s.q)}" için sonuç yok.</p>`;
  return `<ul class="results">${s.res.map(m => {
    const it = S.db.items[m.key]; const sc = userScore(it);
    return `<li class="res">
      <button class="res-main" data-act="detail" data-key="${m.key}">${poster(m, 'w92', 'res-img')}
        <span class="res-text"><b>${esc(m.title)}</b><small>${esc(metaLine(m))}</small>${it ? `<em class="chip st-${it.status}">${STATUS[it.status]}${sc != null && it.rating ? ` · ${sc}` : ''}</em>` : ''}</span>
      </button>
      ${it ? '' : `<div class="res-acts"><button class="btn-round" data-act="set-status" data-status="done" data-key="${m.key}" aria-label="İzledim, puanla">${icon('check')}</button><button class="btn-round" data-act="set-status" data-status="want" data-key="${m.key}" aria-label="İzleyeceğim">${icon('plus')}</button></div>`}
    </li>`;
  }).join('')}</ul>`;
}
let searchT, searchSeq = 0;
function doSearch(q) {
  S.search.q = q; clearTimeout(searchT);
  if (!q.trim()) { S.search.res = []; S.search.err = ''; S.search.loading = false; paintSearch(); return; }
  searchT = setTimeout(async () => {
    const seq = ++searchSeq; const t = mode();
    S.search.loading = true; S.search.err = ''; paintSearch();
    try {
      const d = await tmdb(`/search/${t}`, { query: q.trim(), include_adult: 'false' });
      if (seq !== searchSeq) return;
      S.search.res = (d.results || []).slice(0, 20).map(r => remember(fromList(t, r)));
    } catch (e) { if (seq !== searchSeq) return; S.search.err = errText(e); }
    S.search.loading = false; paintSearch();
  }, 380);
}
const paintSearch = () => { const el = $('#search-res'); if (el) el.innerHTML = vSearchRes(); };

function vArchive() {
  const t = mode(), T = TYPES[t], A = S.archive;
  const all = itemsOf(t);
  const counts = s => s === 'all' ? all.filter(i => i.status !== 'dismissed').length : all.filter(i => i.status === s).length;
  const filters = [['all', 'Tümü'], ['done', 'İzledim'], ...(t === 'tv' ? [['watching', 'İzliyorum']] : []), ['want', 'İzleyeceğim'], ['dropped', 'Yarıda'], ['dismissed', 'Geçtiklerim']];
  let list = all.filter(i => A.status === 'all' ? i.status !== 'dismissed' : i.status === A.status);
  if (A.q) { const q = A.q.toLocaleLowerCase('tr'); list = list.filter(i => (i.title + ' ' + (i.original || '')).toLocaleLowerCase('tr').includes(q)); }
  const sorters = {
    recent: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    score: (a, b) => (userScore(b) ?? -1) - (userScore(a) ?? -1) || (b.updatedAt || 0) - (a.updatedAt || 0),
    year: (a, b) => (+b.year || 0) - (+a.year || 0),
    title: (a, b) => a.title.localeCompare(b.title, 'tr'),
  };
  list.sort(sorters[A.sort] || sorters.recent);
  return `<div class="page-head"><h1 class="page-title">Arşiv</h1><p class="muted">${counts('done')} ${T.one} izlendi · ${counts('want')} bekliyor</p></div>
  <div class="chips-row" role="tablist">${filters.map(([s, l]) => `<button class="fchip ${A.status === s ? 'on' : ''}" data-act="archive-filter" data-status="${s}">${l}<span>${counts(s)}</span></button>`).join('')}</div>
  <div class="arch-tools">
    <div class="search-box sm">${icon('search')}<input id="arch-q" type="search" placeholder="Arşivde ara" value="${esc(A.q)}" autocomplete="off"></div>
    <label class="select"><span class="sr">Sırala</span><select id="arch-sort">
      ${[['recent', 'Son hareket'], ['score', 'Puan'], ['year', 'Yıl'], ['title', 'Ad']].map(([v, l]) => `<option value="${v}" ${A.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select></label>
  </div>
  <div id="arch-grid">${archGrid(list)}</div>`;
}
function archGrid(list) {
  if (!list.length) return `<div class="nudge"><p>Bu rafta henüz bir şey yok.</p><button class="btn-ghost" data-act="go" data-view="search">${icon('search')}${TYPES[mode()].label} ara</button></div>`;
  return `<div class="grid">${list.map(i => {
    const sc = i.rating && i.rating.overall != null ? i.rating.overall : null;
    return `<button class="tile" data-act="detail" data-key="${i.key}">${poster(i, 'w342', 'tile-img')}
      ${sc != null ? `<span class="stamp">${sc}</span>` : ''}
      ${i.status !== 'done' ? `<span class="ribbon st-${i.status}">${i.status === 'watching' && i.progress ? `S${i.progress.s}·B${i.progress.e}` : STATUS[i.status]}</span>` : ''}
      <span class="tile-t">${esc(i.title)}</span></button>`;
  }).join('')}</div>`;
}
const paintArchive = () => { if (S.view === 'archive') render(); };

/* ============ İstatistik ============ */
function vStats() {
  const t = mode(), T = TYPES[t];
  const lv = levelOf(xpOf());
  const earned = new Set(S.db.meta.badges || []);
  const mine = itemsOf(t);
  const done = mine.filter(i => i.status === 'done');
  const rated = mine.filter(i => i.rating && i.rating.overall != null);
  const scores = rated.map(i => i.rating.overall);
  const myAvg = avg(scores);
  const vs = rated.filter(i => i.vote > 0);
  const gap = vs.length ? avg(vs.map(i => i.rating.overall)) - avg(vs.map(i => i.vote)) : null;
  let minutes = 0, approx = false;
  for (const i of mine) {
    if (t === 'movie') { if (i.status === 'done' && i.runtime) minutes += i.runtime; }
    else {
      const rt = i.runtime || 45; if (!i.runtime) approx = true;
      if (i.status === 'done') minutes += (i.episodes || (i.seasons || []).reduce((a, s) => a + s.eps, 0) || 10) * rt;
      else if ((i.status === 'watching' || i.status === 'dropped') && i.progress) minutes += ((i.seasons || []).filter(s => s.n < i.progress.s).reduce((a, s) => a + s.eps, 0) + i.progress.e) * rt;
    }
  }
  if (t === 'tv') approx = true;
  const hist = Array.from({ length: 10 }, (_, k) => scores.filter(s => s === k + 1).length);

  const gmap = new Map();
  rated.forEach(i => (i.genres || []).forEach(g => { const e = gmap.get(g.id) || { name: g.name, n: 0, s: 0 }; e.n++; e.s += i.rating.overall; gmap.set(g.id, e); }));
  const genres = [...gmap.values()].filter(g => g.name).sort((a, b) => b.n - a.n).slice(0, 7);
  const gmax = Math.max(1, ...genres.map(g => g.n));

  const pmap = new Map();
  rated.forEach(i => {
    (i.people || []).forEach(p => { const k = 'd' + p.id; const e = pmap.get(k) || { name: p.name, role: t === 'movie' ? 'Yönetmen' : 'Yaratıcı', n: 0, s: 0 }; e.n++; e.s += i.rating.overall; pmap.set(k, e); });
    (i.cast || []).slice(0, 5).forEach(p => { const k = 'c' + p.id; const e = pmap.get(k) || { name: p.name, role: 'Oyuncu', n: 0, s: 0 }; e.n++; e.s += i.rating.overall; pmap.set(k, e); });
  });
  const people = [...pmap.values()].filter(p => p.n >= 2).sort((a, b) => (b.s / b.n) - (a.s / a.n) || b.n - a.n).slice(0, 6);

  const now = new Date();
  const months = Array.from({ length: 12 }, (_, k) => { const d = new Date(now.getFullYear(), now.getMonth() - 11 + k, 1); return { y: d.getFullYear(), m: d.getMonth(), n: 0 }; });
  done.forEach(i => { if (!i.watchedAt) return; const [y, mo] = i.watchedAt.split('-').map(Number); const b = months.find(x => x.y === y && x.m === mo - 1); if (b) b.n++; });

  const det = rated.filter(i => i.rating.sub && Object.keys(i.rating.sub).length);
  let infl = null;
  if (det.length >= 5) {
    const res = CRITERIA[t].map(([k, l]) => {
      const pts = det.filter(i => i.rating.sub[k] != null).map(i => [i.rating.sub[k], i.rating.overall]);
      if (pts.length < 5) return null;
      const mx = avg(pts.map(p => p[0])), my = avg(pts.map(p => p[1]));
      let sxy = 0, sxx = 0, syy = 0; pts.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; });
      return sxx && syy ? { k, l, r: sxy / Math.sqrt(sxx * syy), n: pts.length } : null;
    }).filter(Boolean).sort((a, b) => b.r - a.r);
    infl = res.length ? res : null;
  }

  const P = buildProfile(t);
  const dna = [...P.W.entries()].filter(([f, e]) => f[0] === 'k' && e.w > 0.08 && e.n >= 1.5).sort((a, b) => b[1].w - a[1].w).slice(0, 10).map(([, e]) => e.name);

  return `<div class="page-head"><h1 class="page-title">Profil</h1><p class="muted">${T.plural} istatistikleri. Seviye ve rozetler ortak.</p></div>
  <section class="lv-card">
    <div class="bulbs" aria-hidden="true"></div>
    <p class="eyebrow">Seviye ${lv.i + 1} / ${LEVELS.length}</p>
    <p class="lv-big">${esc(lv.name)}</p>
    <div class="lv-bar big"><i style="width:${Math.round(lv.pct * 100)}%"></i></div>
    <p class="muted mono">${fmtInt(lv.xp)} XP${lv.next ? ` · ${esc(lv.next)} için ${fmtInt(lv.to - lv.xp)} XP` : ' · zirvedesin'}</p>
    <p class="xp-help">İzledim +10 · Puan +2 · Detaylı puan +6 · Not +2 · Öneriden izleme +5</p>
  </section>
  <section class="nums">
    <div class="num"><b>${done.length}</b><span>izlendi</span></div>
    <div class="num"><b>${minutes ? fmtInt(minutes / 60) : '0'}</b><span>${approx ? 'saat (yaklaşık)' : 'saat'}</span></div>
    <div class="num"><b>${fmt1(myAvg)}</b><span>ortalaman</span></div>
    <div class="num"><b>${gap == null ? '—' : (gap > 0 ? '+' : '') + fmt1(gap)}</b><span>TMDB'ye göre</span></div>
  </section>
  ${gap != null && vs.length >= 5 ? `<p class="verdict">${Math.abs(gap) < 0.3 ? 'Puanların TMDB ortalamasıyla neredeyse aynı: dengeli bir seyircisin.' : gap > 0 ? `TMDB ortalamasından ${fmt1(gap)} puan cömertsin.` : `TMDB ortalamasından ${fmt1(-gap)} puan sertsin.`}</p>` : ''}
  <section class="block card">
    <h2 class="sec-title">Puan dağılımın</h2>
    ${scores.length ? histo(hist) : `<p class="empty-line">Puanladıkça burada dağılım oluşacak.</p>`}
  </section>
  ${infl ? `<section class="block card"><h2 class="sec-title">Seni en çok ne etkiliyor?</h2>
    <p class="muted">Alt puanlarının genel puanınla ne kadar birlikte hareket ettiği. ${det.length} detaylı puandan.</p>
    <div class="bars">${infl.slice(0, 5).map((x, k) => `<div class="bar-row ${k === 0 ? 'top' : ''}"><span>${esc(x.l)}</span><span class="bar"><i style="width:${Math.max(4, Math.round(Math.max(0, x.r) * 100))}%"></i></span><b class="mono">${fmt1(x.r * 10)}</b></div>`).join('')}</div>
    <p class="fine">10 = alt puan ile genel puan tam birlikte hareket ediyor.</p></section>`
    : `<section class="block card dim"><h2 class="sec-title">Seni en çok ne etkiliyor?</h2><p class="muted">En az 5 detaylı puanlamadan sonra; senaryo mu, oyunculuk mu, hangisi genel puanını belirliyor, burada görünecek. Şu an: ${det.length}/5.</p></section>`}
  ${genres.length ? `<section class="block card"><h2 class="sec-title">Türler</h2><div class="bars">${genres.map(g => `<div class="bar-row"><span>${esc(g.name)}</span><span class="bar"><i style="width:${Math.round(g.n / gmax * 100)}%"></i></span><b class="mono">${g.n} · ${fmt1(g.s / g.n)}</b></div>`).join('')}</div><p class="fine">Adet · ortalama puanın</p></section>` : ''}
  ${people.length ? `<section class="block card"><h2 class="sec-title">Gözdelerin</h2><ul class="people">${people.map(p => `<li><span><b>${esc(p.name)}</b><small>${p.role} · ${p.n} yapım</small></span><b class="mono">${fmt1(p.s / p.n)}</b></li>`).join('')}</ul></section>` : ''}
  ${dna.length ? `<section class="block card"><h2 class="sec-title">Zevk DNA'n</h2><p class="muted">Yüksek puan verdiklerinde öne çıkan temalar (TMDB anahtar kelimeleri).</p><div class="dna">${dna.map(d => `<span>${esc(d)}</span>`).join('')}</div></section>` : ''}
  <section class="block card"><h2 class="sec-title">Son 12 ay</h2>${months.some(m => m.n) ? monthsChart(months) : `<p class="empty-line">İzleme tarihi girdiğin kayıtlar burada aylara dağılır.</p>`}</section>
  <section class="block"><h2 class="sec-title">Rozetler <span class="muted">${earned.size}/${BADGES.length}</span></h2>
    <div class="badges">${BADGES.map(b => `<div class="badge ${earned.has(b.id) ? 'on' : ''}">${icon(b.ic)}<b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`).join('')}</div>
  </section>`;
}
function histo(c) {
  const max = Math.max(1, ...c), W = 320, H = 130, bw = 24, gap = (W - bw * 10) / 10;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Puan dağılımı">
    <line x1="0" x2="${W}" y1="${H - 22}" y2="${H - 22}" class="axis"/>
    ${c.map((n, k) => { const h = n ? Math.max(3, (n / max) * (H - 48)) : 0; const x = gap / 2 + k * (bw + gap); return `
      ${h ? `<rect x="${x}" y="${H - 22 - h}" width="${bw}" height="${h}" rx="3" class="bar-fill ${k >= 7 ? 'hi' : ''}"/>` : ''}
      ${n ? `<text x="${x + bw / 2}" y="${H - 27 - h}" class="lbl-n">${n}</text>` : ''}
      <text x="${x + bw / 2}" y="${H - 6}" class="lbl">${k + 1}</text>`; }).join('')}
  </svg></div>`;
}
function monthsChart(ms) {
  const max = Math.max(1, ...ms.map(m => m.n)), W = 320, H = 120, bw = 18, gap = (W - bw * 12) / 12;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Aylara göre izleme sayısı">
    <line x1="0" x2="${W}" y1="${H - 22}" y2="${H - 22}" class="axis"/>
    ${ms.map((m, k) => { const h = m.n ? Math.max(3, (m.n / max) * (H - 46)) : 0; const x = gap / 2 + k * (bw + gap); return `
      ${h ? `<rect x="${x}" y="${H - 22 - h}" width="${bw}" height="${h}" rx="3" class="bar-fill ${k === 11 ? 'hi' : ''}"/>` : ''}
      ${m.n ? `<text x="${x + bw / 2}" y="${H - 27 - h}" class="lbl-n">${m.n}</text>` : ''}
      <text x="${x + bw / 2}" y="${H - 6}" class="lbl">${MONTHS[m.m]}</text>`; }).join('')}
  </svg></div>`;
}

/* ============ Detay ============ */
function openDetail(key, ctx = {}) {
  const [type, idS] = key.split(':'); const id = +idS;
  const base = metaOf(key) || { key, type, id, title: '' };
  const w = openSheet(detailHTML(base, ctx, !base.rich), 'detail');
  w.dataset.key = key; w.dataset.ctx = JSON.stringify(ctx);
  getDetails(type, id).then(m => {
    const it = S.db.items[key];
    if (it && !it.rich) { Object.assign(it, itemFields(m)); save(); }
    if (w.isConnected) setSheet(w, detailHTML(m, ctx, false));
  }).catch(e => { if (w.isConnected) { const l = $('.d-loading', w); if (l) l.outerHTML = errorBox(e); } });
}
function refreshDetails() {
  for (const w of sheets) if (w.dataset.key && $('.sheet.detail', w)) {
    const m = metaOf(w.dataset.key); if (m) setSheet(w, detailHTML(m, JSON.parse(w.dataset.ctx || '{}'), !m.rich));
  }
}
function detailHTML(m, ctx, loading) {
  const t = m.type, it = S.db.items[m.key];
  const bits = [m.year, t === 'movie' ? (m.runtime ? m.runtime + ' dk' : '') : (m.seasons && m.seasons.length ? m.seasons.length + ' sezon' : ''), (m.genres || []).map(g => g.name).filter(Boolean).slice(0, 3).join(', ')].filter(Boolean);
  const rec = ctx && ctx.rec;
  const sc = it && it.rating && it.rating.overall != null ? it.rating.overall : null;
  const prov = m.providers;
  return `
  <div class="d-hero" ${m.backdrop ? `style="background-image:url('${img(m.backdrop, 'w780')}')"` : ''}><div class="d-fade"></div></div>
  <div class="d-head">
    ${poster(m, 'w342', 'd-poster')}
    <div class="d-titles">
      <p class="eyebrow">${TYPES[t].label}${m.showStatus === 'Ended' ? ' · bitti' : m.showStatus === 'Returning Series' ? ' · devam ediyor' : ''}</p>
      <h2 class="d-title">${esc(m.title)}</h2>
      ${m.original && m.original !== m.title ? `<p class="d-orig">${esc(m.original)}</p>` : ''}
      <p class="d-meta">${esc(bits.join(' · '))}</p>
      <div class="d-pills">${m.vote ? `<span class="pill mono">TMDB ${fmt1(m.vote)}</span>` : ''}${sc != null ? `<span class="pill mine mono">Senin ${sc}</span>` : ''}${it ? `<span class="pill st-${it.status}">${STATUS[it.status]}</span>` : ''}</div>
    </div>
  </div>
  ${statusBar(m, it)}
  ${it && it.status === 'watching' ? progressBox(m, it) : ''}
  ${rec ? `<div class="d-rec"><span class="d-match mono">%${rec.match}</span><ul class="why">${rec.reasons.map(r => `<li>${r}</li>`).join('')}</ul></div>` : ''}
  ${it && (it.rating || it.note) ? myBox(it) : ''}
  ${m.tagline ? `<p class="d-tagline">“${esc(m.tagline)}”</p>` : ''}
  ${m.overview ? `<p class="d-overview">${esc(m.overview)}</p>` : ''}
  ${loading ? `<div class="d-loading"><span class="dots"><i></i><i></i><i></i></span> Detaylar yükleniyor</div>` : `
    ${m.people && m.people.length ? `<div class="d-row"><h4>${t === 'movie' ? 'Yönetmen' : 'Yaratıcı'}</h4><p>${m.people.map(p => esc(p.name)).join(', ')}</p></div>` : ''}
    ${m.cast && m.cast.length ? `<h4 class="d-h">Oyuncular</h4><div class="cast">${m.cast.slice(0, 10).map(c => `<div class="cast-i">${c.photo ? `<img src="${img(c.photo, 'w185')}" alt="" loading="lazy">` : `<span class="noface">${esc((c.name || '?')[0])}</span>`}<b>${esc(c.name)}</b><small>${esc(c.role || '')}</small></div>`).join('')}</div>` : ''}
    <h4 class="d-h">Türkiye'de nerede izlenir</h4>
    ${prov && (prov.flat.length || prov.rent.length || prov.buy.length) ? `<div class="prov">
        ${prov.flat.length ? `<div class="prov-row"><small>Abonelik</small>${prov.flat.map(p => provLogo(p)).join('')}</div>` : ''}
        ${prov.rent.length ? `<div class="prov-row"><small>Kirala</small>${prov.rent.slice(0, 5).map(p => provLogo(p)).join('')}</div>` : ''}
        ${!prov.flat.length && prov.buy.length ? `<div class="prov-row"><small>Satın al</small>${prov.buy.slice(0, 5).map(p => provLogo(p)).join('')}</div>` : ''}
        <p class="fine">Platform verisi: JustWatch</p></div>`
      : `<p class="muted">Türkiye'deki platformlarda görünmüyor.</p>`}
    <div class="d-links">
      ${m.trailer ? `<a class="btn-ghost" href="https://www.youtube.com/watch?v=${encodeURIComponent(m.trailer)}" target="_blank" rel="noopener">${icon('play')}Fragman</a>` : ''}
      <a class="btn-ghost" href="https://www.themoviedb.org/${t}/${m.id}" target="_blank" rel="noopener">${icon('external')}TMDB</a>
    </div>
    ${it ? `<button class="link danger" data-act="remove" data-key="${m.key}">${icon('trash')}Arşivden kaldır</button><div class="confirm" id="rm-confirm" hidden><p>Bu kayıt, puanı ve notuyla birlikte silinecek.</p><div class="row"><button class="btn-ghost" data-act="remove-cancel">Vazgeç</button><button class="btn-danger" data-act="remove-yes" data-key="${m.key}">Sil</button></div></div>` : ''}
  `}`;
}
const provLogo = p => p.logo ? `<img class="prov-logo" src="${img(p.logo, 'w92')}" alt="${esc(p.name)}" title="${esc(p.name)}" loading="lazy">` : `<span class="prov-name">${esc(p.name)}</span>`;
function statusBar(m, it) {
  const st = it && it.status;
  const b = (s, label, ic) => `<button class="st ${st === s ? 'on' : ''}" data-act="set-status" data-status="${s}" data-key="${m.key}" aria-pressed="${st === s}">${icon(ic)}<span>${label}</span></button>`;
  const rated = it && it.rating;
  return `<div class="st-bar ${m.type}">
    ${b('done', st === 'done' && rated ? 'Puanı düzenle' : 'İzledim', st === 'done' && rated ? 'pen' : 'check')}
    ${m.type === 'tv' ? b('watching', 'İzliyorum', 'play') : ''}
    ${b('want', 'İzleyeceğim', 'plus')}
    ${b('dropped', 'Yarıda', 'pause')}
    ${b('dismissed', 'İlgilenmem', 'x')}
  </div>`;
}
function progressBox(m, it) {
  const p = it.progress || { s: 1, e: 1 };
  const seasons = m.seasons || it.seasons || [];
  const cur = seasons.find(s => s.n === p.s);
  return `<div class="progress">
    <p class="eyebrow">Nerede kaldın</p>
    <div class="prog-row">
      <label class="select sm"><span class="sr">Sezon</span><select id="prog-s" data-key="${m.key}">${(seasons.length ? seasons : [{ n: p.s }]).map(s => `<option value="${s.n}" ${s.n === p.s ? 'selected' : ''}>${s.n}. sezon</option>`).join('')}</select></label>
      <div class="stepper"><button data-act="ep-prev" data-key="${m.key}" aria-label="Bir bölüm geri">${icon('minus')}</button><span class="mono">B${p.e}${cur ? ` / ${cur.eps}` : ''}</span><button data-act="ep-next" data-key="${m.key}" aria-label="Bir bölüm ileri">${icon('plus')}</button></div>
    </div>
  </div>`;
}
function myBox(it) {
  const r = it.rating || {}; const subs = Object.entries(r.sub || {});
  return `<div class="mybox">
    <div class="my-top"><span class="my-score">${r.overall != null ? r.overall : '—'}</span><span><b>${r.overall != null ? WORDS[r.overall] : ''}</b><small>${it.watchedAt ? new Date(it.watchedAt + 'T12:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Tarih yok'}</small></span></div>
    ${subs.length ? `<div class="my-subs">${subs.map(([k, v]) => `<span><small>${esc(CRIT_LABEL[k] || k)}</small><b class="mono">${v}</b></span>`).join('')}</div>` : ''}
    ${it.tags && it.tags.length ? `<div class="dna">${it.tags.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
    ${it.note ? `<p class="my-note">${esc(it.note)}</p>` : ''}
  </div>`;
}

/* ============ Puanlama ============ */
function openRate(key, status = 'done') {
  const m = metaOf(key); if (!m) return;
  const it = S.db.items[key]; const r = (it && it.rating) || {};
  const state = {
    overall: r.overall ?? null, sub: Object.assign({}, r.sub || {}), tags: new Set((it && it.tags) || []),
    note: (it && it.note) || '', date: (it && it.watchedAt) || todayISO(), noDate: !!(it && it.rating && !it.watchedAt),
    mode: S.db.settings.rateMode, status,
  };
  const w = openSheet(rateHTML(m, state), 'rate ' + (state.mode === 'quick' ? 'is-quick' : ''));
  w.dataset.key = key; w._state = state;
}
function rateHTML(m, s) {
  const crits = CRITERIA[m.type].filter(([k]) => k !== 'finale' || s.status === 'done');
  const extraTags = [...s.tags].filter(x => !TAGS.includes(x));
  return `
  <div class="rate-head">${poster(m, 'w185', 'rate-poster')}<div><p class="eyebrow">${s.status === 'dropped' ? 'Yarıda bıraktım' : 'İzledim'}</p><h2 class="rate-title">${esc(m.title)}</h2><p class="muted">${esc(metaLine(m))}</p></div></div>
  <div class="seg" role="tablist" aria-label="Puanlama türü">
    <button data-act="rate-mode" data-mode="quick" class="${s.mode === 'quick' ? 'on' : ''}" role="tab">Hızlı</button>
    <button data-act="rate-mode" data-mode="detailed" class="${s.mode === 'detailed' ? 'on' : ''}" role="tab">Detaylı</button>
  </div>
  <div class="overall">
    <div class="ov-top"><span>Genel puan</span><output class="ov-out mono" id="ov-out">${s.overall ?? '—'}</output></div>
    ${strip(s.overall, 'rate-overall')}
    <p class="ov-word" id="ov-word">${s.overall ? WORDS[s.overall] : 'Bir kare seç'}</p>
  </div>
  <div class="subs">
    <p class="sub-hint">Alt puanlar isteğe bağlı. Kaydırınca işaretlenir, boş kalanlar hesaba katılmaz.</p>
    ${crits.map(([k, l]) => `<div class="sub ${s.sub[k] != null ? 'is-set' : ''}" data-k="${k}">
      <label for="sub-${k}">${l}</label>
      <input type="range" min="1" max="10" step="1" id="sub-${k}" class="sub-range" data-k="${k}" value="${s.sub[k] ?? 5}">
      <output class="mono" id="out-${k}">${s.sub[k] ?? '—'}</output>
      <button class="sub-x" data-act="sub-clear" data-k="${k}" aria-label="${l} puanını temizle">${icon('x')}</button>
    </div>`).join('')}
    <h4 class="d-h">Etiketler</h4>
    <div class="tags" id="tags">${[...TAGS, ...extraTags].map(x => `<button class="tag ${s.tags.has(x) ? 'on' : ''}" data-act="tag" data-tag="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div class="tag-add"><input id="tag-new" placeholder="Kendi etiketin" maxlength="24" autocomplete="off"><button class="btn-ghost sm" data-act="tag-add">Ekle</button></div>
    <label class="note-l" for="rate-note">Not</label>
    <textarea id="rate-note" rows="3" maxlength="800" placeholder="Aklında kalan sahne, replik ya da düşünce">${esc(s.note)}</textarea>
  </div>
  <div class="date-row">
    <label for="rate-date">İzleme tarihi</label>
    <input type="date" id="rate-date" value="${esc(s.date)}" max="${todayISO()}" ${s.noDate ? 'disabled' : ''}>
    <label class="chk"><input type="checkbox" id="rate-nodate" ${s.noDate ? 'checked' : ''}> Hatırlamıyorum</label>
  </div>
  <button class="btn-primary wide" data-act="rate-save">${S.db.items[m.key] && S.db.items[m.key].rating ? 'Güncelle' : 'Arşive ekle'}</button>`;
}
function strip(v, act) {
  return `<div class="strip" role="radiogroup" aria-label="1'den 10'a puan">${Array.from({ length: 10 }, (_, k) => k + 1).map(n => `<button class="frame ${v && n <= v ? 'lit' : ''} ${v === n ? 'cur' : ''}" data-act="${act}" data-v="${n}" role="radio" aria-checked="${v === n}">${n}</button>`).join('')}</div>`;
}
function paintStrip(root, v) {
  $$('.frame', root).forEach(b => { const n = +b.dataset.v; b.classList.toggle('lit', n <= v); b.classList.toggle('cur', n === v); b.setAttribute('aria-checked', String(n === v)); });
}
function saveRating(w) {
  const s = w._state, key = w.dataset.key, m = metaOf(key);
  if (s.overall == null) { const st = $('.overall', w); st.classList.remove('shake'); void st.offsetWidth; st.classList.add('shake'); toast('Önce genel puanı seç.'); return; }
  const prevXp = xpOf();
  const prev = S.db.items[key];
  const wasDone = prev && prev.status === 'done';
  const sub = {}; for (const [k, v] of Object.entries(s.sub)) if (v != null) sub[k] = v;
  const keepSub = s.mode === 'quick' && prev && prev.rating ? prev.rating.sub || {} : sub;
  const patch = {
    status: s.status, rating: { overall: s.overall, sub: keepSub, ratedAt: Date.now() },
    tags: [...s.tags], note: s.note.trim(), watchedAt: s.noDate ? null : (s.date || null),
  };
  if (m.type === 'tv' && s.status === 'done') patch.progress = null;
  upsert(m, patch);
  if (!wasDone && s.status === 'done' && S.recKeys.has(key)) S.db.meta.recWatched = (S.db.meta.recWatched || 0) + 1;
  S.db.settings.rateMode = s.mode; save();
  requestPersist();
  closeSheet(w);
  afterChange(prevXp);
  refreshAll();
}

/* ============ Hızlı puanla ============ */
async function openQuick() {
  if (!getKey()) { openWelcome(); return; }
  S.deckRun = 0;
  const w = openSheet(`<div class="qd-load"><span class="dots"><i></i><i></i><i></i></span> Kartlar karılıyor</div>`, 'quickdeck tall');
  w.dataset.quick = '1';
  await nextCard(w);
}
async function nextCard(w) {
  const t = mode();
  let m = nextFromDeck(t);
  if (!m) { try { await refillDeck(t); } catch (e) { if (w.isConnected) setSheet(w, errorBox(e)); return; } m = nextFromDeck(t); }
  if (!m) { try { await refillDeck(t); } catch { /* yoksay */ } m = nextFromDeck(t); }
  if (!w.isConnected) return;
  if (!m) { setSheet(w, `<p class="empty-line">Şimdilik kart kalmadı. Biraz sonra tekrar dene.</p>`); return; }
  S.deckSeen.add(m.key); remember(m);
  w.dataset.card = m.key;
  setSheet(w, quickHTML(m));
  if (S.deck[t].length < 6) refillDeck(t).catch(() => {});
}
function quickHTML(m) {
  const T = TYPES[m.type];
  const total = itemsOf(m.type).filter(i => userScore(i) != null).length;
  return `<div class="qd">
    <div class="qd-top"><p class="eyebrow">${icon('bolt')}Hızlı Puanla · ${T.plural}</p><p class="qd-count mono">Bu tur <b>${S.deckRun}</b> · Toplam <b>${total}</b></p></div>
    <div class="qd-card" id="qd-card">
      <img src="${img(m.poster, 'w500')}" alt="">
      <div class="qd-info"><h2>${esc(m.title)} <span>${esc(m.year)}</span></h2><p>${esc((m.genres || []).map(g => g.name).filter(Boolean).slice(0, 3).join(' · '))}</p></div>
    </div>
    <p class="qd-q">İzlediysen puanla</p>
    ${strip(null, 'qd-rate')}
    <div class="qd-actions">
      <button class="btn-ghost" data-act="qd-skip">İzlemedim</button>
      <button class="btn-ghost" data-act="qd-want">${icon('plus')}İzleyeceğim</button>
      <button class="btn-ghost" data-act="qd-nope">${icon('x')}İlgilenmem</button>
    </div>
    <button class="link center" data-act="detail" data-key="${m.key}">Detayını gör</button>
  </div>`;
}
function deckAdvance(w, dir) {
  const c = $('#qd-card', w);
  if (c && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    c.classList.add(dir === 'up' ? 'fly-up' : dir === 'right' ? 'fly-right' : 'fly-left');
    setTimeout(() => nextCard(w), 260);
  } else nextCard(w);
}

/* ============ Ayarlar & karşılama ============ */
function openSettings() {
  const n = Object.keys(S.db.items).length;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  openSheet(`
    <h2 class="sheet-title">Ayarlar</h2>
    <section class="set">
      <h3>TMDB anahtarı</h3>
      <p class="muted">Sadece bu cihazda saklanır. API Key ya da API Read Access Token yapıştırabilirsin.</p>
      <div class="key-row"><input type="password" id="api-key" value="${esc(getKey())}" autocomplete="off" spellcheck="false" placeholder="Anahtarı yapıştır"><button class="btn-primary sm" data-act="key-save">Kaydet</button></div>
      <p class="key-status muted" id="key-status">${getKey() ? 'Kayıtlı bir anahtar var.' : 'Henüz anahtar yok.'}</p>
    </section>
    <section class="set">
      <h3>Öneri motoru</h3>
      <label class="switch-row"><span><b>Film ve dizi zevkini harmanla</b><small>Açıkken film önerilerine dizi puanların, dizi önerilerine film puanların küçük bir katkı yapar (%20). Bir tarafta az puan varken bu katkı %60'a kadar çıkar, puan arttıkça azalır.</small></span><input type="checkbox" id="cross" class="switch" ${S.db.settings.cross ? 'checked' : ''}></label>
    </section>
    <section class="set">
      <h3>Yedek</h3>
      <p class="muted">Arşivin (${n} kayıt) sadece bu cihazın tarayıcısında duruyor. Ara sıra yedek al; telefon değişince yedekten yüklersin.</p>
      <div class="row"><button class="btn-ghost" data-act="export">Yedeği indir</button><label class="btn-ghost file-btn">Yedekten yükle<input type="file" id="import" accept="application/json,.json"></label></div>
      ${standalone ? '' : `<p class="tip">${icon('plus')}<span>iPhone'da Safari'de <b>Paylaş → Ana Ekrana Ekle</b> ile ekle. Ana ekrandan açınca uygulama gibi çalışır ve Safari verileri silmez.</span></p>`}
    </section>
    <section class="set danger">
      <h3>Sıfırla</h3>
      <button class="btn-ghost danger" data-act="wipe">${icon('trash')}Tüm arşivi sil</button>
      <div class="confirm" id="wipe-confirm" hidden><p>${n} kaydın tamamı silinecek. Önce yedek almak isteyebilirsin.</p><div class="row"><button class="btn-ghost" data-act="wipe-cancel">Vazgeç</button><button class="btn-danger" data-act="wipe-yes">Hepsini sil</button></div></div>
    </section>
    <p class="fine tmdb-note">Bu uygulama TMDB API'sini kullanır, ancak TMDB tarafından onaylanmamış ya da sertifikalandırılmamıştır. Platform bilgileri JustWatch kaynaklıdır.</p>
  `, 'settings');
}
function openWelcome() {
  const w = openSheet(`
    <div class="welcome">
      <div class="bulbs" aria-hidden="true"></div>
      <p class="brand-word big">SEANS</p>
      <p class="welcome-sub">Kendi film ve dizi arşivin. Puanladıkça seni tanır, bu gece ne izleyeceğini o seçer.</p>
      <ol class="steps">
        <li><b>Puanla</b><span>Eskiden izlediklerini hızlıca, yenileri detaylıca.</span></li>
        <li><b>Öner'e bas</b><span>Zevkine göre 5 seçim, her birinin nedeniyle.</span></li>
        <li><b>İzle, işaretle</b><span>Arşivin büyür, öneriler keskinleşir.</span></li>
      </ol>
      <label class="note-l" for="w-key">TMDB anahtarın</label>
      <div class="key-row"><input type="password" id="w-key" autocomplete="off" spellcheck="false" placeholder="API Key ya da Read Access Token"><button class="btn-primary sm" data-act="welcome-save">Başla</button></div>
      <p class="key-status muted" id="w-status">Anahtar sadece bu cihazda saklanır.</p>
      <p class="fine">Anahtarın yoksa: <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">themoviedb.org → Ayarlar → API</a></p>
    </div>`, 'welcome-sheet tall');
  w.dataset.welcome = '1';
}
async function testAndSaveKey(input, statusEl, onOk) {
  const k = input.value.trim();
  if (!k) { statusEl.textContent = 'Anahtar boş.'; return; }
  statusEl.textContent = 'Kontrol ediliyor…';
  try {
    await tmdb('/configuration', { language: null }, k);
    lsSet(KEY_KEY, k);
    statusEl.textContent = 'Anahtar çalışıyor, kaydedildi.';
    runEnrich();
    onOk && onOk();
  } catch (e) { statusEl.innerHTML = errText(e); }
}
function exportData() {
  const data = { app: 'seans', version: 1, exportedAt: new Date().toISOString(), items: S.db.items, settings: Object.assign({}, S.db.settings), meta: S.db.meta };
  const name = `seans-yedek-${todayISO()}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const file = typeof File === 'function' ? new File([blob], name, { type: 'application/json' }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'Seans yedeği' }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Yedek indirildi.');
}
function importData(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(fr.result);
      if (!d || d.app !== 'seans' || !d.items) throw new Error('format');
      let added = 0, updated = 0;
      for (const [k, it] of Object.entries(d.items)) {
        const cur = S.db.items[k];
        if (!cur) { S.db.items[k] = it; added++; }
        else if ((it.updatedAt || 0) > (cur.updatedAt || 0)) { S.db.items[k] = it; updated++; }
      }
      if (d.meta && d.meta.recWatched > (S.db.meta.recWatched || 0)) S.db.meta.recWatched = d.meta.recWatched;
      save(); afterChange(xpOf(), true);
      toast(`Yedek yüklendi: ${added} yeni, ${updated} güncellenen kayıt.`);
      Object.values(S.db.items).forEach(i => { if (!i.rich) enrichQ.add(i.key); }); runEnrich();
      refreshAll();
    } catch { toast('Bu dosya bir Seans yedeği gibi görünmüyor.', 'err'); }
  };
  fr.readAsText(file);
}
function requestPersist() {
  if (S.persistAsked) return; S.persistAsked = true;
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {}); } catch { /* yok */ }
}

/* ============ Eylemler ============ */
function refreshAll() { render(); refreshDetails(); }
function stepEpisode(key, dir) {
  const it = S.db.items[key]; if (!it) return;
  const prevXp = xpOf();
  const p = Object.assign({ s: 1, e: 1 }, it.progress);
  const seasons = it.seasons || [];
  const cur = seasons.find(s => s.n === p.s);
  if (dir > 0) {
    if (cur && p.e >= cur.eps) {
      const nx = seasons.find(s => s.n > p.s);
      if (nx) { p.s = nx.n; p.e = 1; toast(`${nx.n}. sezona geçtin.`); }
      else { toast('Son bölümdü. Diziyi bitirdiysen puanla.'); openRate(key, 'done'); return; }
    } else p.e++;
  } else {
    if (p.e > 1) p.e--;
    else { const pv = [...seasons].reverse().find(s => s.n < p.s); if (pv) { p.s = pv.n; p.e = pv.eps; } }
  }
  upsert(it, { status: 'watching', progress: p });
  afterChange(prevXp, true);
  refreshAll();
}
function setStatus(key, status, fromEl) {
  const m = metaOf(key); if (!m) return;
  const it = S.db.items[key];
  if (status === 'done' || status === 'dropped') { openRate(key, status); return; }
  const prevXp = xpOf();
  if (it && it.status === status && !it.rating) {
    removeItem(key);
    toast(status === 'want' ? 'Listeden çıkarıldı.' : status === 'dismissed' ? 'Tekrar önerilebilir.' : 'Kaldırıldı.');
  } else if (status === 'watching') {
    upsert(m, { status, progress: (it && it.progress) || { s: 1, e: 1 } });
    toast('İzlediklerine eklendi. Bölüm takibi ana sayfada.');
  } else if (status === 'want') {
    upsert(m, { status }); toast('Listene eklendi.');
  } else if (status === 'dismissed') {
    upsert(m, { status }); toast('Tamam, bunu bir daha önermem.');
  }
  afterChange(prevXp, true);
  if (fromEl && fromEl.closest('.ticket')) { const tk = fromEl.closest('.ticket'); tk.classList.add('pop'); }
  refreshAll();
}

const ACT = {
  'go': el => { S.view = el.dataset.view; while (sheets.length) closeSheet(); render(); window.scrollTo({ top: 0 }); },
  'mode': el => { if (S.db.settings.mode === el.dataset.mode) return; S.db.settings.mode = el.dataset.mode; save(); S.search = { q: '', res: [], loading: false, err: '' }; render(); },
  'settings': () => openSettings(),
  'close-sheet': el => closeSheet(sheets.find(w => w.contains(el))),
  'detail': el => openDetail(el.dataset.key, (() => { const t = mode(); const R = S.recs[t]; const x = R && R.list && R.list.find(x => x.m.key === el.dataset.key); return x ? { rec: { match: x.match, reasons: x.reasons } } : {}; })()),
  'set-status': el => setStatus(el.dataset.key, el.dataset.status, el),
  'archive-filter': el => { S.archive.status = el.dataset.status; S.view = 'archive'; render(); },
  'suggest': async () => {
    if (!getKey()) { openWelcome(); return; }
    const t = mode();
    S.recs[t] = { loading: true }; refreshRecs();
    const msgs = ['Arşivin taranıyor…', 'Zevk profilin çıkarılıyor…', 'Benzer yapımlar toplanıyor…', 'Uyum hesaplanıyor…', 'Biletler basılıyor…'];
    let k = 0; clearInterval(recTicker);
    recTicker = setInterval(() => { const el = $('#proj-text'); if (el) el.textContent = msgs[++k % msgs.length]; }, 900);
    const recsEl = $('#recs'); if (recsEl) recsEl.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    try { S.recs[t] = await recommend(t); } catch (e) { S.recs[t] = { error: errText(e) }; }
    clearInterval(recTicker);
    if (S.view === 'home' && mode() === t) refreshRecs();
  },
  'quick': () => openQuick(),
  'ep-next': el => stepEpisode(el.dataset.key, 1),
  'ep-prev': el => stepEpisode(el.dataset.key, -1),
  'remove': el => { const c = $('#rm-confirm', el.closest('.sheet')); if (c) c.hidden = false; },
  'remove-cancel': el => { const c = el.closest('.confirm'); if (c) c.hidden = true; },
  'remove-yes': el => { removeItem(el.dataset.key); afterChange(xpOf(), true); toast('Arşivden kaldırıldı.'); refreshAll(); },
  'rate-overall': el => { const w = el.closest('.sheet-wrap'); const s = w._state; s.overall = +el.dataset.v; paintStrip(w, s.overall); $('#ov-out', w).textContent = s.overall; $('#ov-word', w).textContent = WORDS[s.overall]; },
  'rate-mode': el => { const w = el.closest('.sheet-wrap'); w._state.mode = el.dataset.mode; $$('.seg button', w).forEach(b => b.classList.toggle('on', b === el)); $('.sheet', w).classList.toggle('is-quick', el.dataset.mode === 'quick'); },
  'sub-clear': el => { const w = el.closest('.sheet-wrap'); const k = el.dataset.k; delete w._state.sub[k]; const row = el.closest('.sub'); row.classList.remove('is-set'); $('output', row).textContent = '—'; },
  'tag': el => { const w = el.closest('.sheet-wrap'); const s = w._state; const x = el.dataset.tag; if (s.tags.has(x)) s.tags.delete(x); else s.tags.add(x); el.classList.toggle('on', s.tags.has(x)); },
  'tag-add': el => addTag(el.closest('.sheet-wrap')),
  'rate-save': el => saveRating(el.closest('.sheet-wrap')),
  'qd-rate': el => {
    const w = el.closest('.sheet-wrap'); const key = w.dataset.card; const m = metaOf(key); if (!m) return;
    const v = +el.dataset.v; paintStrip(w, v);
    const prevXp = xpOf();
    upsert(m, { status: 'done', rating: { overall: v, sub: {}, ratedAt: Date.now() }, watchedAt: null, tags: [], note: '' });
    S.deckRun++; requestPersist(); afterChange(prevXp);
    if (v >= 8) boostFrom(m);
    setTimeout(() => deckAdvance(w, 'up'), 160);
  },
  'qd-skip': el => deckAdvance(el.closest('.sheet-wrap'), 'left'),
  'qd-want': el => { const w = el.closest('.sheet-wrap'); const m = metaOf(w.dataset.card); if (m) { const p = xpOf(); upsert(m, { status: 'want' }); afterChange(p, true); toast('Listene eklendi.'); } deckAdvance(w, 'right'); },
  'qd-nope': el => { const w = el.closest('.sheet-wrap'); const m = metaOf(w.dataset.card); if (m) upsert(m, { status: 'dismissed' }); deckAdvance(w, 'left'); },
  'key-save': el => { const w = el.closest('.sheet-wrap'); testAndSaveKey($('#api-key', w), $('#key-status', w), () => { S.recs = { movie: null, tv: null }; }); },
  'welcome-save': el => { const w = el.closest('.sheet-wrap'); testAndSaveKey($('#w-key', w), $('#w-status', w), () => { closeSheet(w); toast('Hazırsın. Hızlı Puanla ile başla.'); render(); }); },
  'export': () => exportData(),
  'wipe': el => { const c = $('#wipe-confirm', el.closest('.sheet')); if (c) c.hidden = false; },
  'wipe-cancel': el => { el.closest('.confirm').hidden = true; },
  'wipe-yes': () => { S.db.items = {}; S.db.meta = { recWatched: 0, badges: [] }; save(); S.recs = { movie: null, tv: null }; S.recShown = { movie: new Set(), tv: new Set() }; while (sheets.length) closeSheet(); toast('Arşiv silindi.'); render(); },
};
function addTag(w) {
  const inp = $('#tag-new', w); const x = inp.value.trim().slice(0, 24); if (!x) return;
  const s = w._state; s.tags.add(x);
  if (!$$('.tag', w).some(b => b.dataset.tag === x)) $('#tags', w).insertAdjacentHTML('beforeend', `<button class="tag on" data-act="tag" data-tag="${esc(x)}">${esc(x)}</button>`);
  else $$('.tag', w).forEach(b => { if (b.dataset.tag === x) b.classList.add('on'); });
  inp.value = '';
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  e.preventDefault(); fn(el, e);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'q') doSearch(el.value);
  else if (el.id === 'arch-q') { S.archive.q = el.value; const g = $('#arch-grid'); if (g) { const t = mode(); render(); const n = $('#arch-q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } } }
  else if (el.classList.contains('sub-range')) {
    const w = el.closest('.sheet-wrap'); const k = el.dataset.k; w._state.sub[k] = +el.value;
    const row = el.closest('.sub'); row.classList.add('is-set'); $('output', row).textContent = el.value;
  } else if (el.id === 'rate-note') el.closest('.sheet-wrap')._state.note = el.value;
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'arch-sort') { S.archive.sort = el.value; render(); }
  else if (el.id === 'rate-date') el.closest('.sheet-wrap')._state.date = el.value;
  else if (el.id === 'rate-nodate') { const w = el.closest('.sheet-wrap'); w._state.noDate = el.checked; $('#rate-date', w).disabled = el.checked; }
  else if (el.id === 'cross') { S.db.settings.cross = el.checked; save(); S.recs = { movie: null, tv: null }; toast(el.checked ? 'Harmanlama açık.' : 'Harmanlama kapalı: film ve dizi önerileri tamamen ayrı.'); }
  else if (el.id === 'import' && el.files && el.files[0]) { importData(el.files[0]); el.value = ''; }
  else if (el.id === 'prog-s') { const it = S.db.items[el.dataset.key]; if (it) { upsert(it, { progress: { s: +el.value, e: 1 } }); refreshAll(); } }
  else if (el.classList.contains('sub-range')) { /* input zaten işledi */ }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sheets.length) closeSheet();
  if (e.key === 'Enter' && e.target.id === 'tag-new') { e.preventDefault(); addTag(e.target.closest('.sheet-wrap')); }
  if (e.key === 'Enter' && e.target.id === 'api-key') { e.preventDefault(); ACT['key-save'](e.target); }
  if (e.key === 'Enter' && e.target.id === 'w-key') { e.preventDefault(); ACT['welcome-save'](e.target); }
});

/* ============ Başlat ============ */
function init() {
  $('#btn-settings').innerHTML = icon('gear');
  const tabs = { home: ['home', 'Seans'], search: ['search', 'Ara'], archive: ['archive', 'Arşiv'], stats: ['stats', 'Profil'] };
  for (const [v, [ic, l]] of Object.entries(tabs)) $('#tab-' + v).innerHTML = `${icon(ic)}<span>${l}</span>`;
  loadDB();
  if (!S.db.meta.badges || !S.db.meta.badges.length) S.db.meta.badges = earnedBadges();
  render();
  if (!getKey()) openWelcome();
  else { Object.values(S.db.items).forEach(i => { if (!i.rich) enrichQ.add(i.key); }); runEnrich(); }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
