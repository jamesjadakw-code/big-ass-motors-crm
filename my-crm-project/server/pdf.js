const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const PDFDocument = require('pdfkit');
const config = require('./config');

const INK = '#111111';
const GREY = '#555555';
const shortName = (c) => String(c || '').replace(/[,\s]+(LLC|L\.L\.C\.|Inc\.?|Corp\.?)$/i, '').trim() || 'Big Ass Motors';
const LOGO = path.join(__dirname, 'assets', 'logo.png');

// First usable photo of the unit (JPEG/PNG only). Failures just leave the placeholder.
async function heroImage(unit) {
  for (const url of (unit.media || []).filter((u) => /^https?:\/\//i.test(u)).slice(0, 3)) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
      const png = buf[0] === 0x89 && buf[1] === 0x50;
      if (jpeg || png) return buf;
    } catch { /* try next */ }
  }
  return null;
}

const bullets = (unit) => {
  const oem = unit.oemSpecs || {};
  const engine = unit.engineModel || oem.engine;
  const hp = unit.hp != null ? `${unit.hp} HP` : oem.hp != null ? `${oem.hp} HP (OEM ref.)` : null;
  return [
    unit.hours != null && `${Number(unit.hours).toLocaleString('en-US')} meter hours`,
    engine && `Engine: ${engine}${unit.engineModel ? '' : ' (OEM ref.)'}`,
    hp && `Power: ${hp}`,
    unit.weight && `Operating weight: ${unit.weight}`,
    unit.dimensions && `Transport dimensions: ${unit.dimensions}`,
    unit.hydraulicFlow && `Hydraulic flow: ${unit.hydraulicFlow}`,
    unit.serviceHistory && `Maintenance: ${unit.serviceHistory}`,
  ].filter(Boolean);
};

const listItems = (text) => String(text || '').split(/[;\n,]+/).map((s) => s.trim()).filter(Boolean);

// One-page BAM feature sheet in the BAM brochure style.
// Public: shows list price or "Call for Price". Never the internal ask/buy price, seller status, defects or source URL.
function pdfkitSheet(unit, res, photo, buyer) {
  const GOLD = config.goldHex || '#FFC400';
  const doc = new PDFDocument({ size: 'LETTER', margin: 0 });
  doc.pipe(res);
  const W = doc.page.width;
  const H = doc.page.height;
  const M = 36;
  const title = [unit.year, unit.make, unit.model].filter(Boolean).join(' ') || 'Unit';
  const price = unit.listPrice ? '$' + Math.round(unit.listPrice).toLocaleString('en-US') : 'CALL FOR PRICE';
  const contact = `PRICE: ${price}   •   ${config.phone}   •   ${config.email}`;

  // Header: logo left, company and contact block right
  if (fs.existsSync(LOGO)) doc.image(LOGO, M, 18, { fit: [150, 82] });
  const rx = W - M - 300;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(14).text(shortName(config.company).toUpperCase(), rx, 22, { width: 300, align: 'right', characterSpacing: 2 });
  doc.font('Helvetica-Bold').fontSize(7.5);
  [config.authority, config.established, config.address, `PHONE ${config.phone}`, `MOBILE ${config.mobile}`,
    `EMAIL ${config.email}`, `WEB ${config.web}`, config.services].forEach((line, i) => {
    doc.text(line, rx, 42 + i * 10.5, { width: 300, align: 'right' });
  });
  doc.rect(M, 128, W - 2 * M, 2.5).fill(GOLD);

  // Title + subtitle + highlight strip (Buyer-safe: category + stock only, NEVER unit city/state)
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(24).text(title, M, 142, { width: W - 2 * M, align: 'center' });
  const sub = [unit.category, unit.stock && `Stock ${unit.stock}`].filter(Boolean).join('  •  ');
  if (buyer && buyer.name) {
    const who = `PREPARED FOR ${buyer.name.toUpperCase()}${buyer.company ? `  •  ${buyer.company.toUpperCase()}` : ''}`;
    doc.fillColor(GREY).font('Helvetica-Bold').fontSize(8).text(who, M, 135, { width: W - 2 * M, align: 'center', characterSpacing: 1.2 });
  }
  doc.fillColor(GREY).font('Helvetica').fontSize(10.5).text(sub, M, 174, { width: W - 2 * M, align: 'center' });
  const strip = [unit.hours != null && `${Number(unit.hours).toLocaleString('en-US')} Hours`, unit.hp != null && `${unit.hp} HP`, unit.category]
    .filter(Boolean).join('  |  ');
  doc.rect(M, 196, W - 2 * M, 26).fill(INK);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5).text(strip || 'INSPECTION WELCOME', M, 205, { width: W - 2 * M, align: 'center' });

  // Hero photo
  const px = M, py = 232, pw = W - 2 * M, ph = 220;
  if (photo) {
    doc.save().rect(px, py, pw, ph).clip();
    doc.image(photo, px, py, { cover: [pw, ph], align: 'center', valign: 'center' });
    doc.restore();
  } else {
    doc.rect(px, py, pw, ph).fill('#f1f1f1');
    doc.fillColor('#999999').font('Helvetica-Bold').fontSize(12).text('PHOTOS AVAILABLE ON REQUEST', px, py + ph / 2 - 8, { width: pw, align: 'center' });
  }

  // Description
  let y = py + ph + 14;
  const heading = (t, x, yy, w) => {
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(t, x, yy);
    doc.rect(x, yy + 15, w, 1.5).fill(GOLD);
  };
  heading('UNIT DESCRIPTION', M, y, W - 2 * M);
  const narrative = unit.narrative || unit.inspectionNotes || 'Condition details available on request. Inspection welcome.';
  doc.fillColor(INK).font('Helvetica').fontSize(9.5).text(narrative, M, y + 24, { width: W - 2 * M, lineGap: 2, height: 52, ellipsis: true });

  // Highlights + package
  y += 88;
  const cw = (W - 2 * M - 24) / 2;
  heading('KEY HIGHLIGHTS', M, y, cw);
  heading('PACKAGE INCLUDES', M + cw + 24, y, cw);
  const draw = (items, x, empty) => {
    let yy = y + 26;
    const rows = items.length ? items : [empty];
    for (const it of rows.slice(0, 8)) {
      doc.fillColor(INK).font('Helvetica').fontSize(9).text(items.length ? `•  ${it}` : it, x, yy, { width: cw, lineGap: 1 });
      yy = doc.y + 3;
    }
  };
  draw(bullets(unit), M, 'Specifications pending inspection');
  draw(listItems(unit.attachments), M + cw + 24, 'Attachments: Pending Inspection');

  // Price bar
  const by = H - 92;
  doc.rect(M, by - 8, W - 2 * M, 38).fill(INK);
  doc.rect(M + 2, by - 6, W - 2 * M - 4, 34).lineWidth(1.5).stroke(GOLD);
  doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(12).text(contact, M, by + 5, { width: W - 2 * M, align: 'center' });

  // Footer Page 1
  doc.rect(0, H - 36, W, 36).fill(INK);
  doc.fillColor('#ffffff').fontSize(7.5)
    .text(`${shortName(config.company)}  •  ${config.hq}  •  US & MX Coverage`, M, H - 22, { lineBreak: false })
    .text('Page 1', M, H - 22, { width: W - 2 * M, align: 'center', lineBreak: false })
    .text(`${config.web}  •  ${config.phone}`, W - M - 250, H - 22, { width: 250, align: 'right', lineBreak: false });

  // Page 2 (Canonical 2-Page Spec & CTA Layout)
  doc.addPage({ size: 'LETTER', margin: 0 });
  if (fs.existsSync(LOGO)) doc.image(LOGO, M, 18, { fit: [150, 82] });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(14).text(shortName(config.company).toUpperCase(), rx, 22, { width: 300, align: 'right', characterSpacing: 2 });
  doc.font('Helvetica-Bold').fontSize(7.5);
  [config.authority, config.established, config.address, `PHONE ${config.phone}`, `MOBILE ${config.mobile}`,
    `EMAIL ${config.email}`, `WEB ${config.web}`, config.services].forEach((line, i) => {
    doc.text(line, rx, 42 + i * 10.5, { width: 300, align: 'right' });
  });
  doc.rect(M, 128, W - 2 * M, 2.5).fill(GOLD);
  doc.rect(M, 136, W - 2 * M, 1.5).fill(GOLD);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(`${title.toUpperCase()}  •  ${(unit.category || 'HEAVY EQUIPMENT').toUpperCase()}`, M, 143, { width: W - 2 * M, align: 'center' });
  doc.rect(M, 160, W - 2 * M, 1.5).fill(GOLD);

  heading(`TECHNICAL SPECIFICATIONS — ${[unit.make, unit.model].filter(Boolean).join(' ').toUpperCase()}`, M, 174, W - 2 * M);
  const oem = unit.oemSpecs || {};
  const specRows = [
    ['Year / Model', title],
    ['Hours', unit.hours != null ? Number(unit.hours).toLocaleString('en-US') : 'Call'],
    ['Category', unit.category || 'Heavy Equipment'],
    ['Condition', 'Used'],
    ['Make / Model', [unit.make, unit.model].filter(Boolean).join(' ')],
    ['Engine', unit.engineModel || oem.engine || 'OEM Standard'],
    ['Horsepower', unit.hp != null ? `${unit.hp} HP` : oem.hp != null ? `${oem.hp} HP (OEM ref.)` : 'OEM Standard'],
    ['Operating Weight', unit.weight || oem.operatingWeight || 'OEM Standard'],
    ['Transport Dimensions', unit.dimensions || oem.dimensions || 'Standard'],
    ['Hydraulics', unit.hydraulicFlow || oem.hydraulics || 'Standard'],
    ['Attachments', listItems(unit.attachments).slice(0, 3).join(', ') || 'Standard Setup'],
    ['Stock Number', unit.stock || 'BAM'],
  ];
  const half = Math.ceil(specRows.length / 2);
  const boxH = half * 18 + 14;
  doc.rect(M, 198, W - 2 * M, boxH).fillAndStroke('#FFF7D6', GOLD);
  const colW = (W - 2 * M - 20) / 2;
  specRows.forEach(([k, v], idx) => {
    const col = Math.floor(idx / half);
    const row = idx % half;
    const xx = M + 10 + col * (colW + 10);
    const yy = 206 + row * 18;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(8.5).text(String(k), xx, yy, { width: colW * 0.42, lineBreak: false });
    doc.fillColor('#282828').font('Helvetica').fontSize(8.5).text(String(v).slice(0, 36), xx + colW * 0.44, yy, { width: colW * 0.54, lineBreak: false });
  });

  // Canonical Page 2 CTA Box
  const ctaY = H - 134;
  doc.rect(M, ctaY, W - 2 * M, 70).lineWidth(1.5).fillAndStroke(INK, GOLD);
  const ctaHead = unit.listPrice ? `READY TO WORK — ${price}` : 'READY TO WORK — CALL FOR PRICE';
  doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(13.5).text(ctaHead, M, ctaY + 10, { width: W - 2 * M, align: 'center' });
  doc.fillColor('#ffffff').font('Helvetica').fontSize(9).text('Call or text for a walk-around video and inspection details.', M, ctaY + 27, { width: W - 2 * M, align: 'center' });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15).text(config.phone, M, ctaY + 41, { width: W - 2 * M, align: 'center' });
  doc.fillColor('#d7d7d7').font('Helvetica').fontSize(8).text(`${config.email}   •   ${config.web}`, M, ctaY + 57, { width: W - 2 * M, align: 'center' });

  doc.rect(0, H - 36, W, 36).fill(INK);
  doc.fillColor('#ffffff').fontSize(7.5)
    .text(`${shortName(config.company)}  •  ${config.hq}  •  US & MX Coverage`, M, H - 22, { lineBreak: false })
    .text('Page 2', M, H - 22, { width: W - 2 * M, align: 'center', lineBreak: false })
    .text(`${config.web}  •  ${config.phone}`, W - M - 250, H - 22, { width: 250, align: 'right', lineBreak: false });
  doc.end();
}

// Primary renderer: reportlab (brochure.py). Fallback: the pdfkit sheet above if Python/reportlab is unavailable.
function reportlabSheet(unit, photo, buyer) {
  const payload = JSON.stringify({ unit, config, photo: photo ? photo.toString('base64') : null, buyer: buyer || null });
  const candidates = [process.env.BAM_PYTHON, 'python', 'py', 'python3'].filter(Boolean);
  const attempt = (i) => new Promise((resolve, reject) => {
    if (i >= candidates.length) return reject(new Error('no Python with reportlab found'));
    const py = spawn(candidates[i], ['-I', path.join(__dirname, 'brochure.py')], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const out = [];
    let err = '';
    py.stdout.on('data', (d) => out.push(d));
    py.stderr.on('data', (d) => { err += d; });
    py.on('error', () => resolve(attempt(i + 1)));
    py.on('close', (code) => (code === 0 && out.length ? resolve(Buffer.concat(out)) : reject(new Error(err || `python exited ${code}`))));
    py.stdin.on('error', () => {});
    py.stdin.end(payload);
  });
  return attempt(0);
}

// Renders the sheet to a Buffer (used for email attachments). `buyer` ({ name, company, destination })
// personalizes it; it never carries pricing. `photo` can be passed in to avoid re-downloading it for every buyer.
async function renderSheet(unit, { buyer = null, photo } = {}) {
  const img = photo === undefined ? await heroImage(unit) : photo;
  try {
    return await reportlabSheet(unit, img, buyer);
  } catch (e) {
    console.warn('brochure: reportlab unavailable, using pdfkit fallback:', String(e.message).trim().split(/\r?\n/).pop());
    const { PassThrough } = require('stream');
    const sink = new PassThrough();
    const chunks = [];
    sink.on('data', (d) => chunks.push(d));
    const done = new Promise((resolve, reject) => { sink.on('end', resolve); sink.on('error', reject); });
    pdfkitSheet(unit, sink, img, buyer);
    await done;
    return Buffer.concat(chunks);
  }
}

async function featureSheet(unit, res) {
  const pdf = await renderSheet(unit);
  res.setHeader('Content-Length', pdf.length);
  res.end(pdf);
}

module.exports = { featureSheet, renderSheet, heroImage };
