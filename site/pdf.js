// Builds the one-page A4 landscape price list as a real (vector) PDF, in the browser,
// so every sales advisor gets their OWN name card on it. Uses the vendored jsPDF (MIT).
import { calc, rm } from './calc.js';
import { notes, DOCS } from './notes.js';

let libPromise;
function loadJsPdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  libPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/jspdf.umd.min.js';
    s.onload = () => resolve(window.jspdf);
    s.onerror = () => reject(new Error('PDF library failed to load'));
    document.head.appendChild(s);
  });
  return libPromise;
}

const blobToDataUrl = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
async function urlToDataUrl(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('image ' + url);
  return blobToDataUrl(await r.blob());
}
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const fmtOf = (u) => (u.startsWith('data:image/png') ? 'PNG' : 'JPEG');
const initials = (n) => String(n || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

async function avatarPng(card) {
  const S = 300;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d');
  x.beginPath();
  x.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  x.clip();
  if (card.photo) {
    x.drawImage(await loadImg(card.photo), 0, 0, S, S);
  } else {
    x.fillStyle = '#15171a';
    x.fillRect(0, 0, S, S);
    x.fillStyle = '#fff';
    x.font = '700 120px Arial, Helvetica, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(initials(card.name), S / 2, S / 2 + 6);
  }
  return cv.toDataURL('image/png');
}

const INK = [21, 23, 26];
const RED = [195, 8, 26];
const MUTED = [93, 99, 107];
const FAINT = [154, 160, 167];
const LINE = [227, 229, 232];
const ZEBRA = [241, 242, 244];
const HEAD = [245, 246, 247];

/**
 * @param {{data:object, card:object, period:string, updated:string}} o
 * @returns {Promise<Blob>}
 */
export async function buildPdf({ data, card, period, updated }) {
  const { jsPDF } = await loadJsPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PW = 297;
  const PH = 210;
  const M = 6;
  const s = data.settings;
  const dps = [s.dpPercent, 0];

  const T = (str, x, y, { size = 7, bold = false, color = INK, align = 'left', charSpace = 0 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(String(str), x, y, { align, baseline: 'middle', charSpace });
  };
  const wrap = (str, w, size, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    return doc.splitTextToSize(String(str), w);
  };

  // ---------- assets
  const [logo, avatar, ...cars] = await Promise.all([
    urlToDataUrl('assets/toyota-logo.png'),
    avatarPng(card),
    ...data.groups.map((g) => urlToDataUrl('assets/cars/' + g.image).catch(() => null)),
  ]);
  const carDims = await Promise.all(cars.map((c) => (c ? loadImg(c).then((i) => ({ w: i.width, h: i.height })) : null)));

  // ---------- header
  let y = M;
  doc.addImage(logo, 'PNG', M, y, 14 * (268 / 172), 14);
  const tx = M + 14 * (268 / 172) + 6;
  T('PRICE LIST', tx, y + 2, { size: 6.5, bold: true, color: MUTED, charSpace: 0.8 });
  T(period, tx, y + 8.4, { size: 24, bold: true });
  T(updated, tx, y + 13.4, { size: 6.5, color: MUTED });
  y += 16.3;
  doc.setFillColor(...RED);
  doc.rect(M, y, PW - 2 * M, 0.9, 'F');
  y += 2.4;

  // ---------- name card (skipped when nothing is filled in)
  const hasCard = card.name || card.phone || card.company || card.address;
  if (hasCard) {
    const h = 15;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.35);
    doc.roundedRect(M, y, PW - 2 * M, h, 1.8, 1.8, 'S');
    doc.addImage(avatar, 'PNG', M + 3, y + 2, 11, 11);
    doc.setDrawColor(...RED);
    doc.setLineWidth(0.5);
    doc.circle(M + 8.5, y + 7.5, 6.1, 'S');
    const x1 = M + 19;
    T((card.name || '').toUpperCase(), x1, y + 4.2, { size: 12, bold: true });
    if (card.title) T(card.title, x1, y + 8, { size: 7, bold: true });
    if (card.phone) T(card.phone, x1, y + 12, { size: 13, bold: true });
    const x2 = M + 108;
    if (card.company) T(card.company.toUpperCase(), x2, y + 4.6, { size: 9, bold: true });
    if (card.address) {
      const lines = wrap(card.address, PW - M - x2 - 3, 7).slice(0, 3);
      lines.forEach((ln, i) => T(ln, x2, y + 8.2 + i * 2.9, { size: 7, color: MUTED }));
    }
    y += h + 2.4;
  }
  const modelsTop = y;

  // ---------- footer (docs + notes) measured first so the tables get what is left
  const footW = PW - 2 * M;
  const noteLines = notes(s).flatMap((n) => wrap(n, footW - 2, 5));
  const docsText = `REQUIRED DOCUMENTS   Individual: ${DOCS.individual.join(', ')}.   Company (SSM): ${DOCS.company.join(', ')}.`;
  const docsLines = wrap(docsText, footW, 5.8, true);
  const footH = docsLines.length * 2.5 + 1.6 + noteLines.length * 2.05 + 0.6;
  const modelsBottom = PH - M - footH;
  const avail = modelsBottom - modelsTop;

  // ---------- column grid inside one model table
  const colW = (PW - 2 * M - 4) / 2;
  const frac = [0.165, 0.09, 0.155, 0.085, 0.082, 0.085, 0.095, 0.082, 0.085, 0.095];
  const sum = frac.reduce((a, b) => a + b, 0);
  const cw = frac.map((f) => (f / sum) * colW);
  const cx = [0];
  cw.forEach((w, i) => cx.push(cx[i] + w));

  const rowInfo = (g, k) => {
    const fs = 6.4 * k;
    return g.variants.map((v) => {
      const lines = wrap(v.rebate.text + (v.rebate.note ? '*' : ''), cw[2] - 1.6, fs).length;
      const nameLines = wrap(v.name, cw[0] - 1.6, fs, true).length;
      const n = Math.max(lines, nameLines);
      return { v, n, h: 3.9 * k + (n - 1) * 2.5 * k };
    });
  };
  const blockH = (g, k) => 4.6 * k + 5.6 * k + rowInfo(g, k).reduce((a, r) => a + r.h, 0) + (g.variants.some((v) => v.rebate.note) ? 2.6 * k : 0) + 1.6 * k;

  // pick the largest scale at which a sequential two-column split fits
  let k = 1.25;
  let split = 0;
  for (; k >= 0.6; k -= 0.02) {
    const hs = data.groups.map((g) => blockH(g, k));
    let best = { i: 0, max: Infinity };
    for (let i = 1; i < hs.length; i++) {
      const left = hs.slice(0, i).reduce((a, b) => a + b, 0);
      const right = hs.slice(i).reduce((a, b) => a + b, 0);
      if (Math.max(left, right) < best.max) best = { i, max: Math.max(left, right) };
    }
    split = best.i;
    if (best.max <= avail) break;
  }

  const drawBlock = (g, gi, x0, y0) => {
    const infos = rowInfo(g, k);
    const barH = 4.6 * k;
    const headH = 5.6 * k;
    const fs = 6.4 * k;
    const note = g.variants.find((v) => v.rebate.note)?.rebate.note;
    const rowsH = infos.reduce((a, r) => a + r.h, 0);
    const totalH = barH + headH + rowsH + (note ? 2.6 * k : 0);

    // dark model bar with car + name
    doc.setFillColor(...INK);
    doc.roundedRect(x0, y0, colW, barH + 1, 1.2, 1.2, 'F');
    doc.setFillColor(...HEAD);
    doc.rect(x0, y0 + barH, colW, 1.2, 'F');
    let nx = x0 + 2;
    if (cars[gi]) {
      const ih = barH - 1.2;
      const iw = Math.min(ih * (carDims[gi].w / carDims[gi].h), 14);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x0 + 1, y0 + 0.6, iw + 1.4, ih, 0.8, 0.8, 'F');
      doc.addImage(cars[gi], fmtOf(cars[gi]), x0 + 1.7, y0 + 0.6 + 0.2, iw, ih - 0.4);
      nx = x0 + iw + 4.6;
    }
    T(g.name, nx, y0 + barH / 2, { size: 8.2 * k, bold: true, color: [255, 255, 255], charSpace: 0.3 });

    // column header
    const hy = y0 + barH;
    doc.setFillColor(...HEAD);
    doc.rect(x0, hy, colW, headH, 'F');
    const heads = [
      ['MODEL & VARIANT'], ['BODY', 'PRICE'], ['REBATE'], ['EST.', 'INSURANCE'],
      [`D/P ${dps[0]}%`], ['LOAN'], [`${s.years} YEARS`, `${dps[0]}% D/P`],
      [`D/P ${dps[1]}%`], ['LOAN'], [`${s.years} YEARS`, `${dps[1]}% D/P`],
    ];
    heads.forEach((lines, i) => {
      const em = i === 6 || i === 9;
      const right = i > 0;
      const px = right ? x0 + cx[i + 1] - 1.1 : x0 + 1.4;
      lines.forEach((ln, li) => {
        const yy = hy + headH / 2 + (li - (lines.length - 1) / 2) * 2.3 * k;
        T(ln, px, yy, { size: 5.3 * k, bold: true, color: em ? RED : MUTED, align: right ? 'right' : 'left' });
      });
    });

    // rows
    let ry = hy + headH;
    infos.forEach((r, ri) => {
      const v = r.v;
      if (ri % 2) { doc.setFillColor(...ZEBRA); doc.rect(x0, ry, colW, r.h, 'F'); }
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.12);
      doc.line(x0, ry + r.h, x0 + colW, ry + r.h);
      const mid = ry + r.h / 2;
      const nameLines = wrap(v.name, cw[0] - 1.6, fs, true);
      nameLines.forEach((ln, li) => T(ln, x0 + 1.4, mid + (li - (nameLines.length - 1) / 2) * 2.5 * k, { size: fs, bold: true }));
      const num = (i, text, o = {}) => T(text, x0 + cx[i + 1] - 1.1, mid, { size: fs, align: 'right', ...o });
      num(1, rm(v.body));
      const rl = wrap(v.rebate.text + (v.rebate.note ? '*' : ''), cw[2] - 1.6, fs);
      rl.forEach((ln, li) => T(ln, x0 + cx[3] - 1.1, mid + (li - (rl.length - 1) / 2) * 2.5 * k, { size: fs, align: 'right', color: v.rebate.type === 'none' ? FAINT : INK }));
      num(3, rm(v.insurance));
      dps.forEach((p, set) => {
        const c = calc(v.body, v.insurance, { ...s, dpPercent: p });
        const b = 4 + set * 3;
        num(b, rm(c.dp));
        num(b + 1, rm(c.loan));
        num(b + 2, rm(c.m90), { bold: true, size: fs * 1.08, color: set === 0 ? RED : INK });
      });
      ry += r.h;
    });
    if (note) T('* ' + note, x0 + 1.4, ry + 1.3 * k, { size: 4.8 * k, color: MUTED });

    // frame + set divider lines
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.25);
    [4, 7].forEach((i) => doc.line(x0 + cx[i], hy, x0 + cx[i], ry));
    doc.roundedRect(x0, y0, colW, totalH, 1.2, 1.2, 'S');
    return totalH;
  };

  let yl = modelsTop;
  let yr = modelsTop;
  data.groups.forEach((g, gi) => {
    if (gi < split) yl += drawBlock(g, gi, M, yl) + 1.6 * k;
    else yr += drawBlock(g, gi, M + colW + 4, yr) + 1.6 * k;
  });

  // ---------- docs + notes
  let fy = modelsBottom + 0.6;
  docsLines.forEach((ln) => { T(ln, M, fy + 1.2, { size: 5.8, bold: true }); fy += 2.5; });
  fy += 1.6;
  noteLines.forEach((ln) => { T(ln, M + 1, fy + 0.9, { size: 5, color: MUTED }); fy += 2.05; });

  doc.setProperties({ title: 'Toyota Price List ' + period, author: card.name || '', subject: 'Toyota Malaysia price list' });
  return doc.output('blob');
}
