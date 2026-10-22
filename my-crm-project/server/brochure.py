"""BAM Canonical 2-Page Official Equipment Brochure, built with reportlab.

Reads JSON {"unit": {...}, "config": {...}, "photo": "<base64 jpeg/png or null>", "buyer": {...} or null} on stdin, writes the 2-page PDF to stdout.
Strict Buyer-Safe Rules:
- Public list price or CALL FOR PRICE only.
- NEVER includes unit city/state, seller name/contact, buy/ask price, serial/VIN, defects, or source URL.
- Page 2 CTA subtitle: "Call or text for a walk-around video and inspection details."
"""
import base64
import io
import json
import os
import re
import sys

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfgen import canvas

INK, GREY, PALE, SPEC_BG = HexColor('#111111'), HexColor('#555555'), HexColor('#F1F1F1'), HexColor('#FFF7D6')
LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'logo.png')
W, H = letter
M = 36


def short_name(company):
    return re.sub(r'[,\s]+(LLC|L\.L\.C\.|Inc\.?|Corp\.?)$', '', company or '', flags=re.I).strip() or 'Big Ass Motors'


def build(unit, cfg, photo_b64, buyer=None):
    name = short_name(cfg.get('company'))
    GOLD = HexColor(cfg.get('goldHex') or '#FFC107')
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    top = lambda t: H - t

    def text(s, x, t, font='Helvetica', size=10, color=INK, align='left', spacing=0):
        c.setFont(font, size)
        c.setFillColor(color)
        t_obj = c.beginText()
        t_obj.setFont(font, size)
        t_obj.setCharSpace(spacing)
        w = c.stringWidth(s, font, size) + spacing * len(s)
        x0 = x - w if align == 'right' else x - w / 2 if align == 'center' else x
        t_obj.setTextOrigin(x0, top(t))
        t_obj.textOut(s)
        c.drawText(t_obj)

    def rect(x, t, w, h, fill=None, stroke=None, lw=1):
        if fill is not None:
            c.setFillColor(fill)
        if stroke is not None:
            c.setStrokeColor(stroke)
            c.setLineWidth(lw)
        c.rect(x, top(t + h), w, h, fill=1 if fill is not None else 0, stroke=1 if stroke is not None else 0)

    def draw_header():
        if os.path.exists(LOGO):
            c.drawImage(LOGO, M, top(18 + 82), width=150, height=82, preserveAspectRatio=True, anchor='nw', mask='auto')
        rx = W - M
        text(name.upper(), rx, 34, 'Helvetica-Bold', 14, align='right', spacing=2)
        lines = [cfg['authority'], cfg['established'], cfg['address'], 'PHONE ' + cfg['phone'], 'MOBILE ' + cfg['mobile'],
                 'EMAIL ' + cfg['email'], 'WEB ' + cfg['web'], cfg['services']]
        for i, ln in enumerate(lines):
            text(ln, rx, 50 + i * 10.5, 'Helvetica-Bold', 7.5, align='right')
        rect(M, 128, W - 2 * M, 2.5, fill=GOLD)

    def draw_footer(page_no):
        rect(0, H - 30, W, 30, fill=INK)
        text(f"{name}  •  Jacksonville, FL  •  US & MX Coverage", M, H - 12, 'Helvetica', 7.2, white)
        text(f"Page {page_no}", W / 2, H - 12, 'Helvetica', 7.2, white, 'center')
        text(f"{cfg['web']}  •  {cfg['phone']}", W - M, H - 12, 'Helvetica', 7.2, white, 'right')

    def heading(t, x, yy, w):
        text(t, x, yy + 10, 'Helvetica-Bold', 10.5)
        rect(x, yy + 15, w, 1.8, fill=GOLD)

    title = ' '.join(str(unit[k]) for k in ('year', 'make', 'model') if unit.get(k)) or 'Unit'
    lp = unit.get('listPrice')
    price = '$' + format(round(lp), ',') if lp else 'CALL FOR PRICE'
    hours = unit.get('hours')
    hours_txt = format(int(hours), ',') if hours not in (None, '') else None
    hp = unit.get('hp')
    oem = unit.get('oemSpecs') or {}
    engine = unit.get('engineModel') or oem.get('engine')
    hp_txt = f'{hp} HP' if hp not in (None, '') else (f"{oem['hp']} HP (OEM ref.)" if oem.get('hp') else None)

    # ================= PAGE 1 =================
    draw_header()
    text(title.upper(), W / 2, 166, 'Helvetica-Bold', 22, align='center')
    # Buyer-safe subtitle: category + stock only (NEVER unit city/state)
    sub = '  •  '.join(x for x in (unit.get('category'), unit.get('stock') and 'Stock ' + str(unit['stock'])) if x)
    if buyer and buyer.get('name'):
        who = 'PREPARED FOR ' + buyer['name'].upper() + (('  •  ' + buyer['company'].upper()) if buyer.get('company') else '')
        text(who, W / 2, 144, 'Helvetica-Bold', 8, GREY, 'center', 1.2)
    text(sub, W / 2, 184, 'Helvetica', 10.5, GREY, 'center')

    strip = '  |  '.join(x for x in (
        'USED',
        hours_txt and hours_txt + ' Hours',
        'Inspection Welcome',
        unit.get('stock') and 'Stock ' + str(unit['stock'])
    ) if x)
    rect(M, 194, W - 2 * M, 24, fill=INK)
    text(strip, W / 2, 210, 'Helvetica-Bold', 9, white, 'center')

    # Hero photo
    px, py, pw, ph = M, 228, W - 2 * M, 215
    drawn = False
    if photo_b64:
        try:
            img = ImageReader(io.BytesIO(base64.b64decode(photo_b64)))
            iw, ih = img.getSize()
            s = max(pw / iw, ph / ih)
            c.saveState()
            p = c.beginPath()
            p.rect(px, top(py + ph), pw, ph)
            c.clipPath(p, stroke=0, fill=0)
            c.drawImage(img, px + (pw - iw * s) / 2, top(py + ph) + (ph - ih * s) / 2, iw * s, ih * s)
            c.restoreState()
            drawn = True
        except Exception:
            drawn = False
    if not drawn:
        rect(px, py, pw, ph, fill=PALE)
        text(f"PHOTOS AVAILABLE ON REQUEST — CALL {cfg['phone']}", W / 2, py + ph / 2 + 4, 'Helvetica-Bold', 11, HexColor('#777777'), 'center')

    # Unit Description
    y = py + ph + 14
    heading('UNIT DESCRIPTION', M, y, W - 2 * M)
    narrative = unit.get('narrative') or unit.get('inspectionNotes') or f"{title} offered by Big Ass Motors, Jacksonville, FL. Freight arranged across the US & Mexico."
    for i, ln in enumerate(simpleSplit(narrative, 'Helvetica', 9.2, W - 2 * M)[:4]):
        text(ln, M, y + 31 + i * 12, 'Helvetica', 9.2)

    # Key Highlights + Package Includes / Specs at a Glance
    y += 86
    cw = (W - 2 * M - 24) / 2
    package = [s.strip() for s in re.split(r'[;\n,]+', str(unit.get('attachments') or '')) if s.strip()]
    heading('KEY HIGHLIGHTS', M, y, cw)
    heading('PACKAGE INCLUDES' if package else 'SPECS AT A GLANCE', M + cw + 24, y, cw)

    highlights = [
        hours_txt and f"{hours_txt} hours on a {unit.get('year') or ''} {unit.get('model') or ''}".strip(),
        engine and f"Engine: {engine}",
        hp_txt and f"Power: {hp_txt}",
        unit.get('weight') and f"Operating weight: {unit['weight']}",
        'Walk-around video and inspection details available.',
        'Freight available across the US & Mexico.',
    ]
    glance = package if package else [
        hours_txt and f"Hours: {hours_txt}",
        unit.get('category') and f"Category: {unit['category']}",
        f"Make / Model: {unit.get('make') or ''} {unit.get('model') or ''}".strip(),
        engine and f"Engine: {engine}",
        hp_txt and f"Gross Power: {hp_txt}",
        unit.get('weight') and f"Operating Weight: {unit['weight']}",
    ]

    def draw_bullets(items, x, empty):
        yy = y + 32
        rows = [i for i in items if i][:6]
        for it in (rows or [empty]):
            for ln in simpleSplit(('•  ' if rows else '') + it, 'Helvetica', 8.8, cw)[:2]:
                text(ln, x, yy, 'Helvetica', 8.8)
                yy += 11.5
            yy += 2

    draw_bullets(highlights, M, 'Specifications verified by BAM')
    draw_bullets(glance, M + cw + 24, 'Standard configuration')

    # Page 1 Price Bar
    by = H - 76
    rect(M, by, W - 2 * M, 34, fill=INK, stroke=GOLD, lw=1.5)
    ptxt = f"PRICE: {price}" if lp else 'CALL FOR PRICE'
    text(f"{ptxt}   •   {cfg['phone']}   •   {cfg['email']}", W / 2, by + 21, 'Helvetica-Bold', 11.5, GOLD, 'center')
    draw_footer(1)
    c.showPage()

    # ================= PAGE 2 =================
    draw_header()
    rect(M, 136, W - 2 * M, 1.8, fill=GOLD)
    short_bar = f"{title.upper()}  •  {(unit.get('category') or 'HEAVY EQUIPMENT').upper()}"
    text(short_bar, W / 2, 153, 'Helvetica-Bold', 13, INK, 'center')
    rect(M, 160, W - 2 * M, 1.8, fill=GOLD)

    mm = f"{unit.get('make') or ''} {unit.get('model') or ''}".strip().upper()
    heading(f"TECHNICAL SPECIFICATIONS — {mm}" if mm else 'TECHNICAL SPECIFICATIONS', M, 174, W - 2 * M)

    spec_rows = [
        ('Year / Model', f"{unit.get('year') or ''} {mm}".strip()),
        ('Hours', hours_txt or 'Call'),
        ('Category', unit.get('category') or 'Heavy Equipment'),
        ('Condition', 'Used'),
        ('Make / Model', f"{unit.get('make') or ''} {unit.get('model') or ''}".strip()),
        ('Engine', engine or 'OEM Standard'),
        ('Horsepower', hp_txt or 'OEM Standard'),
        ('Operating Weight', unit.get('weight') or oem.get('operatingWeight') or 'OEM Standard'),
        ('Transport Dimensions', unit.get('dimensions') or oem.get('dimensions') or 'Standard'),
        ('Hydraulics', unit.get('hydraulicFlow') or oem.get('hydraulics') or 'Standard'),
        ('Attachments', ', '.join(package[:3]) if package else 'Standard Setup'),
        ('Stock Number', str(unit.get('stock') or 'BAM')),
    ]
    half = (len(spec_rows) + 1) // 2
    box_h = half * 18 + 14
    rect(M, 198, W - 2 * M, box_h, fill=SPEC_BG, stroke=GOLD, lw=1.2)
    col_w = (W - 2 * M - 20) / 2
    for idx, (k, v) in enumerate(spec_rows):
        col = idx // half
        row = idx % half
        xx = M + 10 + col * (col_w + 10)
        yy = 214 + row * 18
        text(str(k), xx, yy, 'Helvetica-Bold', 8.5, INK)
        text(str(v)[:38], xx + col_w * 0.44, yy, 'Helvetica', 8.5, HexColor('#282828'))

    ny = 198 + box_h + 18
    heading('CONDITION & SERVICE NOTES', M, ny, cw)
    heading('BUYING FROM BAM', M + cw + 24, ny, cw)
    rect(M, ny + 22, cw, 86, fill=SPEC_BG, stroke=GOLD, lw=1.2)
    rect(M + cw + 24, ny + 22, cw, 86, fill=SPEC_BG, stroke=GOLD, lw=1.2)

    notes_txt = unit.get('serviceHistory') or 'Unit details are based on owner reports. Confirm hour meter, serial and a full inspection before deposit. BAM can arrange freight across the US & Mexico.'
    for i, ln in enumerate(simpleSplit(notes_txt, 'Helvetica', 8.3, cw - 16)[:5]):
        text(ln, M + 8, ny + 38 + i * 13, 'Helvetica', 8.3)

    why_rows = [
        ('Walk-around video', 'On request'),
        ('Transaction', 'Escrow-friendly, documented'),
        ('Freight', 'Arranged across the US & Mexico'),
        ('Family owned', 'Operating since 2012'),
    ]
    for i, (wk, wv) in enumerate(why_rows):
        text(wk, M + cw + 32, ny + 38 + i * 16, 'Helvetica-Bold', 8.3, INK)
        text(wv, M + cw + 32 + cw * 0.45, ny + 38 + i * 16, 'Helvetica', 8.3, HexColor('#282828'))

    # Canonical Page 2 CTA Box
    cta_y = H - 134
    rect(M, cta_y, W - 2 * M, 70, fill=INK, stroke=GOLD, lw=1.6)
    cta_head = f"READY TO WORK — {price}" if lp else "READY TO WORK — CALL FOR PRICE"
    text(cta_head, W / 2, cta_y + 19, 'Helvetica-Bold', 13.5, GOLD, 'center')
    text('Call or text for a walk-around video and inspection details.', W / 2, cta_y + 34, 'Helvetica', 9, white, 'center')
    text(cfg['phone'], W / 2, cta_y + 51, 'Helvetica-Bold', 15, white, 'center')
    text(f"{cfg['email']}   •   {cfg['web']}", W / 2, cta_y + 64, 'Helvetica', 8, HexColor('#D7D7D7'), 'center')

    disc = 'Specifications, hour meter readings and condition descriptions are based on owner and OEM reports and are not guaranteed. All units sold as-is, where-is, subject to prior sale.'
    for i, ln in enumerate(simpleSplit(disc, 'Helvetica', 6.5, W - 2 * M - 20)[:2]):
        text(ln, W / 2, H - 48 + i * 9, 'Helvetica', 6.5, HexColor('#696969'), 'center')

    draw_footer(2)
    c.showPage()
    c.save()
    return buf.getvalue()


if __name__ == '__main__':
    data = json.loads(sys.stdin.buffer.read().decode('utf-8'))
    sys.stdout.buffer.write(build(data['unit'], data['config'], data.get('photo'), data.get('buyer')))
