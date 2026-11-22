// A tiny stand-in for the part of jsPDF that pdf.js uses, drawing on a <canvas> instead.
// Same coordinates (millimetres) and font sizes (points), so the price-list sheet can be exported as a
// high-resolution picture with exactly the same layout as the PDF.
export function createCanvasDoc(wMM, hMM, pxPerMm) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(wMM * pxPerMm);
  cv.height = Math.round(hMM * pxPerMm);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const S = pxPerMm;
  const PT = (pxPerMm * 25.4) / 72; // pixels per point
  const st = { size: 10, bold: false, text: 'rgb(0,0,0)', fill: 'rgb(0,0,0)', stroke: 'rgb(0,0,0)', lw: 0.2 };
  const rgb = (r, g, b) => `rgb(${r},${g},${b})`;
  const images = new Map();
  const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

  const setFont = () => { ctx.font = `${st.bold ? 700 : 400} ${st.size * PT}px Helvetica, Arial, "Liberation Sans", sans-serif`; };
  const path = (x, y, w, h, r) => {
    x *= S; y *= S; w *= S; h *= S; r = Math.min(r * S, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  const paint = (style = 'S') => {
    if (style.includes('F')) { ctx.fillStyle = st.fill; ctx.fill(); }
    if (style.includes('S') || style === 'D') { ctx.strokeStyle = st.stroke; ctx.lineWidth = st.lw * S; ctx.stroke(); }
  };

  return {
    canvas: cv,
    // --- state
    setFillColor: (r, g, b) => { st.fill = rgb(r, g, b); },
    setDrawColor: (r, g, b) => { st.stroke = rgb(r, g, b); },
    setTextColor: (r, g, b) => { st.text = rgb(r, g, b); },
    setLineWidth: (w) => { st.lw = w; },
    setFont: (_name, style) => { st.bold = style === 'bold'; },
    setFontSize: (pt) => { st.size = pt; },
    setProperties: () => {},
    // --- shapes
    rect(x, y, w, h, style) { path(x, y, w, h, 0); paint(style); },
    roundedRect(x, y, w, h, rx, _ry, style) { path(x, y, w, h, rx); paint(style); },
    line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1 * S, y1 * S); ctx.lineTo(x2 * S, y2 * S); ctx.strokeStyle = st.stroke; ctx.lineWidth = st.lw * S; ctx.stroke(); },
    circle(x, y, r, style) { ctx.beginPath(); ctx.arc(x * S, y * S, r * S, 0, Math.PI * 2); paint(style); },
    // --- text
    text(str, x, y, o = {}) {
      setFont();
      ctx.fillStyle = st.text;
      ctx.textAlign = o.align === 'right' ? 'right' : o.align === 'center' ? 'center' : 'left';
      if ('letterSpacing' in ctx) ctx.letterSpacing = (o.charSpace || 0) * S + 'px';
      ctx.fillText(String(str), x * S, y * S);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    },
    splitTextToSize(str, maxW) {
      setFont();
      const out = [];
      for (const para of String(str).split('\n')) {
        let line = '';
        for (const word of para.split(' ')) {
          const test = line ? line + ' ' + word : word;
          if (line && ctx.measureText(test).width / S > maxW) { out.push(line); line = word; } else line = test;
        }
        out.push(line);
      }
      return out;
    },
    // --- images (preloaded first, because canvas drawing is synchronous)
    async preload(srcs) {
      await Promise.all(srcs.filter(Boolean).map(async (s) => { if (!images.has(s)) images.set(s, await loadImg(s)); }));
    },
    addImage(src, _fmt, x, y, w, h) {
      const img = images.get(src);
      if (img) ctx.drawImage(img, x * S, y * S, w * S, h * S);
    },
    /** PNG (sharp text); JPEG 95% only if the PNG would be over ~4.8 MB (WhatsApp catalogue limit is 5 MB). */
    async toBlob() {
      const png = await new Promise((res) => cv.toBlob(res, 'image/png'));
      if (png && png.size <= 4.8 * 1024 * 1024) return png;
      return new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.95));
    },
  };
}
