'use strict';
/* Seans — Kitap bölümü.
   Veri kaynağı: Open Library (anahtarsız). Öneri motoru yok: öneri için "Okuma profilimi kopyala".
   Bu dosya app.js'ten önce yüklenir; buradaki fonksiyonlar app.js'teki yardımcıları çağrı anında kullanır. */

const BOOK_TAGS = ['Kısa ve yoğun', 'İçe dönük', 'Kafa yoran', 'Ağlattı', 'Güldürdü', 'Klasik', 'Distopya', 'Felsefe', 'Bilim', 'Şiir', 'Tiyatro', 'Hafif', 'Abartılmış'];
const STATUS_BOOK = { want: 'Okuyacağım', watching: 'Okuyorum', done: 'Okudum', dropped: 'Yarıda bıraktım', dismissed: 'İlgilenmiyorum' };
const SPINE_COLORS = ['#7b2d3b', '#2f4f6f', '#56662c', '#8a5a2b', '#45346a', '#2c5c53', '#6e2f5d', '#7d6d33', '#4b4b55', '#7a3f2a', '#3b5d7a', '#5f3a2e'];
const OL = 'https://openlibrary.org';
const BOOK_IMPORT_URL = 'data/kitaplar-1000kitap.json';

const isBook = x => x && x.type === 'book';
const bookItems = () => Object.values(S.db.items).filter(isBook);
function hashStr(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
const authorColor = a => SPINE_COLORS[hashStr(a || '?') % SPINE_COLORS.length];
function normTr(s) {
  return String(s || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
const bookCoverUrl = (id, size) => `https://covers.openlibrary.org/b/id/${id}-${size}.jpg`;
const fmtDate = iso => iso ? new Date(iso + 'T12:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);

/* Kapak: Open Library'den; yoksa yazara göre renklenen yazı kapağı */
function bookPoster(m, size, cls) {
  if (m.cover) return `<img class="${cls}" src="${bookCoverUrl(m.cover, /w(342|500|780)/.test(size) ? 'L' : 'M')}" alt="" loading="lazy" decoding="async">`;
  return `<div class="${cls} noposter bgen" style="--bc:${authorColor(m.author)}"><b>${esc(m.title)}</b><small>${esc(m.author || '')}</small></div>`;
}
const bookMeta = m => [m.author, m.pages ? m.pages + ' sayfa' : ''].filter(Boolean).join(' · ');

/* ---- Open Library ---- */
async function olGet(path) {
  let r;
  try { r = await fetch(OL + path, { headers: { accept: 'application/json' } }); } catch { throw new Error('NET'); }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
function bookFromOL(d) {
  const id = String(d.key || '').split('/').pop();
  return {
    key: 'book:' + id, type: 'book', id, title: d.title || '', author: (d.author_name || [])[0] || '',
    pages: d.number_of_pages_median || null, cover: d.cover_i || null, olKey: d.key || null,
    subjects: (d.subject || []).slice(0, 12), year: d.first_publish_year ? String(d.first_publish_year) : '', rich: true,
  };
}
async function olSearch(q) {
  const fields = 'key,title,author_name,cover_i,number_of_pages_median,subject,language,first_publish_year';
  const d = await olGet(`/search.json?q=${encodeURIComponent(q)}&fields=${fields}&limit=24`);
  const docs = (d.docs || []).filter(x => x.key && x.title);
  docs.sort((a, b) => ((b.language || []).includes('tur') ? 1 : 0) - ((a.language || []).includes('tur') ? 1 : 0) || (b.cover_i ? 1 : 0) - (a.cover_i ? 1 : 0));
  return docs.map(bookFromOL);
}
// Arşivde aynı kitap (adı ve yazarın soyadı aynı) varsa onu döndürür; içe aktarılanlarla çift kayıt oluşmasın
function bookTwin(m) {
  if (S.db.items[m.key]) return S.db.items[m.key];
  const t = normTr(m.title), a = normTr(m.author).split(' ').pop();
  return bookItems().find(i => normTr(i.title) === t && (!a || normTr(i.author).includes(a))) || null;
}
async function bookDescription(m) {
  if (!m.olKey) return '';
  const ck = 'bdesc:' + m.olKey, hit = cacheGet(ck);
  if (hit) return hit.d || '';
  try {
    const d = await olGet(m.olKey + '.json');
    const s = typeof d.description === 'string' ? d.description : (d.description && d.description.value) || '';
    const clean = s.split(/\n-{3,}|\(\[source\]|\[source\]/)[0].trim();
    cachePut(ck, { d: clean });
    return clean;
  } catch { return ''; }
}

/* ---- Kitaplık (ana ekran) ---- */
function shelfPrefs() { return S.db.settings.shelf || (S.db.settings.shelf = { view: 'spine', sort: 'recent' }); }
const bookGoal = () => S.db.settings.bookGoal || 10;
function goalCount(year) { return bookItems().filter(i => i.status === 'done' && i.watchedAt && +i.watchedAt.slice(0, 4) === year).length; }

function vBookHome() {
  const all = bookItems(), done = all.filter(i => i.status === 'done');
  const reading = all.filter(i => i.status === 'watching').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const want = all.filter(i => i.status === 'want').sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  const unrated = done.filter(i => !(i.rating && i.rating.overall != null)).length;
  const imported = all.some(i => i.src === '1000kitap');
  const year = new Date().getFullYear(), g = bookGoal(), gc = goalCount(year);
  const pages = done.reduce((a, i) => a + (i.pages || 0), 0);
  const P = shelfPrefs();
  return `
  <section class="lib-hero">
    <p class="eyebrow">Kitaplık</p>
    <h1 class="hero-title">Ne okuyoruz?</h1>
    <p class="hero-sub">${done.length ? `${fmtInt(done.length)} kitap · ${fmtInt(pages)} sayfa` : 'Okuduklarını ekle, kitaplığın burada dolsun.'}</p>
    <button class="goal" data-act="go" data-view="stats" aria-label="${year} okuma hedefi">
      <span class="goal-top"><b>${year} hedefi</b><span class="mono">${gc} / ${g}</span></span>
      <span class="goal-bar"><i style="width:${Math.min(100, Math.round(gc / g * 100))}%"></i></span>
      <small>${gc >= g ? 'Hedefe ulaştın.' : `${g - gc} kitap kaldı`}</small>
    </button>
  </section>
  ${imported ? '' : `<button class="quick-card import-card" data-act="book-import">
      <span class="qc-icon">${icon('stack')}</span>
      <span class="qc-text"><b>1000Kitap listeni aktar</b><small>160 kitap; tarihler, sayfa sayıları ve verdiğin puanlarla. Tek dokunuş.</small></span>
    </button>`}
  <section class="block">
    <h2 class="sec-title">Okuyorum</h2>
    ${reading.length ? `<div class="cont-list">${reading.map(readingRow).join('')}</div>`
      : `<p class="empty-line">Şu an okuduğun bir kitap yok. <b>Ara</b>'dan bulup <b>Okuyorum</b> dersen sayfa takibi burada başlar.</p>`}
  </section>
  ${unrated ? `<button class="quick-card" data-act="quick">
      <span class="qc-icon">${icon('bolt')}</span>
      <span class="qc-text"><b>Hızlı Puanla</b><small>Okuduğun ${unrated} kitabın puanı yok. Tek dokunuşla puanla; profilin ve istatistiklerin keskinleşir.</small></span>
      <span class="qc-count"><b>${unrated}</b><small>puansız</small></span>
    </button>` : ''}
  <section class="block">
    <div class="sec-head"><h2 class="sec-title">Okuyacağım</h2>${want.length ? `<button class="link" data-act="archive-filter" data-status="want">Tümü</button>` : ''}</div>
    ${want.length ? `<div class="shelf">${want.slice(0, 16).map(i => `<button class="shelf-item" data-act="detail" data-key="${i.key}">${bookPoster(i, 'w185', 'shelf-img')}<span>${esc(i.title)}</span></button>`).join('')}</div>`
      : `<p class="empty-line">Henüz boş. Önerdiğim kitaplar ve <b>Okuyacağım</b> dediklerin burada durur.</p>`}
  </section>
  <section class="block">
    <div class="sec-head"><h2 class="sec-title">Okuduklarım</h2><span class="muted mono">${done.length}</span></div>
    ${done.length ? `<div class="shelf-tools">
        <div class="seg sm" role="tablist" aria-label="Görünüm">
          <button data-act="shelf-view" data-v="spine" class="${P.view === 'spine' ? 'on' : ''}">Sırt</button>
          <button data-act="shelf-view" data-v="cover" class="${P.view === 'cover' ? 'on' : ''}">Kapak</button>
        </div>
        <label class="select sm"><span class="sr">Sırala</span><select id="shelf-sort">
          ${[['recent', 'Son okunan'], ['score', 'Puan'], ['author', 'Yazar'], ['length', 'Uzunluk']].map(([v, l]) => `<option value="${v}" ${P.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
      </div>
      ${bookcase(done, P)}` : `<p class="empty-line">Okuduğun kitaplar raflara dizilecek.</p>`}
  </section>`;
}
function readingRow(i) {
  const p = (i.progress && i.progress.page) || 0, tot = i.pages || 0, pct = tot ? Math.min(100, Math.round(p / tot * 100)) : 0;
  return `<div class="cont book">
    <button class="cont-poster" data-act="detail" data-key="${i.key}">${bookPoster(i, 'w154', '')}</button>
    <div class="cont-body"><b>${esc(i.title)}</b><span class="mono">s. ${p}${tot ? ` / ${tot} · %${pct}` : ''}</span><span class="pbar"><i style="width:${pct}%"></i></span></div>
    <button class="btn-chip" data-act="pg-step" data-d="10" data-key="${i.key}">${icon('plus')}10 s.</button>
  </div>`;
}
function sortBooks(list, sort) {
  const by = {
    recent: (a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || '') || (a.listNo || 0) - (b.listNo || 0),
    score: (a, b) => (userScore(b) ?? (b.liked ? 0.5 : -1)) - (userScore(a) ?? (a.liked ? 0.5 : -1)) || (b.watchedAt || '').localeCompare(a.watchedAt || ''),
    author: (a, b) => (a.author || '').localeCompare(b.author || '', 'tr') || (a.title || '').localeCompare(b.title || '', 'tr'),
    length: (a, b) => (b.pages || 0) - (a.pages || 0),
  };
  return list.slice().sort(by[sort] || by.recent);
}
function bookcase(list, P) {
  const L = sortBooks(list, P.sort), rows = [];
  const per = P.view === 'spine' ? 11 : 4;
  for (let i = 0; i < L.length; i += per) rows.push(L.slice(i, i + per));
  if (P.view === 'cover') {
    return `<div class="bookcase">${rows.map(r => `<div class="shelf-row covers">${r.map(i => {
      const sc = i.rating && i.rating.overall != null ? i.rating.overall : null;
      return `<button class="bk" data-act="detail" data-key="${i.key}" aria-label="${esc(i.title)}">${bookPoster(i, 'w185', 'bk-img')}${sc != null ? `<span class="stamp">${sc}</span>` : i.liked ? `<span class="stamp heart">${icon('heart')}</span>` : ''}</button>`;
    }).join('')}</div>`).join('')}</div>`;
  }
  return `<div class="bookcase">${rows.map(r => `<div class="shelf-row spines">${r.map(i => {
    const h = 74 + hashStr(i.title) % 26, pg = i.pages || 150, w = Math.max(0.7, Math.min(2.4, Math.sqrt(pg / 150)));
    const sc = i.rating && i.rating.overall != null ? i.rating.overall : null;
    return `<button class="spine ${sc != null && sc >= 9 ? 'gold' : ''}" style="--h:${h}%;--w:${w.toFixed(2)};--c:${authorColor(i.author)}" data-act="detail" data-key="${i.key}" aria-label="${esc(i.title)}, ${esc(i.author || '')}">
      <span class="sp-band">${sc != null ? sc : i.liked ? '♥' : ''}</span><span class="sp-t">${esc(i.title)}</span></button>`;
  }).join('')}</div>`).join('')}</div>`;
}

/* ---- Detay ---- */
function openBookDetail(key) {
  const m = metaOf(key); if (!m) return;
  const w = openSheet(bookDetailHTML(m), 'detail book');
  w.dataset.key = key; w.dataset.book = '1';
  if (m.olKey && m.desc == null) bookDescription(m).then(d => { m.desc = d; const it = S.db.items[key]; if (it) it.desc = d; if (w.isConnected) setSheet(w, bookDetailHTML(m)); });
}
function bookDetailHTML(m) {
  const it = S.db.items[m.key], src = it || m;
  const sc = it && it.rating && it.rating.overall != null ? it.rating.overall : null;
  const dates = it && it.watchedAt ? (it.startedAt && it.startedAt !== it.watchedAt ? `${fmtDate(it.startedAt)} → ${fmtDate(it.watchedAt)} · ${daysBetween(it.startedAt, it.watchedAt)} gün` : `Bitirdiğin tarih: ${fmtDate(it.watchedAt)}`) : '';
  const quotes = (it && it.quotes) || [];
  const subj = (src.subjects || []).filter(s => s.length < 32).slice(0, 8);
  return `
  <div class="d-hero book" style="--bc:${authorColor(src.author)}">${src.cover ? `<div class="d-hero-img" style="background-image:url('${bookCoverUrl(src.cover, 'M')}')"></div>` : ''}<div class="d-fade"></div></div>
  <div class="d-head">
    ${bookPoster(src, 'w342', 'd-poster')}
    <div class="d-titles">
      <p class="eyebrow">Kitap</p>
      <h2 class="d-title">${esc(src.title)}</h2>
      <p class="d-meta">${esc(bookMeta(src))}</p>
      <div class="d-pills">${sc != null ? `<span class="pill mine mono">Senin ${sc}</span>` : ''}${it ? `<span class="pill">${STATUS_BOOK[it.status]}</span>` : ''}${it && it.liked ? `<span class="pill">${icon('heart')} 1000Kitap</span>` : ''}</div>
    </div>
  </div>
  ${statusBar(src, it)}
  ${it && it.status === 'watching' ? pageBox(src, it) : ''}
  ${dates ? `<p class="d-dates mono">${esc(dates)}</p>` : ''}
  ${it && (it.rating || it.note || (it.tags && it.tags.length)) ? myBox(it) : ''}
  ${m.desc ? `<p class="d-overview">${esc(m.desc.length > 900 ? m.desc.slice(0, 900) + '…' : m.desc)}</p>` : m.olKey && m.desc == null ? `<div class="d-loading"><span class="dots"><i></i><i></i><i></i></span> Açıklama aranıyor</div>` : ''}
  ${subj.length ? `<h4 class="d-h">Konular</h4><div class="dna">${subj.map(s => `<span>${esc(s)}</span>`).join('')}</div>` : ''}
  ${it ? `<h4 class="d-h">Alıntılar${quotes.length ? ` · ${quotes.length}` : ''}</h4>
    <div class="quotes">${quotes.map((q, i) => `<blockquote class="quote"><p>${esc(q.text)}</p><footer><span class="mono">${q.page ? 's. ' + q.page : ''}</span><button class="link danger sm" data-act="q-del" data-i="${i}" data-key="${m.key}">Sil</button></footer></blockquote>`).join('')}</div>
    <div class="q-form"><textarea id="q-text" rows="2" maxlength="1200" placeholder="Altını çizdiğin satır"></textarea>
      <div class="row"><input id="q-page" type="number" inputmode="numeric" min="1" placeholder="Sayfa"><button class="btn-ghost sm" data-act="q-add" data-key="${m.key}">${icon('plus')}Alıntı ekle</button></div></div>` : ''}
  <div class="d-links">
    ${src.olKey ? `<a class="btn-ghost" href="${OL}${src.olKey}" target="_blank" rel="noopener">${icon('external')}Open Library</a>` : ''}
  </div>
  ${it ? `<button class="link danger" data-act="remove" data-key="${m.key}">${icon('trash')}Kitaplıktan kaldır</button><div class="confirm" id="rm-confirm" hidden><p>Bu kitap, puanı, notu ve alıntılarıyla birlikte silinecek.</p><div class="row"><button class="btn-ghost" data-act="remove-cancel">Vazgeç</button><button class="btn-danger" data-act="remove-yes" data-key="${m.key}">Sil</button></div></div>` : ''}`;
}
function bookStatusBar(m, it) {
  const st = it && it.status, rated = it && it.rating;
  const b = (s, label, ic) => `<button class="st ${st === s ? 'on' : ''}" data-act="set-status" data-status="${s}" data-key="${m.key}" aria-pressed="${st === s}">${icon(ic)}<span>${label}</span></button>`;
  return `<div class="st-bar book">
    ${b('done', st === 'done' && rated ? 'Puanı düzenle' : 'Okudum', st === 'done' && rated ? 'pen' : 'check')}
    ${b('watching', 'Okuyorum', 'note')}
    ${b('want', 'Okuyacağım', 'plus')}
    ${b('dropped', 'Yarıda', 'pause')}
  </div>`;
}
function pageBox(m, it) {
  const p = (it.progress && it.progress.page) || 0, tot = m.pages || it.pages || 0, pct = tot ? Math.min(100, Math.round(p / tot * 100)) : 0;
  return `<div class="progress">
    <p class="eyebrow">Kaçıncı sayfadasın</p>
    <div class="prog-row">
      <div class="pg-in"><input id="pg-in" type="number" inputmode="numeric" min="0" ${tot ? `max="${tot}"` : ''} value="${p}" data-key="${m.key}" aria-label="Sayfa"><span class="mono">${tot ? '/ ' + tot : ''}</span></div>
      <div class="stepper"><button data-act="pg-step" data-d="-10" data-key="${m.key}" aria-label="10 sayfa geri">${icon('minus')}</button><span class="mono">10 s.</span><button data-act="pg-step" data-d="10" data-key="${m.key}" aria-label="10 sayfa ileri">${icon('plus')}</button></div>
    </div>
    ${tot ? `<span class="pbar big"><i style="width:${pct}%"></i></span>` : ''}
  </div>`;
}
function setPage(key, page) {
  const it = S.db.items[key]; if (!it) return;
  const tot = it.pages || 0;
  page = Math.max(0, Math.round(page || 0)); if (tot) page = Math.min(tot, page);
  upsert(it, { progress: { page } });
  if (tot && page >= tot) { toast('Son sayfa. Bitirdiysen puanla.'); openRate(key, 'done'); }
  refreshAll();
}

/* ---- Hızlı puanla (puansız okudukların) ---- */
const bq = { skipped: new Set(), run: 0 };
function bqQueue() {
  return sortBooks(bookItems().filter(i => i.status === 'done' && !(i.rating && i.rating.overall != null) && !bq.skipped.has(i.key)), 'recent')
    .sort((a, b) => (b.liked ? 1 : 0) - (a.liked ? 1 : 0));
}
function openBookQuick() { bq.run = 0; const w = openSheet('', 'quickdeck tall'); bqNext(w); }
function bqNext(w) {
  const q = bqQueue();
  if (!w.isConnected) return;
  if (!q.length) { setSheet(w, `<div class="qd"><p class="eyebrow">${icon('bolt')}Hızlı Puanla · Kitaplar</p><p class="empty-line">${bq.run ? `Bu turda ${bq.run} kitap puanladın. ` : ''}Puansız kitap kalmadı${bq.skipped.size ? ` (atladıkların: ${bq.skipped.size})` : ''}.</p></div>`); return; }
  const m = q[0]; w.dataset.card = m.key;
  setSheet(w, `<div class="qd">
    <div class="qd-top"><p class="eyebrow">${icon('bolt')}Hızlı Puanla · Kitaplar</p><p class="qd-count mono">Bu tur <b>${bq.run}</b> · Kalan <b>${q.length}</b></p></div>
    <div class="qd-card book" id="qd-card">${bookPoster(m, 'w500', 'qd-cover')}
      <div class="qd-info"><h2>${esc(m.title)}</h2><p>${esc(bookMeta(m))}${m.watchedAt ? ' · ' + esc(m.watchedAt.slice(0, 4)) : ''}</p></div>
    </div>
    ${m.liked ? `<p class="qd-hint">${icon('heart')}1000Kitap'ta beğenmiştin</p>` : ''}
    <p class="qd-q">Kaç verirsin?</p>
    ${strip(null, 'bq-rate')}
    <div class="qd-actions two">
      <button class="btn-ghost" data-act="bq-skip">Atla</button>
      <button class="btn-ghost" data-act="detail" data-key="${m.key}">Detay</button>
    </div>
  </div>`);
}

/* ---- İstatistik ---- */
function vBookStats() {
  const all = bookItems(), done = all.filter(i => i.status === 'done');
  const rated = done.filter(i => i.rating && i.rating.overall != null);
  const pages = done.reduce((a, i) => a + (i.pages || 0), 0);
  const withPages = done.filter(i => i.pages);
  const year = new Date().getFullYear(), g = bookGoal(), gc = goalCount(year);
  // Yıllara göre
  const ys = done.filter(i => i.watchedAt).map(i => +i.watchedAt.slice(0, 4));
  const y0 = ys.length ? Math.min(...ys) : year;
  const years = []; for (let y = y0; y <= year; y++) years.push({ y, n: 0, p: 0 });
  done.forEach(i => { if (!i.watchedAt) return; const b = years.find(x => x.y === +i.watchedAt.slice(0, 4)); if (b) { b.n++; b.p += i.pages || 0; } });
  // Okuma hızı: başlangıç ve bitiş tarihi olanlar; aynı gün bitenler 1 gün sayılır
  const speed = done.filter(i => i.startedAt && i.watchedAt && i.pages).map(i => ({ i, d: Math.max(1, daysBetween(i.startedAt, i.watchedAt)) })).map(x => Object.assign(x, { r: x.i.pages / x.d }));
  const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  const typical = speed.filter(x => x.d <= 120);
  // Yazarlar
  const am = new Map();
  done.forEach(i => { const k = i.author || '—'; const e = am.get(k) || { name: k, n: 0, liked: 0, s: 0, sn: 0 }; e.n++; if (i.liked) e.liked++; if (i.rating && i.rating.overall != null) { e.s += i.rating.overall; e.sn++; } am.set(k, e); });
  const authors = [...am.values()].sort((a, b) => b.n - a.n || b.liked - a.liked).slice(0, 8);
  const amax = Math.max(1, ...authors.map(a => a.n));
  // Uzunluk
  const LB = [['100 altı', 0, 99], ['100–199', 100, 199], ['200–299', 200, 299], ['300–499', 300, 499], ['500+', 500, 1e9]];
  const lens = LB.map(([l, a, b]) => ({ l, n: withPages.filter(i => i.pages >= a && i.pages <= b).length }));
  const lmax = Math.max(1, ...lens.map(x => x.n));
  const hist = Array.from({ length: 10 }, (_, k) => rated.filter(i => i.rating.overall === k + 1).length);
  const liked = done.filter(i => i.liked).length;

  return `<div class="page-head"><h1 class="page-title">Okuma</h1><p class="muted">Kitap istatistiklerin.</p></div>
  <section class="lv-card goal-card">
    <p class="eyebrow">${year} hedefi</p>
    <p class="lv-big">${gc} / ${g}</p>
    <div class="lv-bar big"><i style="width:${Math.min(100, Math.round(gc / g * 100))}%"></i></div>
    <p class="muted mono">${gc >= g ? 'Hedefe ulaştın' : `${g - gc} kitap kaldı`}</p>
    <div class="goal-adj"><button class="btn-round" data-act="goal" data-d="-1" aria-label="Hedefi azalt">${icon('minus')}</button><span class="mono">Yıllık hedef: ${g}</span><button class="btn-round" data-act="goal" data-d="1" aria-label="Hedefi artır">${icon('plus')}</button></div>
  </section>
  <section class="nums">
    <div class="num"><b>${done.length}</b><span>kitap</span></div>
    <div class="num"><b>${fmtInt(pages)}</b><span>sayfa</span></div>
    <div class="num"><b>${withPages.length ? fmtInt(pages / withPages.length) : '—'}</b><span>ort. uzunluk</span></div>
    <div class="num"><b>${rated.length ? fmt1(avg(rated.map(i => i.rating.overall))) : '—'}</b><span>ortalaman</span></div>
  </section>
  <p class="verdict">${done.length} kitabın ${liked} tanesini beğenmişsin, ${rated.length} tanesine puan vermişsin.</p>
  <section class="block card">
    <h2 class="sec-title">Yıllara göre</h2>
    ${years.some(y => y.n) ? yearsChart(years) : `<p class="empty-line">Okuma tarihi olan kitaplar burada yıllara dağılır.</p>`}
    <p class="fine">Tarihler 1000Kitap'taki gibi; o yıllarda toplu eklediğin kitaplar eklediğin güne sayılıyor.</p>
  </section>
  <section class="block card">
    <h2 class="sec-title">Okuma hızın</h2>
    ${typical.length >= 3 ? `<p class="speed"><b class="mono">${fmtInt(med(typical.map(x => x.r)))}</b> sayfa/gün <span class="muted">(ortanca, ${typical.length} kitaptan)</span></p>
      <ul class="people">${typical.slice().sort((a, b) => b.r - a.r).slice(0, 4).map(x => `<li><span><b>${esc(x.i.title)}</b><small>${x.i.pages} sayfa · ${x.d === 1 ? 'bir günde' : x.d + ' günde'}</small></span><b class="mono">${fmtInt(x.r)}/gün</b></li>`).join('')}</ul>
      <p class="fine">120 günden uzun sürenler (ara verip döndüklerin) hesaba katılmadı.</p>`
      : `<p class="empty-line">Başlangıç ve bitiş tarihi olan kitaplardan hesaplanır. Okuyorum dediğin her kitapla bu bölüm dolacak.</p>`}
  </section>
  <section class="block card">
    <h2 class="sec-title">Yazarların</h2>
    <div class="bars">${authors.map((a, k) => `<div class="bar-row ${k === 0 ? 'top' : ''}"><span>${esc(a.name)}</span><span class="bar"><i style="width:${Math.round(a.n / amax * 100)}%"></i></span><b class="mono">${a.n}${a.liked ? ` · ${a.liked}♥` : ''}${a.sn ? ` · ${fmt1(a.s / a.sn)}` : ''}</b></div>`).join('')}</div>
    <p class="fine">Kitap sayısı · beğendiklerin · puan ortalaman</p>
  </section>
  <section class="block card">
    <h2 class="sec-title">Puan dağılımın</h2>
    ${rated.length ? histo(hist) : ''}
    <p class="fine">${rated.length} puanlı kitaptan.${done.length - rated.length ? ` ${done.length - rated.length} kitap puansız: Kitaplık'taki Hızlı Puanla ile tamamlayabilirsin.` : ''}</p>
  </section>
  <section class="block card">
    <h2 class="sec-title">Kitap uzunlukları</h2>
    <div class="bars">${lens.map(x => `<div class="bar-row"><span>${x.l}</span><span class="bar"><i style="width:${Math.round(x.n / lmax * 100)}%"></i></span><b class="mono">${x.n}</b></div>`).join('')}</div>
  </section>
  <section class="block card copy-card">
    <h2 class="sec-title">Kitap önerisi al</h2>
    <p class="muted">Okuduklarını, puanlarını, etiketlerini ve notlarını tek metne çevirir. Kopyalayıp Claude'a yapıştır; öneriyi o yapsın.</p>
    <button class="btn-primary" data-act="copy-profile">${icon('note')}Okuma profilimi kopyala</button>
  </section>`;
}
function yearsChart(ys) {
  const n = ys.length, max = Math.max(1, ...ys.map(y => y.n)), W = 320, H = 130, bw = Math.min(26, (W / n) * 0.6), gap = (W - bw * n) / n;
  const cur = new Date().getFullYear();
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Yıllara göre okunan kitap">
    <line x1="0" x2="${W}" y1="${H - 22}" y2="${H - 22}" class="axis"/>
    ${ys.map((y, k) => { const h = y.n ? Math.max(3, (y.n / max) * (H - 48)) : 0; const x = gap / 2 + k * (bw + gap); return `
      ${h ? `<rect x="${x}" y="${H - 22 - h}" width="${bw}" height="${h}" rx="3" class="bar-fill ${y.y === cur ? 'hi' : ''}"/>` : ''}
      ${y.n ? `<text x="${x + bw / 2}" y="${H - 27 - h}" class="lbl-n">${y.n}</text>` : ''}
      <text x="${x + bw / 2}" y="${H - 6}" class="lbl">'${String(y.y).slice(2)}</text>`; }).join('')}
  </svg></div>`;
}

/* ---- Okuma profili metni ---- */
function readingProfileText() {
  const all = bookItems(), done = all.filter(i => i.status === 'done');
  const line = i => {
    const bits = [`${i.title} — ${i.author || '?'}`];
    if (i.rating && i.rating.overall != null) bits.push(`puan ${i.rating.overall}`);
    if (i.rating && i.rating.sub && Object.keys(i.rating.sub).length) bits.push(Object.entries(i.rating.sub).map(([k, v]) => `${(CRIT_LABEL[k] || k).toLowerCase()} ${v}`).join(', '));
    if (i.tags && i.tags.length) bits.push(`etiketler: ${i.tags.join(', ')}`);
    if (i.note) bits.push(`not: ${i.note.replace(/\s+/g, ' ')}`);
    if (i.status === 'watching' && i.progress) bits.push(`s. ${i.progress.page}${i.pages ? '/' + i.pages : ''}`);
    return '- ' + bits.join(' · ');
  };
  const rated = sortBooks(done.filter(i => i.rating && i.rating.overall != null), 'score');
  const liked = done.filter(i => !(i.rating && i.rating.overall != null) && i.liked);
  const rest = done.filter(i => !(i.rating && i.rating.overall != null) && !i.liked);
  const sec = (t, l) => l.length ? `\n${t} (${l.length})\n${l.map(line).join('\n')}\n` : '';
  return `SEANS · OKUMA PROFİLİM (${new Date().toLocaleDateString('tr-TR')})
Toplam ${done.length} kitap okudum. Bana zevkime göre kitap öner; daha önce okuduklarımı önerme.
${sec('PUANLADIKLARIM, yüksekten düşüğe', rated)}${sec('BEĞENDİKLERİM (puansız)', liked)}${sec('DİĞER OKUDUKLARIM', rest)}${sec('YARIDA BIRAKTIKLARIM', all.filter(i => i.status === 'dropped'))}${sec('ŞU AN OKUDUKLARIM', all.filter(i => i.status === 'watching'))}${sec('OKUYACAKLARIM', all.filter(i => i.status === 'want'))}`;
}
function copyProfile() {
  const text = readingProfileText();
  const fallback = () => {
    const w = openSheet(`<h2 class="sheet-title">Okuma profilin</h2><p class="muted">Otomatik kopyalanamadı. Metin seçili; uzun basıp Kopyala de.</p><textarea id="prof-text" class="prof-text" rows="14" readonly>${esc(text)}</textarea>`);
    const ta = $('#prof-text', w); if (ta) { ta.focus(); ta.select(); }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('Kopyalandı. Claude\'a yapıştırabilirsin.'), fallback);
    else fallback();
  } catch { fallback(); }
}

/* ---- 1000Kitap içe aktarma ---- */
async function importBookFile() {
  try {
    const r = await fetch(BOOK_IMPORT_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    let added = 0, same = 0;
    for (const [k, it] of Object.entries(d.items || {})) {
      if (S.db.items[k] || bookTwin(it)) { same++; continue; }
      S.db.items[k] = it; added++;
    }
    save(); requestPersist();
    toast(`${added} kitap kitaplığına eklendi${same ? `, ${same} tanesi zaten vardı` : ''}.`);
    refreshAll();
  } catch (e) { toast('Liste yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.', 'err'); }
}

/* ---- Eylemler (app.js ACT'e eklenir) ---- */
const BOOK_ACT = {
  'book-import': el => { el.disabled = true; importBookFile(); },
  'shelf-view': el => { shelfPrefs().view = el.dataset.v; save(); render(); },
  'pg-step': el => { const it = S.db.items[el.dataset.key]; if (it) setPage(it.key, ((it.progress && it.progress.page) || 0) + (+el.dataset.d)); },
  'bq-rate': el => {
    const w = el.closest('.sheet-wrap'), key = w.dataset.card, it = S.db.items[key]; if (!it) return;
    const v = +el.dataset.v; paintStrip(w, v);
    upsert(it, { rating: { overall: v, sub: {}, ratedAt: Date.now() } });
    bq.run++;
    setTimeout(() => { const c = $('#qd-card', w); if (c && !matchMedia('(prefers-reduced-motion: reduce)').matches) { c.classList.add('fly-up'); setTimeout(() => bqNext(w), 240); } else bqNext(w); }, 140);
  },
  'bq-skip': el => { const w = el.closest('.sheet-wrap'); bq.skipped.add(w.dataset.card); const c = $('#qd-card', w); if (c) c.classList.add('fly-left'); setTimeout(() => bqNext(w), 220); },
  'q-add': el => {
    const w = el.closest('.sheet-wrap'), it = S.db.items[el.dataset.key]; if (!it) return;
    const text = ($('#q-text', w).value || '').trim(), page = +($('#q-page', w).value || 0) || null;
    if (!text) { toast('Önce alıntıyı yaz.'); return; }
    upsert(it, { quotes: [...(it.quotes || []), { text, page, at: Date.now() }] });
    toast('Alıntı eklendi.'); refreshDetails();
  },
  'q-del': el => { const it = S.db.items[el.dataset.key]; if (!it) return; const q = (it.quotes || []).slice(); q.splice(+el.dataset.i, 1); upsert(it, { quotes: q }); refreshDetails(); },
  'goal': el => { S.db.settings.bookGoal = Math.max(1, Math.min(200, bookGoal() + (+el.dataset.d))); save(); render(); },
  'copy-profile': () => copyProfile(),
};
