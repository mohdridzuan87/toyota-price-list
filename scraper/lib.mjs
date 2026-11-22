// Pure helpers for scraping the Toyota Malaysia price list (PDF) and monthly promo page.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const NUM_RE = /\d{1,3}(?:,\d{3})+(?:\.\d+)?/g;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Read a PDF; returns visual lines plus the positioned text items of every page. */
export async function pdfRead(buffer) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
  const lines = [];
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width || 0, str: it.str }));
    pages.push(items);
    lines.push(...itemsToLines(items));
  }
  return { lines, pages };
}

export async function pdfLines(buffer) {
  return (await pdfRead(buffer)).lines;
}

function rowsOf(items) {
  const rows = [];
  for (const it of items) {
    let row = rows.find((r) => Math.abs(r.y - it.y) <= 3);
    if (!row) rows.push((row = { y: it.y, parts: [] }));
    row.parts.push(it);
  }
  rows.sort((a, b) => b.y - a.y);
  for (const r of rows) r.parts.sort((a, b) => a.x - b.x);
  return rows;
}
const rowText = (r) => r.parts.map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim();

/**
 * Work out which price column belongs to which variant, from the PDF header text above each column.
 * Returns an array (one entry per variant, in config order) of column indexes (left to right).
 */
export function assignColumns(pages, variants) {
  for (const items of pages) {
    const rows = rowsOf(items);
    const otr = rows.find((r) => /On The Road Price\s+without Insurance/i.test(rowText(r)));
    if (!otr) continue;
    const cols = otr.parts
      .filter((p) => /\d{1,3}(?:,\d{3})+/.test(p.str))
      .map((p) => ({ cx: p.x + p.w / 2, text: '' }))
      .sort((a, b) => a.cx - b.cx);
    const eff = rows.findIndex((r) => /Effective from/i.test(rowText(r)));
    const stop = rows.findIndex((r) => /Engine Capacity|Individual Private|Selling Price/i.test(rowText(r)));
    const band = rows.slice(eff + 1, stop > eff ? stop : undefined);
    for (const r of band) {
      for (const p of r.parts) {
        const cx = p.x + p.w / 2;
        const col = cols.reduce((best, c) => (Math.abs(c.cx - cx) < Math.abs(best.cx - cx) ? c : best), cols[0]);
        col.text += ' ' + p.str;
      }
    }
    const used = new Set();
    return variants.map((v) => {
      const re = new RegExp(v.hdr, 'i');
      const hit = cols.map((c, i) => (re.test(c.text) ? i : -1)).filter((i) => i >= 0 && !used.has(i));
      if (hit.length !== 1) {
        throw new Error('cannot match column for ' + v.name + ' (header /' + v.hdr + '/ vs ' + JSON.stringify(cols.map((c) => c.text.trim())) + ')');
      }
      used.add(hit[0]);
      return hit[0];
    });
  }
  throw new Error('price row not found for column assignment');
}

export function itemsToLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    let row = rows.find((r) => Math.abs(r.y - it.y) <= 3);
    if (!row) rows.push((row = { y: it.y, parts: [] }));
    row.parts.push(it);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim());
}

const toNumbers = (line) => (line.match(NUM_RE) || []).map((s) => Number(s.replace(/,/g, '')));

/** Extract effective date, On-The-Road prices (without insurance) and Recommended Sum Insured. */
export function parsePriceLines(lines) {
  const otr = [];
  const si = [];
  for (const l of lines) {
    if (/On The Road Price\s+without Insurance/i.test(l)) otr.push(...toNumbers(l));
    else if (/Recommended Sum Insured/i.test(l)) si.push(...toNumbers(l));
  }
  let effective = null;
  const m = lines.join(' ').match(/Effective from\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i);
  if (m) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    if (mi >= 0) effective = `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return { effective, otr, si };
}

/** PDFs list either one price per variant, or (individual, company) pairs per variant. Take the individual price. */
export function pickColumns(nums, n) {
  if (nums.length === n) return nums;
  if (nums.length === 2 * n) return nums.filter((_, i) => i % 2 === 0);
  throw new Error(`expected ${n} or ${2 * n} numbers, found ${nums.length}: ${nums.join(', ')}`);
}

/** Find the "1.0-..." price PDF for a model folder on the Toyota price-list page. */
export function discoverPdf(html, folderPath) {
  const re = /\/content\/dam\/malaysia\/price-list-maintenance-packages\/[^"'\s<>\\]*?\.pdf/g;
  const all = [...new Set(html.match(re) || [])];
  const hits = all.filter((u) => u.includes(folderPath) && /\/1\.0-[^/]*\.pdf$/.test(u));
  if (!hits.length) throw new Error(`no price PDF found for ${folderPath}`);
  return hits[0];
}

/** Pull every promo card ({title, discountAmount, ...}) out of the monthly-promo page. */
export function extractPromoCards(html) {
  const cards = new Map();
  let idx = -1;
  while ((idx = html.indexOf('"layout"', idx + 1)) !== -1) {
    const start = html.lastIndexOf('{', idx);
    const end = html.indexOf('}', idx);
    if (start < 0 || end < 0) continue;
    try {
      const o = JSON.parse(html.slice(start, end + 1));
      if (o.title && !cards.has(norm(o.title))) cards.set(norm(o.title), o);
    } catch { /* not a card */ }
  }
  if (!cards.size) throw new Error('no promo cards found on promo page');
  return cards;
}

export const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
const money = (s) => {
  const m = String(s || '').match(/RM\s*([\d,]+)/i);
  return m ? Number(m[1].replace(/,/g, '')) : null;
};
const fmtRM = (n) => 'RM' + n.toLocaleString('en-US');

/** Turn a promo card into the rebate shown in the price list. */
export function promoToRebate(card) {
  const cond = String(card.conditionsText || '').replace(/^\*+/, '').trim();
  let amount;
  let text;
  let type = 'rebate';
  if (/voucher/i.test(card.discountAmount || '')) {
    amount = money(card.installmentsAmount);
    text = amount != null ? `${fmtRM(amount)} (SERVICE)` : 'Service Voucher';
    type = 'voucher';
  } else {
    amount = money(card.discountAmount);
    text = amount != null ? fmtRM(amount) : String(card.discountAmount || '').trim();
  }
  const combo = cond.match(/RM([\d,]+) rebate \+ RM([\d,]+) service voucher/i);
  if (combo) text = `RM${combo[1]} + RM${combo[2]} voucher`;
  const rebate = { amount: amount ?? 0, text, type, label: String(card.discountLabel || '').trim() };
  if (/choose|rebate|voucher/i.test(cond)) rebate.note = cond;
  return rebate;
}

export function emptyRebate(def) {
  if (def === 'n/a') return { amount: 0, text: 'n/a', type: 'none', label: '' };
  return { amount: 0, text: '-', type: 'none', label: '' };
}

/** Estimated insurance = recommended sum insured x calibrated rate, rounded to nearest RM100. */
export function estimateInsurance(sumInsured, variant) {
  if (!variant.baseSI) return variant.est;
  return Math.round((sumInsured * (variant.est / variant.baseSI)) / 100) * 100;
}
