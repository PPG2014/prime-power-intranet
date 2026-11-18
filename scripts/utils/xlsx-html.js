/**
 * แสดงไฟล์ Excel (แบบฟอร์ม ISO ที่กรอกข้อมูลแล้ว) เป็นหน้า A4 สำหรับพิมพ์ / บันทึกเป็น PDF
 *
 * อ่านจากไฟล์โดยตรง: ความกว้างคอลัมน์ ความสูงแถว ฟอนต์ สีพื้น เส้นขอบ การจัดวาง เซลล์ผสาน คอลัมน์ที่ซ่อน
 * พื้นที่พิมพ์ ขอบกระดาษ การย่อ/ขยาย จัดกึ่งกลาง และหัว/ท้ายกระดาษ (รวมโลโก้) — หน้าตาจึงตรงกับไฟล์ Excel
 * หนึ่งชีต = หนึ่งหน้า A4 (ย่อให้พอดีความกว้างกระดาษถ้าตารางกว้างเกิน)
 *
 *   const { html, dispose } = await xlsxToHtml(blob);
 */
import { loadScript } from './page-image.js';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PX_PT = 96 / 72;
const A4 = { w: 793.7, h: 1122.5 };   // px ที่ 96 dpi

const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
const kids = (el, tag) => (el ? [...el.getElementsByTagNameNS(NS, tag)] : []);
const kid = (el, tag) => kids(el, tag)[0] || null;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const colNum = (letters) => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const ref = (r) => { const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(r); return m ? { c: colNum(m[1]), r: +m[2] } : null; };
const resolve = (base, target) => (target.startsWith('/') ? target.slice(1)
  : (base.replace(/[^/]+$/, '') + target).split('/').reduce((a, s) => (s === '..' ? a.slice(0, -1) : s === '.' ? a : [...a, s]), []).join('/'));

/** ฟอนต์ไทยของแบบฟอร์ม: ใช้ TH SarabunPSK ในเครื่องก่อน ไม่มีใช้ PPC Sarabun (ปรับขนาดเท่ากัน · styles/pages/pr-form.css) */
const family = (name) => {
  const n = String(name || 'Calibri');
  if (/sarabun/i.test(n)) return "'TH SarabunPSK', 'TH Sarabun New', 'PPC Sarabun', sans-serif";
  if (/cordia|angsana|browallia/i.test(n)) return `'${n}', 'PPC Sarabun', sans-serif`;
  return `'${n}', ${/calibri/i.test(n) ? "'Carlito', " : ''}Arial, sans-serif`;
};

function themeColors(xml) {
  if (!xml) return [];
  const d = parse(xml);
  const s = d.getElementsByTagNameNS(NS_A, 'clrScheme')[0];
  if (!s) return [];
  return [...s.children].map((c) => {
    const v = c.firstElementChild;
    return v ? (v.getAttribute('val') || v.getAttribute('lastClr') || '000000') : '000000';
  });
}
const tint = (hex, t) => {
  if (!t) return hex;
  const n = parseInt(hex, 16); let r = (n >> 16) & 255; let g = (n >> 8) & 255; let b = n & 255;
  const f = (x) => Math.round(t < 0 ? x * (1 + t) : x + (255 - x) * t);
  r = f(r); g = f(g); b = f(b);
  return ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
};
function colorOf(el, theme) {
  if (!el) return '';
  const rgb = el.getAttribute('rgb');
  if (rgb) return '#' + rgb.slice(-6);
  const th = el.getAttribute('theme');
  if (th !== null && theme.length) {
    const map = [1, 0, 3, 2];   // Excel สลับ dk1/lt1 และ dk2/lt2
    const base = theme[map[+th] ?? +th] || '000000';
    return '#' + tint(base, +(el.getAttribute('tint') || 0));
  }
  return '';
}

const BORDER = { thin: '1px solid', medium: '2px solid', thick: '3px solid', dotted: '1px dotted', dashed: '1px dashed',
  hair: '1px solid', double: '3px double', mediumDashed: '2px dashed', dashDot: '1px dashed', mediumDashDot: '2px dashed', slantDashDot: '2px dashed', dashDotDot: '1px dotted' };

function readStyles(xml, theme) {
  const d = parse(xml);
  const fonts = kids(kid(d.documentElement, 'fonts'), 'font').map((f) => ({
    name: (kid(f, 'name') || {}).getAttribute?.('val') || 'Calibri',
    sz: +((kid(f, 'sz') || {}).getAttribute?.('val') || 11),
    b: !!kid(f, 'b') && (kid(f, 'b').getAttribute('val') || '1') !== '0',
    i: !!kid(f, 'i') && (kid(f, 'i').getAttribute('val') || '1') !== '0',
    u: !!kid(f, 'u'),
    color: colorOf(kid(f, 'color'), theme),
  }));
  const fills = kids(kid(d.documentElement, 'fills'), 'fill').map((f) => {
    const p = kid(f, 'patternFill');
    return p && p.getAttribute('patternType') === 'solid' ? colorOf(kid(p, 'fgColor'), theme) : '';
  });
  const borders = kids(kid(d.documentElement, 'borders'), 'border').map((b) => {
    const side = (n) => {
      const s = kid(b, n);
      const st = s && s.getAttribute('style');
      return st ? `${BORDER[st] || '1px solid'} ${colorOf(kid(s, 'color'), theme) || '#000'}` : '';
    };
    return { l: side('left'), r: side('right'), t: side('top'), b: side('bottom') };
  });
  const xfs = kids(kid(d.documentElement, 'cellXfs'), 'xf').map((x) => {
    const al = kid(x, 'alignment');
    return {
      font: fonts[+x.getAttribute('fontId') || 0] || fonts[0],
      fill: fills[+x.getAttribute('fillId') || 0] || '',
      border: borders[+x.getAttribute('borderId') || 0] || {},
      h: al ? al.getAttribute('horizontal') || '' : '',
      v: al ? al.getAttribute('vertical') || 'bottom' : 'bottom',
      wrap: !!al && al.getAttribute('wrapText') === '1',
      indent: al ? +(al.getAttribute('indent') || 0) : 0,
    };
  });
  return { fonts, xfs };
}

/** ข้อความหัว/ท้ายกระดาษของ Excel → HTML ซ้าย/กลาง/ขวา */
function headerParts(code, theme, imgs, page, pages) {
  const out = { L: '', C: '', R: '' };
  let sec = 'C'; let font = ''; let bold = false; let size = 0; let color = '';
  let buf = '';
  const flush = () => {
    if (!buf) return;
    const st = [font ? `font-family:${family(font)}` : '', bold ? 'font-weight:700' : '', size ? `font-size:${size}pt` : '', color ? `color:${color}` : ''].filter(Boolean).join(';');
    out[sec] += `<span style="${st}">${esc(buf).replace(/\r?\n/g, '<br>')}</span>`;
    buf = '';
  };
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch !== '&') { buf += ch; continue; }
    const n = code[i + 1];
    if (n === '&') { buf += '&'; i += 1; continue; }
    if ('LCR'.includes(n)) { flush(); sec = n; i += 1; continue; }
    if (n === '"') {
      flush();
      const end = code.indexOf('"', i + 2);
      const [f, style = ''] = code.slice(i + 2, end).split(',');
      font = f === '-' ? font : f; bold = /bold/i.test(style); i = end; continue;
    }
    if (/\d/.test(n)) { flush(); const m = /^\d+/.exec(code.slice(i + 1)); size = +m[0]; i += m[0].length; continue; }
    if (n === 'K') {
      flush();
      const hex = code.slice(i + 2, i + 8);
      if (/^[0-9A-Fa-f]{6}$/.test(hex)) { color = '#' + hex; i += 7; } else { i += 7; }
      continue;
    }
    if (n === 'G') { flush(); const img = imgs[sec]; if (img) out[sec] += `<img src="${img.url}" style="width:${img.w}px;height:${img.h}px" alt="">`; i += 1; continue; }
    if (n === 'P') { buf += String(page); i += 1; continue; }
    if (n === 'N') { buf += String(pages); i += 1; continue; }
    if (n === 'D') { buf += new Date().toLocaleDateString('th-TH'); i += 1; continue; }
    if (n === 'B') { flush(); bold = !bold; i += 1; continue; }
    i += 1;   // รหัสอื่น (ขีดเส้นใต้ ตัวเอียง ฯลฯ) ข้าม
  }
  flush();
  return out;
}

export async function xlsxToHtml(data) {
  const JSZip = await loadScript('assets/vendor/jszip.min.js', 'JSZip');
  const zip = await JSZip.loadAsync(data instanceof Blob ? await data.arrayBuffer() : data);
  const read = async (p) => (zip.file(p) ? zip.file(p).async('string') : '');
  const urls = [];

  const theme = themeColors(await read('xl/theme/theme1.xml'));
  const { xfs } = readStyles(await read('xl/styles.xml'), theme);
  const shared = [];
  const ss = await read('xl/sharedStrings.xml');
  if (ss) kids(parse(ss).documentElement, 'si').forEach((si) => shared.push(kids(si, 't').map((t) => t.textContent).join('')));

  const wb = parse(await read('xl/workbook.xml'));
  const wbRels = parse(await read('xl/_rels/workbook.xml.rels'));
  const relTarget = (rels, id) => [...rels.getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === id);
  const defs = kids(wb.documentElement, 'definedName');
  const sheets = kids(wb.documentElement, 'sheet');

  const pagesHtml = [];
  for (const [si, sh] of sheets.entries()) {
    if (sh.getAttribute('state') === 'hidden') continue;
    const rel = relTarget(wbRels, sh.getAttributeNS(NS_R, 'id') || sh.getAttribute('r:id'));
    const path = resolve('xl/workbook.xml', rel.getAttribute('Target'));
    // eslint-disable-next-line no-await-in-loop
    const doc = parse(await read(path));
    const root = doc.documentElement;
    // eslint-disable-next-line no-await-in-loop
    const relsXml = await read(path.replace(/([^/]+)$/, '_rels/$1.rels'));
    const rels = relsXml ? parse(relsXml) : null;

    // คอลัมน์
    const fmt = kid(root, 'sheetFormatPr');
    const defW = fmt && fmt.getAttribute('defaultColWidth') ? +fmt.getAttribute('defaultColWidth') : 8.43;
    const defH = fmt && fmt.getAttribute('defaultRowHeight') ? +fmt.getAttribute('defaultRowHeight') : 15;
    const colW = {}; const colHidden = {};
    kids(kid(root, 'cols'), 'col').forEach((c) => {
      for (let i = +c.getAttribute('min'); i <= Math.min(+c.getAttribute('max'), 200); i++) {
        if (c.getAttribute('width')) colW[i] = +c.getAttribute('width');
        if (c.getAttribute('hidden') === '1') colHidden[i] = true;
      }
    });
    const wpx = (w) => Math.round(w * 7 + 5);

    // เซลล์
    const cells = {}; const rowH = {}; const rowHidden = {};
    let maxR = 0; let maxC = 0;
    kids(kid(root, 'sheetData'), 'row').forEach((row) => {
      const r = +row.getAttribute('r');
      if (row.getAttribute('ht')) rowH[r] = +row.getAttribute('ht');
      if (row.getAttribute('hidden') === '1') rowHidden[r] = true;
      kids(row, 'c').forEach((c) => {
        const p = ref(c.getAttribute('r')); if (!p) return;
        const t = c.getAttribute('t'); const v = kid(c, 'v');
        let val = '';
        if (t === 's') val = shared[+(v && v.textContent)] ?? '';
        else if (t === 'inlineStr') val = kids(c, 't').map((x) => x.textContent).join('');
        else if (v) val = v.textContent;
        cells[`${p.r},${p.c}`] = { v: val, s: +(c.getAttribute('s') || 0), num: !t && v && !isNaN(+v.textContent) };
        if (val !== '') { maxR = Math.max(maxR, p.r); maxC = Math.max(maxC, p.c); }
      });
    });

    // พื้นที่พิมพ์
    const pa = defs.find((d) => d.getAttribute('name') === '_xlnm.Print_Area' && +d.getAttribute('localSheetId') === si);
    let area = { r1: 1, c1: 1, r2: Math.max(maxR, 1), c2: Math.max(maxC, 1) };
    if (pa) {
      const m = /!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)/.exec(pa.textContent);
      if (m) area = { c1: colNum(m[1]), r1: +m[2], c2: colNum(m[3]), r2: +m[4] };
    } else {
      // ไม่มีพื้นที่พิมพ์: ใช้ขอบเขตที่มีเส้นขอบ/ข้อมูล
      Object.entries(cells).forEach(([k, c]) => {
        const [r, cc] = k.split(',').map(Number); const x = xfs[c.s] || {};
        if (c.v !== '' || (x.border && (x.border.l || x.border.r || x.border.t || x.border.b)) || x.fill) {
          area.r2 = Math.max(area.r2, r); area.c2 = Math.max(area.c2, cc);
        }
      });
    }

    // เซลล์ผสาน
    const span = {}; const covered = new Set();
    kids(kid(root, 'mergeCells'), 'mergeCell').forEach((m) => {
      const [a, b] = m.getAttribute('ref').split(':').map(ref);
      if (!a || !b) return;
      span[`${a.r},${a.c}`] = { rs: b.r - a.r + 1, a, b };
      for (let r = a.r; r <= b.r; r++) for (let c = a.c; c <= b.c; c++) if (r !== a.r || c !== a.c) covered.add(`${r},${c}`);
    });

    const cols = []; for (let c = area.c1; c <= area.c2; c++) if (!colHidden[c]) cols.push(c);
    const rows = []; for (let r = area.r1; r <= area.r2; r++) if (!rowHidden[r]) rows.push(r);
    const widths = cols.map((c) => wpx(colW[c] ?? defW));
    const tableW = widths.reduce((a, b) => a + b, 0);

    const body = rows.map((r) => {
      const tds = cols.map((c) => {
        const key = `${r},${c}`;
        if (covered.has(key)) return '';
        const cell = cells[key] || { v: '', s: 0 };
        const x = xfs[cell.s] || xfs[0] || { font: {}, border: {} };
        const sp = span[key];
        let colspan = 1; let rowspan = 1; let bd = x.border || {};
        if (sp) {
          colspan = cols.filter((cc) => cc >= sp.a.c && cc <= sp.b.c).length;
          rowspan = rows.filter((rr) => rr >= sp.a.r && rr <= sp.b.r).length;
          // เส้นขอบของเซลล์ผสาน: ขวา/ล่างมาจากเซลล์มุมขวาล่าง
          const br = cells[`${sp.b.r},${sp.b.c}`]; const bx = br ? (xfs[br.s] || {}).border || {} : {};
          const tr = cells[`${sp.a.r},${sp.b.c}`]; const tx = tr ? (xfs[tr.s] || {}).border || {} : {};
          const bl = cells[`${sp.b.r},${sp.a.c}`]; const lx = bl ? (xfs[bl.s] || {}).border || {} : {};
          bd = { l: bd.l, t: bd.t, r: tx.r || bx.r || bd.r, b: lx.b || bx.b || bd.b };
        }
        const f = x.font || {};
        const h = x.h === 'centerContinuous' ? 'center' : x.h || (cell.num ? 'right' : 'left');
        const st = [
          `font-family:${family(f.name)}`, `font-size:${f.sz || 11}pt`, f.b ? 'font-weight:700' : '', f.i ? 'font-style:italic' : '',
          f.u ? 'text-decoration:underline' : '', f.color ? `color:${f.color}` : '', x.fill ? `background:${x.fill}` : '',
          `text-align:${h === 'general' ? 'left' : h}`, `vertical-align:${x.v === 'center' ? 'middle' : x.v === 'top' ? 'top' : 'bottom'}`,
          bd.l ? `border-left:${bd.l}` : '', bd.r ? `border-right:${bd.r}` : '', bd.t ? `border-top:${bd.t}` : '', bd.b ? `border-bottom:${bd.b}` : '',
          x.wrap ? 'white-space:pre-wrap;word-break:break-word' : 'white-space:pre', x.indent ? `padding-left:${x.indent * 9}px` : '',
        ].filter(Boolean).join(';');
        return `<td${colspan > 1 ? ` colspan="${colspan}"` : ''}${rowspan > 1 ? ` rowspan="${rowspan}"` : ''} style="${st}">${
          cell.v === '' ? '' : `<div class="xh-v${x.wrap ? ' w' : ''}${h === 'right' ? ' r' : h === 'center' ? ' c' : ''}">${esc(cell.v)}</div>`}</td>`;
      }).join('');
      return `<tr style="height:${((rowH[r] ?? defH) * PX_PT).toFixed(1)}px">${tds}</tr>`;
    }).join('');

    // กระดาษ
    const pm = kid(root, 'pageMargins');
    const mg = (k, d) => (pm && pm.getAttribute(k) ? +pm.getAttribute(k) : d) * 96;
    const M = { l: mg('left', 0.7), r: mg('right', 0.7), t: mg('top', 0.75), b: mg('bottom', 0.75), h: mg('header', 0.3), f: mg('footer', 0.3) };
    const ps = kid(root, 'pageSetup');
    const land = ps && ps.getAttribute('orientation') === 'landscape';
    const P = land ? { w: A4.h, h: A4.w } : A4;
    const availW = P.w - M.l - M.r; const availH = P.h - M.t - M.b;
    const tableH = rows.reduce((a, r) => a + (rowH[r] ?? defH) * PX_PT, 0);
    // การย่อตามที่ตั้งในไฟล์ (เช่น 80%) แล้วย่อเพิ่มถ้ายังเกินกระดาษ (หนึ่งชีต = หนึ่งหน้า)
    const scale = Math.min(ps && ps.getAttribute('scale') ? +ps.getAttribute('scale') / 100 : 1, availW / tableW, availH / tableH);
    const center = kid(root, 'printOptions') && kid(root, 'printOptions').getAttribute('horizontalCentered') === '1';

    // หัว/ท้ายกระดาษ + โลโก้ (&G)
    const imgs = {};
    const hfDraw = kid(root, 'legacyDrawingHF');
    if (hfDraw && rels) {
      const vr = relTarget(rels, hfDraw.getAttributeNS(NS_R, 'id') || hfDraw.getAttribute('r:id'));
      const vmlPath = resolve(path, vr.getAttribute('Target'));
      // eslint-disable-next-line no-await-in-loop
      const vml = await read(vmlPath);
      // eslint-disable-next-line no-await-in-loop
      const vRelsXml = await read(vmlPath.replace(/([^/]+)$/, '_rels/$1.rels'));
      const vRels = vRelsXml ? parse(vRelsXml) : null;
      for (const m of vml.matchAll(/<v:shape\b[^>]*id="([LCR])H"[^>]*style='([^']*)'[\s\S]*?o:relid="([^"]+)"/g)) {
        const w = /width:([\d.]+)pt/.exec(m[2]); const hh = /height:([\d.]+)pt/.exec(m[2]);
        const ir = vRels && relTarget(vRels, m[3]);
        if (!ir) continue;
        // eslint-disable-next-line no-await-in-loop
        const bin = await zip.file(resolve(vmlPath, ir.getAttribute('Target'))).async('blob');
        const url = URL.createObjectURL(bin); urls.push(url);
        imgs[m[1]] = { url, w: (w ? +w[1] : 100) * PX_PT, h: (hh ? +hh[1] : 30) * PX_PT };
      }
    }
    const hf = kid(root, 'headerFooter');
    const head = headerParts(hf ? (kid(hf, 'oddHeader') || {}).textContent || '' : '', theme, imgs, 1, 1);
    const foot = headerParts(hf ? (kid(hf, 'oddFooter') || {}).textContent || '' : '', theme, {}, 1, 1);
    const band = (o) => `<div class="xh-l">${o.L}</div><div class="xh-c">${o.C}</div><div class="xh-r">${o.R}</div>`;

    // หัว/ท้ายกระดาษย่อตามหน้าด้วย ยกเว้นตั้ง scaleWithDoc="0"
    const hfScale = hf && hf.getAttribute('scaleWithDoc') === '0' ? 1 : scale;
    pagesHtml.push(`<div class="xh-page${land ? ' land' : ''}" style="width:${P.w}px;height:${P.h}px;--xh-s:${hfScale.toFixed(4)}">
      <div class="xh-head" style="top:${M.h}px;left:${M.l}px;right:${M.r}px">${band(head)}</div>
      <div class="xh-body" style="top:${M.t}px;left:${M.l}px;width:${availW}px;height:${availH}px">
        <div class="xh-scale" style="width:${tableW}px;transform:scale(${scale.toFixed(4)});${center ? `margin-left:${Math.max(0, (availW - tableW * scale) / 2).toFixed(1)}px;` : ''}">
          <table class="xh-t" style="width:${tableW}px"><colgroup>${widths.map((w) => `<col style="width:${w}px">`).join('')}</colgroup>
          <tbody>${body}</tbody></table></div></div>
      <div class="xh-foot" style="bottom:${M.f}px;left:${M.l}px;right:${M.r}px">${band(foot)}</div>
    </div>`);
  }
  return {
    html: `<div class="xh-doc">${pagesHtml.join('')}</div>`,
    dispose: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  };
}
