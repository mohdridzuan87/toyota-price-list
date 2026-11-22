import { calc, rm } from './calc.js';
import { formatMyPhone, telHref } from './phone.js';
import { notes as footNotes } from './notes.js';
import { buildPdf } from './pdf.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TZ = 'Asia/Kuala_Lumpur';
const fmtDate = (d) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }).format(d);

/* ------------------------------------------------------------------ price list */

async function loadPrices() {
  const res = await fetch('data/prices.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function myParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: TZ })
    .formatToParts(date).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  return p;
}

/** Next scheduled refresh after a given date: the 15th, or the 1st of next month. */
function nextUpdate(from) {
  const { year, month, day } = myParts(from);
  return day < 15 ? new Date(Date.UTC(year, month - 1, 15, -8)) : new Date(Date.UTC(year, month, 1, -8));
}

function renderHeader(data) {
  const gen = new Date(data.generatedAt);
  const period = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: TZ }).format(gen).toUpperCase();
  $('period').textContent = period;
  $('updated').textContent = `Updated ${fmtDate(gen)} · next auto-update ${fmtDate(nextUpdate(gen))}`;
  document.title = `Toyota Price List – ${period.charAt(0) + period.slice(1).toLowerCase()}`;
  const ageDays = (Date.now() - gen.getTime()) / 86400000;
  if (ageDays > 20) {
    const b = $('stale');
    b.hidden = false;
    b.textContent = `This price list was last refreshed on ${fmtDate(gen)}. Prices may have changed – please confirm with your sales advisor.`;
  }
}

function renderAssumptions(s) {
  const chips = [
    `Est. rate ${s.ratePercent}% p.a. (flat)`,
    `Down payment ${s.dpPercent}% or 0%`,
    `${s.years}-year tenure`,
    'OTR prices, Peninsular Malaysia',
  ];
  $('assump').innerHTML = chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('');
}

function renderModels(data) {
  const s = data.settings;
  const dps = [s.dpPercent, 0]; // 10% D/P, then 0% D/P beside it
  const cols = [
    { h: 'Body price' }, { h: 'Rebate' }, { h: 'Est. insurance' },
    ...dps.flatMap((p, k) => [
      { h: `D/P ${p}%`, g: k },
      { h: 'Loan', g: k, cls: 'loan' },
      { h: `${s.years} years`, sub: `${p}% D/P`, g: k, em: true },
    ]),
  ];
  const thead = `<thead><tr><th scope="col">Model &amp; variant</th>${cols.map((c) => `<th scope="col" class="${[c.em ? 'em' : '', c.cls || '', c.g !== undefined ? 'g' + c.g : ''].join(' ')}">${esc(c.h)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</th>`).join('')}</tr></thead>`;
  const label = (i) => (cols[i].g === undefined || cols[i].h.startsWith('D/P') ? cols[i].h : `${cols[i].h} (${dps[cols[i].g]}% D/P)`);

  const html = data.groups.map((g) => {
    const notes = [];
    const rows = g.variants.map((v) => {
      let rebate = esc(v.rebate.text);
      if (v.rebate.note) {
        if (!notes.includes(v.rebate.note)) notes.push(v.rebate.note);
        rebate += '<sup>*</sup>';
      }
      const muted = v.rebate.type === 'none' ? ' muted' : '';
      const scen = dps.map((p, k) => {
        const c = calc(v.body, v.insurance, { ...s, dpPercent: p });
        const b = 3 + k * 3;
        return `<td data-label="${label(b)}" class="g${k}">${rm(c.dp)}</td>
        <td data-label="${label(b + 1)}" class="loan g${k}">${rm(c.loan)}</td>
        <td data-label="${label(b + 2)}" class="em g${k}${k ? ' alt' : ''}">${rm(c.m90)}<small> /mth</small></td>`;
      }).join('');
      return `<tr>
        <th scope="row" data-label="Variant">${esc(v.name)}${v.hev ? ' <span class="hev">HEV</span>' : ''}</th>
        <td data-label="${label(0)}">${rm(v.body)}</td>
        <td data-label="${label(1)}" class="${muted}">${rebate}</td>
        <td data-label="${label(2)}" title="Recommended sum insured ${rm(v.sumInsured)}">${rm(v.insurance)}</td>
        ${scen}
      </tr>`;
    }).join('');
    const eff = g.effective ? `Price list effective ${fmtDate(new Date(g.effective + 'T00:00:00+08:00'))}` : '';
    return `<section class="model" id="m-${esc(g.id)}">
      <div class="model-head">
        <img src="assets/cars/${esc(g.image)}" alt="${esc(g.name)}" loading="lazy">
        <div><h2>${esc(g.name)}</h2><p class="eff">${esc(eff)}</p></div>
      </div>
      <div class="tablewrap"><table>${thead}<tbody>${rows}</tbody></table></div>
      ${notes.map((n) => `<p class="gnote">* ${esc(n)}</p>`).join('')}
    </section>`;
  }).join('');
  $('models').innerHTML = html;
}

function renderNotes(data) {
  const s = data.settings;
  const items = [
    ...footNotes(s).map(esc),
    `Auto-updated from toyota.com.my on the 1st and 15th of every month. Sources: <a href="${esc(data.sources.priceList)}">price list</a> · <a href="${esc(data.sources.promo)}">monthly promo</a>.`,
  ];
  $('notes').innerHTML = items.map((t) => `<li>${t}</li>`).join('');
}

/* ------------------------------------------------------------------ name card */

const KEY = 'toyota-price-list.card.v1';
const PH = { name: 'Wan Jasni', phone: '+6016 - 331 3607', company: 'TOYOTA PCM | Telok Panglima Garang' }; // greyed examples until the advisor fills in their own
// Card data lives on the user's own phone/computer only: localStorage + IndexedDB (two copies),
// asked to be "persistent" so the browser does not clear it, plus a backup file the user can keep.
const idb = {
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('toyota-price-list', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async get(k) {
    try {
      const db = await this.open();
      return await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result ?? null); q.onerror = () => res(null); });
    } catch { return null; }
  },
  async set(k, v) {
    try {
      const db = await this.open();
      await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); });
      return true;
    } catch { return false; }
  },
  async del(k) {
    try {
      const db = await this.open();
      await new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = res; t.onerror = res; });
    } catch { /* ignore */ }
  },
};
const store = {
  async get() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) return v; } catch { /* fall through */ }
    return idb.get(KEY);
  },
  async set(v) {
    let ls = false;
    try { localStorage.setItem(KEY, JSON.stringify(v)); ls = true; } catch { /* quota or blocked */ }
    const db = await idb.set(KEY, v);
    try { navigator.storage?.persist?.(); } catch { /* ignore */ }
    return ls || db;
  },
  async clear() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    await idb.del(KEY);
  },
};

let defaults = { name: '', title: '', phone: '', company: '', address: '', photo: '' };
let card = { ...defaults };
let srcImg = null; // loaded original photo while editing

const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

function setPhoto(imgEl, initEl, photo, name) {
  if (photo) { imgEl.src = photo; imgEl.hidden = false; initEl.hidden = true; }
  else { imgEl.removeAttribute('src'); imgEl.hidden = true; initEl.hidden = false; initEl.textContent = initials(name); }
}

function renderCard() {
  $('c-name').textContent = card.name || PH.name;
  $('namecard').classList.toggle('empty', !card.name && !card.phone && !card.company && !card.address);
  $('c-title').textContent = card.title;
  const ph = $('c-phone');
  ph.textContent = card.phone || PH.phone;
  if (card.phone) ph.href = telHref(card.phone); else ph.removeAttribute('href');
  ph.classList.toggle('ph', !card.phone);
  $('c-company').textContent = card.company || PH.company;
  $('c-company').classList.toggle('ph', !card.company);
  $('c-address').textContent = card.address;
  setPhoto($('avatar-img'), $('avatar-initials'), card.photo, card.name);
  setPhoto($('preview-img'), $('preview-initials'), card.photo, card.name);
}

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    // store only what differs from the shared defaults, so later changes to data/card.json still show up
    const delta = Object.fromEntries(Object.entries(card).filter(([k, v]) => v !== defaults[k] && !(v === undefined && defaults[k] === undefined)));
    const ok = Object.keys(delta).length ? await store.set(delta) : (await store.clear(), true);
    const el = $('saved');
    el.textContent = ok ? 'Saved on this phone' : 'Could not save – browser storage is unavailable';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = ''; }, 2500);
  }, 200);
}

function fillFields() {
  $('f-name').value = card.name;
  $('f-title').value = card.title;
  $('f-phone').value = card.phone;
  $('f-company').value = card.company;
  $('f-address').value = card.address;
  const hasSrc = Boolean(card.photoSrc);
  $('adjust').hidden = !hasSrc;
  $('adj-zoom').value = card.adj?.z ?? 1;
  $('adj-x').value = card.adj?.x ?? 0;
  $('adj-y').value = card.adj?.y ?? 0;
}

function bindField(id, key, transform) {
  $(id).addEventListener('input', (e) => {
    let v = e.target.value;
    if (transform) {
      v = transform(v, e);
      e.target.value = v;
    }
    card[key] = v;
    renderCard();
    persist();
  });
}

const phoneInput = (v, e) => {
  const digits = v.replace(/\D/g, '');
  if (e.inputType && e.inputType.startsWith('delete') && digits.length <= 2) return '';
  return formatMyPhone(v);
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Draw the circular-crop source (square 320 px) from the original with zoom / offset. */
function drawCrop() {
  if (!srcImg) return;
  const S = 320;
  const { z, x, y } = card.adj;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const base = Math.max(S / srcImg.width, S / srcImg.height) * z;
  const w = srcImg.width * base;
  const h = srcImg.height * base;
  const dx = (S - w) / 2 + (x / 100) * ((w - S) / 2);
  const dy = (S - h) / 2 + (y / 100) * ((h - S) / 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, S, S);
  ctx.drawImage(srcImg, dx, dy, w, h);
  card.photo = cv.toDataURL('image/jpeg', 0.88);
  renderCard();
  persist();
}

async function onPhoto(file) {
  if (!file) return;
  try {
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    URL.revokeObjectURL(url);
    const max = 640;
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k);
    cv.height = Math.round(img.height * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    card.photoSrc = cv.toDataURL('image/jpeg', 0.85);
    card.adj = { z: 1, x: 0, y: 0 };
    srcImg = await loadImage(card.photoSrc);
    fillFields();
    drawCrop();
  } catch {
    $('saved').textContent = 'That file could not be read as an image.';
  }
}

async function initCard() {
  const stored = await store.get();
  card = { ...defaults, ...(stored || {}) };
  renderCard();

  const panel = $('edit-panel');
  const btn = $('edit-btn');
  const toggle = async (open) => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Close editor' : 'Edit card';
    if (open) {
      fillFields();
      if (card.photoSrc && !srcImg) { try { srcImg = await loadImage(card.photoSrc); } catch { /* ignore */ } }
      $('f-name').focus();
    }
  };
  btn.addEventListener('click', () => toggle(panel.hidden));
  $('edit-done').addEventListener('click', () => { toggle(false); btn.focus(); });
  panel.addEventListener('submit', (e) => e.preventDefault());
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggle(false); btn.focus(); } });

  bindField('f-name', 'name');
  bindField('f-title', 'title');
  bindField('f-phone', 'phone', phoneInput);
  bindField('f-company', 'company');
  bindField('f-address', 'address');

  $('photo-input').addEventListener('change', (e) => { onPhoto(e.target.files[0]); e.target.value = ''; });
  $('photo-remove').addEventListener('click', () => {
    card.photo = defaults.photo || '';
    delete card.photoSrc;
    delete card.adj;
    srcImg = null;
    fillFields();
    renderCard();
    persist();
  });
  for (const id of ['adj-zoom', 'adj-x', 'adj-y']) {
    $(id).addEventListener('input', () => {
      card.adj = { z: Number($('adj-zoom').value), x: Number($('adj-x').value), y: Number($('adj-y').value) };
      drawCrop();
    });
  }
  $('backup-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'toyota-price-list-card', version: 1, card }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'toyota-card-backup.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    $('saved').textContent = 'Backup file saved to your phone';
  });
  $('restore-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const c = data.card || data;
      const clean = {};
      for (const k of ['name', 'title', 'phone', 'company', 'address']) if (typeof c[k] === 'string') clean[k] = c[k].slice(0, 200);
      for (const k of ['photo', 'photoSrc']) if (typeof c[k] === 'string' && c[k].startsWith('data:image/') && c[k].includes(';base64,')) clean[k] = c[k];
      if (c.adj && [c.adj.z, c.adj.x, c.adj.y].every((n) => Number.isFinite(n))) clean.adj = { z: c.adj.z, x: c.adj.x, y: c.adj.y };
      if (!Object.keys(clean).length) throw new Error('empty');
      if (clean.phone) clean.phone = formatMyPhone(clean.phone);
      card = { ...defaults, ...clean };
      srcImg = null;
      if (card.photoSrc) { try { srcImg = await loadImage(card.photoSrc); } catch { /* ignore */ } }
      fillFields();
      renderCard();
      persist();
    } catch {
      $('saved').textContent = 'That backup file could not be read.';
    }
  });
  $('edit-reset').addEventListener('click', () => {
    clearTimeout(saveTimer);
    store.clear();
    card = { ...defaults };
    srcImg = null;
    fillFields();
    renderCard();
    $('saved').textContent = 'Reset to default';
  });
}

/* ------------------------------------------------------------------ start */

$('print-btn').addEventListener('click', () => window.print());

/** Share the generated PDF itself (not a text message). Phones: share sheet -> WhatsApp. Desktop: download + open WhatsApp. */
let lastData = null;
async function makePdf() {
  if (!lastData) throw new Error('price list not loaded yet');
  return buildPdf({ data: lastData, card, period: $('period').textContent.trim(), updated: $('updated').textContent.trim() });
}
function saveBlob(blob, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}
const pdfName = () => 'Toyota-Price-List-' + $('period').textContent.trim().split(' ').join('-') + '.pdf';

function shareStatus(msg) { const el = $('share-status'); el.textContent = msg; clearTimeout(el._t); el._t = setTimeout(() => { el.textContent = ''; }, 8000); }

$('wa-btn').addEventListener('click', async () => {
  const btn = $('wa-btn');
  btn.disabled = true;
  try {
    const blob = await makePdf();
    const period = $('period').textContent.trim().split(' ').join('-');
    const file = new File([blob], 'Toyota-Price-List-' + period + '.pdf', { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
    // no file sharing in this browser: save the PDF, then open WhatsApp so it can be attached
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    shareStatus('PDF downloaded – attach it in the WhatsApp chat that just opened.');
    window.open('https://web.whatsapp.com/', '_blank', 'noopener');
  } catch (err) {
    if (err && err.name === 'AbortError') return; // user closed the share sheet
    shareStatus('Could not share the PDF (' + (err && err.message ? err.message : 'error') + '). Use Download PDF instead.');
  } finally {
    btn.disabled = false;
  }
});

$('dl-btn').addEventListener('click', async () => {
  const btn = $('dl-btn');
  btn.disabled = true;
  try { saveBlob(await makePdf(), pdfName()); }
  catch (err) { shareStatus('Could not create the PDF (' + (err && err.message ? err.message : 'error') + ').'); }
  finally { btn.disabled = false; }
});

(async function start() {
  try {
    const r = await fetch('data/card.json', { cache: 'no-cache' });
    if (r.ok) defaults = { ...defaults, ...(await r.json()) };
  } catch { /* use blank defaults */ }
  await initCard();

  try {
    const data = await loadPrices();
    lastData = data;
    renderHeader(data);
    renderAssumptions(data.settings);
    renderModels(data);
    renderNotes(data);
  } catch (e) {
    $('models').innerHTML = `<p class="loading error">Could not load the price list (${esc(e.message)}). Please refresh.</p>`;
  }
})();
