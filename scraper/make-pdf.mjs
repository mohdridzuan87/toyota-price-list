// Renders the page to site/price-list.pdf (one A4 landscape sheet) with headless Chrome.
// Usage: node scraper/make-pdf.mjs   (CHROME env var overrides the browser path)
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site', 'price-list.pdf');
const PORT = 4191;
const candidates = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'].filter(Boolean);
const chrome = candidates.find((p) => fs.existsSync(p));
if (!chrome) throw new Error('Chrome not found (set CHROME)');

const server = spawn(process.execPath, [path.join(ROOT, 'serve.mjs'), String(PORT)], { stdio: 'ignore' });
try {
  await new Promise((r) => setTimeout(r, 1200));
  const r = spawnSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=8000', `--print-to-pdf=${OUT}`, `http://localhost:${PORT}/`], { stdio: 'inherit' });
  if (r.status !== 0 || !fs.existsSync(OUT)) throw new Error('PDF generation failed');
  console.log('Wrote', path.relative(ROOT, OUT), fs.statSync(OUT).size, 'bytes');
} finally {
  server.kill();
}
