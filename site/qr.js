// WhatsApp QR code made from the sales advisor's own phone number (vendored qrcode-generator, MIT).
// The code opens a chat with that number: https://wa.me/60163313607

let libPromise;
function loadLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  libPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/qrcode.js';
    s.onload = () => resolve(window.qrcode);
    s.onerror = () => reject(new Error('QR library failed to load'));
    document.head.appendChild(s);
  });
  return libPromise;
}

/** International WhatsApp number (digits, no +) for a Malaysian MOBILE number, or null (landlines have no WhatsApp). */
export function waNumber(phone) {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (d.startsWith('60')) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  return /^1\d{8,9}$/.test(d) ? '60' + d : null;
}

export function waLink(phone) {
  const n = waNumber(phone);
  return n ? 'https://wa.me/' + n : null;
}

/** QR module matrix for any text. Error correction M (15%). */
export async function qrMatrix(text) {
  const qrcode = await loadLib();
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return { n: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) };
}

/** Inline SVG (black on white, with a 2-module quiet zone). Runs of dark modules are merged to keep it small. */
export function qrSvg(m, quiet = 2) {
  const size = m.n + quiet * 2;
  let d = '';
  for (let r = 0; r < m.n; r++) {
    let c = 0;
    while (c < m.n) {
      if (!m.isDark(r, c)) { c++; continue; }
      let run = 1;
      while (c + run < m.n && m.isDark(r, c + run)) run++;
      d += `M${c + quiet} ${r + quiet}h${run}v1h-${run}z`;
      c += run;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code: chat on WhatsApp"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
