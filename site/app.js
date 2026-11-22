import { calc, rm } from './calc.js';
import { formatMyPhone, telHref } from './phone.js';
import { notes as footNotes } from './notes.js';
import { buildPdf, buildImage } from './pdf.js';
import { waLink, qrMatrix, qrSvg } from './qr.js';

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

/** Scheduled refresh slots in Malaysia time (UTC+8): [day of month, hour, minute]. Keep in sync with the workflow. */
const SLOTS = [[1, 7, 30], [2, 7, 0], [3, 7, 0], [15, 8, 0]];

/** The next scheduled refresh strictly after the given moment. */
function nextUpdate(from) {
  const { year, month } = myParts(from);
  const candidates = [];
  for (const m of [month, month + 1]) {
    for (const [d, h, min] of SLOTS) candidates.push(new Date(Date.UTC(year, m - 1, d, h - 8, min)));
  }
  return candidates.filter((c) => c > from).sort((x, y) => x - y)[0];
}

const fmtTime = (d) => new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).format(d).replace(' ', '').toLowerCase();

function renderHeader(data) {
  const gen = new Date(data.generatedAt);
  const period = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: TZ }).format(gen).toUpperCase();
  $('period').textContent = period;
  $('updated').textContent = `Updated ${fmtDate(gen)} · next auto-update ${fmtDate(nextUpdate(gen))}, ${fmtTime(nextUpdate(gen))}`;
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
  $('assump').innerHTML = chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('') + `<span class="chip warn">Monthly instalment does not include insurance. Insurance is paid separately.</span>`;
}

function renderModels(data) {
  const s = data.settings;
  const dps = [s.dpPercent, 0]; // 10% D/P, then 0% D/P beside it
  const cols = [
    { h: 'Body price' }, { h: 'Rebate' }, { h: 'Est. insurance' },
    ...dps.flatMap((p, k) => [
      ...(p > 0 ? [{ h: `D/P ${p}%`, g: k }] : []), // no D/P column for 0%: it would always read RM0
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
      let ci = 3;
      const scen = dps.map((p, k) => {
        const c = calc(v.body, v.insurance, { ...s, dpPercent: p });
        const dp = p > 0 ? `<td data-label="${label(ci++)}" class="g${k}">${rm(c.dp)}</td>` : '';
        return dp + `
        <td data-label="${label(ci++)}" class="loan g${k}">${rm(c.loan)}</td>
        <td data-label="${label(ci++)}" class="em g${k}${k ? ' alt' : ''}">${rm(c.m90)}<small> /mth</small></td>`;
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
    `Auto-updated from toyota.com.my on the 1st (7:30am), 2nd (7:00am), 3rd (7:00am) and 15th (8:00am) of every month, Malaysia time. Sources: <a href="${esc(data.sources.priceList)}">price list</a> · <a href="${esc(data.sources.promo)}">monthly promo</a>.`,
  ];
  $('notes').innerHTML = items.map((t) => `<li>${t}</li>`).join('');
}

/* ------------------------------------------------------------------ name card */

const KEY = 'toyota-price-list.card.v1';
const LOGO_KEYS = ['logo1', 'logo2', 'logo3']; // company logo + two more images shown beside the details
const PH = { name: 'Wan Jasni', phone: '016-331 3607', company: 'TOYOTA PCM | Telok Panglima Garang' }; // greyed examples until the advisor fills in their own
// The card is saved in this browser's own data (localStorage) on the user's phone/computer only.
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch { return false; } },
  clear() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
};

let defaults = { name: '', title: '', phone: '', company: '', address: '', photo: '' };
let card = { ...defaults };
let srcImg = null; // loaded original photo while editing

const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

function setPhoto(imgEl, initEl, photo, name) {
  if (photo) { imgEl.src = photo; imgEl.hidden = false; initEl.hidden = true; }
  else { imgEl.removeAttribute('src'); imgEl.hidden = true; initEl.hidden = false; initEl.textContent = initials(name); }
}

function renderLogos() {
  const box = $('card-logos');
  box.replaceChildren();
  LOGO_KEYS.forEach((k, n) => {
    const tile = document.querySelector('#logo-tile-' + (n + 1));
    const prev = tile.querySelector('img');
    if (card[k]) {
      const img = new Image();
      img.src = card[k];
      img.alt = '';
      box.appendChild(img);
      prev.src = card[k];
      prev.hidden = false;
      tile.querySelector('span').hidden = true;
    } else {
      prev.removeAttribute('src');
      prev.hidden = true;
      tile.querySelector('span').hidden = false;
    }
  });
  box.hidden = !box.children.length;
}

/** Downscale an uploaded logo/image (max 360 px) keeping transparency for PNG/WebP/SVG. */
async function readLogo(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, 360 / Math.max(img.width || 360, img.height || 360));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round((img.width || 360) * k));
    cv.height = Math.max(1, Math.round((img.height || 360) * k));
    const ctx = cv.getContext('2d');
    const keepAlpha = /png|webp|svg/.test(file.type);
    if (!keepAlpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return keepAlpha ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.88);
  } finally { URL.revokeObjectURL(url); }
}

let qrToken = 0;
/** WhatsApp QR from the phone number on the card (mobile numbers only). */
async function renderQr() {
  const token = ++qrToken;
  const link = waLink(card.phone);
  const box = $('card-qr');
  if (!link) { box.hidden = true; return; }
  try {
    const m = await qrMatrix(link);
    if (token !== qrToken) return; // a newer keystroke already replaced this one
    $('qr-box').innerHTML = qrSvg(m);
    box.href = link;
    box.hidden = false;
  } catch { box.hidden = true; }
}

function renderCard() {
  $('c-name').textContent = card.name || PH.name;
  $('namecard').classList.toggle('unedited', Object.keys(card).every((k) => (card[k] ?? '') === (defaults[k] ?? '')));
  $('namecard').classList.toggle('empty', !card.name && !card.phone && !card.company && !card.address && !LOGO_KEYS.some((k) => card[k]));
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
  renderLogos();
  renderQr();
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

const phoneInput = (v) => formatMyPhone(v); // 016-331 3607 style; deleting works one character at a time

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
  defaults.phone = formatMyPhone(defaults.phone); // always the local style, e.g. 016-331 3607
  card = { ...defaults, ...(stored || {}) };
  card.phone = formatMyPhone(card.phone);
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
  LOGO_KEYS.forEach((k, n) => {
    $('logo-input-' + (n + 1)).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try { card[k] = await readLogo(file); renderCard(); persist(); }
      catch { $('saved').textContent = 'That file could not be read as an image.'; }
    });
    document.querySelector('[data-remove="' + (n + 1) + '"]').addEventListener('click', () => { delete card[k]; renderCard(); persist(); });
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
async function makeImage() {
  if (!lastData) throw new Error('price list not loaded yet');
  return buildImage({ data: lastData, card, period: $('period').textContent.trim(), updated: $('updated').textContent.trim() });
}
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

$('img-btn').addEventListener('click', async () => {
  const btn = $('img-btn');
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Preparing image…';
  try {
    const blob = await makeImage();
    const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png';
    saveBlob(blob, pdfName().replace(/.pdf$/, '') + '-WhatsApp-Catalogue.' + ext);
    shareStatus('Saved a high-resolution ' + ext.toUpperCase() + ' (4200 x 2970 px, ' + (blob.size / 1048576).toFixed(1) + ' MB). Add it as a photo in your WhatsApp Catalogue.');
  } catch (err) {
    shareStatus('Could not create the image (' + (err && err.message ? err.message : 'error') + ').');
  } finally {
    btn.textContent = label;
    btn.disabled = false;
  }
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
