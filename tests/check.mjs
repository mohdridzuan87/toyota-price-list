// Regression test: scraped data + calc.js must reproduce the original Excel price list.
// Run after `npm run update`:  node tests/check.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calc } from '../site/calc.js';
import { formatMyPhone, formatMyPhoneLocal } from '../site/phone.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await fs.readFile(path.join(ROOT, 'site/data/prices.json'), 'utf8'));
let fail = 0;
const eq = (label, got, want) => {
  const ok = typeof want === 'number' ? Math.round(got) === Math.round(want) : got === want;
  if (!ok) { fail++; console.log('FAIL', label, 'got', got, 'want', want); }
};

// Original Excel (Toyota Price List.xlsx, Nov 2026): body price, rebate and insurance are compared with it.
// (The old Excel D/P base, 10% of body + insurance, was replaced by 10% of body only.)
const X = {
  'YARIS 1.E': [90400, 'n/a', 3100, 9350, 81050, 906, 1010],
  'YARIS 1.G': [96400, 'n/a', 3300, 9970, 86430, 966, 1077],
  'YARIS CROSS 1.5S': [99900, null, 3600, 10350, 89550, 1001, 1116],
  'YARIS CROSS 1.5HEV': [109900, null, 3900, 11380, 98520, 1101, 1228],
  'VIOS 1.5E': [90600, 12000, 3400, 9400, 81200, 907, 1013],
  'VIOS 1.5G': [96600, 12000, 3600, 10020, 86580, 968, 1080],
  'VIOS 1.5HEV': [103900, 14000, 3700, 10760, 93140, 1041, 1161],
  'VIOS 1.5HEV GRS': [109900, 12000, 3900, 11380, 98520, 1101, 1228],
  'COROLLA ALTIS 1.8G': [144800, 18000, 4500, 14930, 129870, 1451, 1618],
  'COROLLA ALTIS 1.8 GRS': [149800, 18000, 4700, 15450, 134350, 1501, 1674],
  'COROLLA CROSS 1.8V': [133800, 13000, 4200, 13800, 120000, 1341, 1495],
  'COROLLA CROSS 1.8 HEV': [140800, 13000, 4400, 14520, 126280, 1411, 1574],
  'COROLLA CROSS 1.8 HEV GRS': [148800, 13000, 4800, 15360, 133440, 1491, 1663],
  'VELOZ 1.5G': [95000, 3000, 3500, 9850, 85150, 952, 1062],
  'INNOVA ZENIX 2.0V': [165000, 10000, 6500, 17150, 147850, 1652, 1844],
  'INNOVA ZENIX 2.0HEV': [202000, 11000, 7000, 20900, 181100, 2024, 2258],
  'FORTUNER 2.4': [195880, 11000, 7000, 20288, 175592, 1962, 2189],
  'FORTUNER 2.7 SRZ': [202880, 11000, 7200, 21008, 181872, 2033, 2267],
  'FORTUNER 2.8 VRZ': [241880, 11000, 9000, 25088, 216792, 2423, 2703],
  'HILUX S/C 2.4MT': [104880, 9000, 4000, 10888, 93992, 1050, 1172],
  'HILUX D/C 2.4E MT': [117880, 14000, 4300, 12218, 105662, 1181, 1317],
  'HILUX D/C 2.4E AT': [119880, 14000, 4500, 12438, 107442, 1201, 1340],
  'HILUX D/C 2.4V AT': [149580, 14000, 5500, 15508, 134072, 1498, 1672],
  'HILUX D/C ROGUE 2.8 AT': [163080, 14000, 6000, 16908, 146172, 1634, 1823],
  'HILUX D/C 2.8 GRS': [173280, 14000, 6900, 18018, 155262, 1735, 1937],
  'CAMRY 2.5 V': [221800, 20000, 10000, 23180, 198620, 2220, 2479],
  'CAMRY 2.5 HEV': [248800, 12000, 12000, 26080, 222720, 2489, 2781],
  'HIACE 3.0 P/VAN': [127800, 3100, 4500, 13230, 114570, 1280, 1428],
  'HIACE 2.8D W/VAN': [172000, 0, 5800, 17780, 154220, 1724, 1922],
  'VELLFIRE 2.5 AT': [448000, 0, 14000, 46200, 401800, 4490, 5007],
  'VELLFIRE 2.5 HEV': [549900, 0, 15000, 56490, 493410, 5514, 6146],
  'ALPHARD 2.4T': [548000, 0, 16000, 56400, 491600, 5494, 6124],
  'HARRIER 2.5HEV': [289000, 0, 7000, 29600, 259400, 2899, 3230],
};

const seen = new Set();
for (const g of data.groups) {
  for (const v of g.variants) {
    seen.add(v.name);
    const x = X[v.name];
    if (!x) { fail++; console.log('FAIL unexpected variant', v.name); continue; }
    const c = calc(v.body, v.insurance, data.settings);
    eq(v.name + ' body', v.body, x[0]);
    if (x[1] === 'n/a') eq(v.name + ' rebate', v.rebate.text, 'n/a');
    else if (x[1] != null) eq(v.name + ' rebate', v.rebate.amount, x[1]);
    eq(v.name + ' insurance', v.insurance, x[2]);
    // D/P is on the body price only (changed from the Excel method on purpose)
    const dpE = v.body * 0.1, loanE = v.body - dpE, f = 1 + 0.023 * 9;
    eq(v.name + ' DP', c.dp, dpE);
    eq(v.name + ' loan', c.loan, loanE);
    eq(v.name + ' 9y/10% D/P', c.m90, (loanE * f) / 108);
    eq(v.name + ' 9y/0% D/P', c.m100, (v.body * f) / 108);
  }
}
for (const n of Object.keys(X)) if (!seen.has(n)) { fail++; console.log('FAIL missing variant', n); }

// phone formatter
const P = [
  ['0163313607', '016-331 3607'],
  ['016-331 3607', '016-331 3607'],
  ['+60 16 331 3607', '016-331 3607'],
  ['+6016 - 331 3607', '016-331 3607'],
  ['6016-3313607', '016-331 3607'],
  ['011-23456789', '011-2345 6789'],
  ['0312228028', '03-1222 8028'],
  ['0', '0'],
  ['01', '01'],
  ['016', '016'],
  ['01633', '016-33'],
  ['', ''],
];
for (const [i, o] of P) eq('phone "' + i + '"', formatMyPhone(i), o);
const L = [
  ['+6016 - 331 3607', '016-331 3607'],
  ['0163313607', '016-331 3607'],
  ['6016-3313607', '016-331 3607'],
  ['011-23456789', '011-2345 6789'],
  ['0312228028', '03-1222 8028'],
  ['0', '0'],
  ['', ''],
];
for (const [i, o] of L) eq('local phone "' + i + '"', formatMyPhoneLocal(i), o);

console.log(fail ? `\n${fail} check(s) FAILED` : `All checks passed (${seen.size} variants vs Excel, phone formats)`);
process.exit(fail ? 1 : 0);
