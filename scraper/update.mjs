// Refreshes site/data/prices.json from toyota.com.my (price-list PDFs + monthly promo page).
// Usage: node scraper/update.mjs [--init-baseline]
//   --init-baseline  store today's Recommended Sum Insured as the insurance calibration base for variants that have none yet
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pdfRead, assignColumns, parsePriceLines, pickColumns, discoverPdf, extractPromoCards,
  promoToRebate, emptyRebate, estimateInsurance, norm,
} from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'config', 'products.json');
const OUT = path.join(ROOT, 'site', 'data', 'prices.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const INIT = process.argv.includes('--init-baseline');

async function get(url, tries = 3) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  throw new Error(`${url}: ${last.message}`);
}

const config = JSON.parse(await fs.readFile(CONFIG, 'utf8'));
let previous = null;
try { previous = JSON.parse(await fs.readFile(OUT, 'utf8')); } catch { /* first run */ }
const prevVariant = (gid, name) => previous?.groups?.find((g) => g.id === gid)?.variants?.find((v) => v.name === name);

const base = config.sources.base;
const errors = [];
const warnings = [];

const listHtml = (await get(base + config.sources.priceListPage)).toString('utf8');

let promo = null;
try {
  promo = extractPromoCards((await get(base + config.sources.promoPage)).toString('utf8'));
} catch (e) {
  errors.push(`Promo page: ${e.message} (previous rebates kept)`);
}

const groups = [];
for (const g of config.groups) {
  const prevGroup = previous?.groups?.find((x) => x.id === g.id);
  try {
    const pdfPath = discoverPdf(listHtml, g.pdf);
    const { lines, pages } = await pdfRead(await get(base + pdfPath));
    const { effective, otr, si } = parsePriceLines(lines);
    const n = g.variants.length;
    let bodies = pickColumns(otr, n);
    let sums = si.length ? pickColumns(si, n) : bodies.map((b) => Math.round((b * 0.99) / 1000) * 1000);
    // Several variants, one individual price each: match columns by their header text, not by order.
    if (n > 1 && otr.length === n) {
      const cols = assignColumns(pages, g.variants);
      bodies = cols.map((c) => bodies[c]);
      sums = cols.map((c) => sums[c]);
    }
    if (!si.length) warnings.push(`${g.name}: no Recommended Sum Insured in PDF, used 99% of OTR`);

    const variants = g.variants.map((v, i) => {
      const prev = prevVariant(g.id, v.name);
      let body = bodies[i];
      if (prev && Math.abs(body / prev.body - 1) > 0.25) {
        errors.push(`${v.name}: price jumped ${prev.body} -> ${body} (>25%), previous price kept - please check`);
        body = prev.body;
      }
      if (INIT && !v.baseSI) v.baseSI = sums[i]; // fills missing calibration bases only; never overwrites
      let rebate;
      if (!v.promo) rebate = emptyRebate(v.rebateDefault);
      else if (promo?.has(norm(v.promo))) rebate = promoToRebate(promo.get(norm(v.promo)));
      else if (promo) {
        rebate = emptyRebate(v.rebateDefault);
        warnings.push(`${v.name}: promo "${v.promo}" not on Toyota promo page - rebate set to none`);
      } else rebate = prev?.rebate ?? emptyRebate(v.rebateDefault);
      return {
        name: v.name,
        hev: /HEV/i.test(v.name),
        body,
        sumInsured: sums[i],
        insurance: estimateInsurance(sums[i], v),
        rebate,
      };
    });
    groups.push({ id: g.id, name: g.name, image: g.image, effective, source: base + pdfPath, variants });
  } catch (e) {
    errors.push(`${g.name}: ${e.message}${prevGroup ? ' (previous data kept)' : ''}`);
    if (prevGroup) groups.push(prevGroup);
  }
}

if (INIT) await fs.writeFile(CONFIG, JSON.stringify(config, null, 2) + '\n');

const now = new Date();
const data = {
  generatedAt: now.toISOString(),
  settings: config.settings,
  sources: { priceList: base + config.sources.priceListPage, promo: base + config.sources.promoPage },
  insuranceNote: config.insurance.note,
  warnings: [...errors, ...warnings],
  groups,
};
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(data, null, 2) + '\n');

console.log(`Wrote ${path.relative(ROOT, OUT)}: ${groups.length}/${config.groups.length} models`);
for (const w of warnings) console.log('warn  ', w);
for (const e of errors) console.error('ERROR ', e);
process.exit(errors.length ? 1 : 0);
