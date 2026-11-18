/**
 * กรอกข้อมูลลงไฟล์ Excel ต้นฉบับ (แบบฟอร์ม ISO) โดยไม่แตะรูปแบบเดิม
 *
 * เปิดไฟล์ .xlsx ต้นฉบับ (assets/forms/…) → เขียนค่าลงเซลล์ที่กำหนด (คงสไตล์ เส้นขอบ ฟอนต์ ความกว้าง
 * หัว/ท้ายกระดาษ โลโก้ ขอบกระดาษ และพื้นที่พิมพ์ไว้ทั้งหมด) → ดาวน์โหลด
 * รายการเกินหนึ่งหน้า → คัดลอกชีตต้นฉบับเป็นหน้า 2, 3, … ในไฟล์เดียวกัน
 *
 *   await fillXlsxTemplate('assets/forms/FM-PUR-006.xlsx', [{ name: 'BR202611001', cells: { D2: 'BR202611001' } }], 'ไฟล์.xlsx')
 */
import { loadScript } from './page-image.js';

const ZIP_LIB = 'assets/vendor/jszip.min.js';
/** ไม่เพิ่มรายการโฟลเดอร์ลงไฟล์ (ต้นฉบับไม่มี) */
const NOF = { createFolders: false };
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';

const colNum = (letters) => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const splitRef = (ref) => { const m = /^([A-Z]+)(\d+)$/.exec(ref); return { col: colNum(m[1]), row: +m[2] }; };
// อักขระควบคุมทำให้ Excel แจ้งว่าไฟล์เสีย
const safe = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** เขียนค่าลงเซลล์ ref ของชีต (Document) — เซลล์ที่มีอยู่แล้วคงสไตล์เดิม */
function setCell(doc, ref, value) {
  const sheetData = doc.getElementsByTagNameNS(NS, 'sheetData')[0];
  const { row, col } = splitRef(ref);
  let rowEl = [...sheetData.getElementsByTagNameNS(NS, 'row')].find((r) => +r.getAttribute('r') === row);
  if (!rowEl) {
    rowEl = doc.createElementNS(NS, 'row');
    rowEl.setAttribute('r', String(row));
    const after = [...sheetData.getElementsByTagNameNS(NS, 'row')].find((r) => +r.getAttribute('r') > row);
    sheetData.insertBefore(rowEl, after || null);
  }
  let c = [...rowEl.getElementsByTagNameNS(NS, 'c')].find((x) => x.getAttribute('r') === ref);
  if (!c) {
    c = doc.createElementNS(NS, 'c');
    c.setAttribute('r', ref);
    const after = [...rowEl.getElementsByTagNameNS(NS, 'c')].find((x) => splitRef(x.getAttribute('r')).col > col);
    rowEl.insertBefore(c, after || null);
  }
  while (c.firstChild) c.removeChild(c.firstChild);
  c.removeAttribute('t');
  if (value === null || value === undefined || value === '') return;
  if (typeof value === 'number' && isFinite(value)) {
    const v = doc.createElementNS(NS, 'v'); v.textContent = String(value); c.appendChild(v);
    return;
  }
  c.setAttribute('t', 'inlineStr');
  const is = doc.createElementNS(NS, 'is'); const t = doc.createElementNS(NS, 't');
  t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  t.textContent = safe(value);
  is.appendChild(t); c.appendChild(is);
}

const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const ser = (d) => { const x = new XMLSerializer().serializeToString(d); return x.startsWith('<?xml') ? x : DECL + x; };
/** ชื่อชีตที่ Excel รับได้ (ไม่เกิน 31 ตัว ไม่มี : \ / ? * [ ]) */
const sheetName = (s) => String(s || 'Sheet').replace(/[:\\/?*[\]]/g, '-').slice(0, 31);
const quoteName = (s) => (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(s) ? s : `'${s.replace(/'/g, "''")}'`);

/**
 * pages = [{ name?: ชื่อชีต, cells: { A1: ค่า } }] — หน้าแรกใช้ชีตต้นฉบับ หน้าถัดไปคัดลอกจากต้นฉบับ
 * คืน Blob ของไฟล์ (ถ้าส่ง fileName มาด้วยจะดาวน์โหลดให้ทันที)
 */
export async function fillXlsxTemplate(url, pages, fileName = '') {
  const JSZip = await loadScript(ZIP_LIB, 'JSZip');
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`โหลดแบบฟอร์มต้นฉบับไม่สำเร็จ (${url})`);
  const zip = await JSZip.loadAsync(await res.arrayBuffer());

  const wbPath = 'xl/workbook.xml';
  const wb = parse(await zip.file(wbPath).async('string'));
  const wbRels = parse(await zip.file('xl/_rels/workbook.xml.rels').async('string'));
  const types = parse(await zip.file('[Content_Types].xml').async('string'));
  const sheetEl = wb.getElementsByTagNameNS(NS, 'sheet')[0];
  const rid = sheetEl.getAttributeNS(NS_R, 'id') || sheetEl.getAttribute('r:id');
  const rel = [...wbRels.getElementsByTagNameNS(NS_PKG, 'Relationship')].find((r) => r.getAttribute('Id') === rid);
  const sheetPath = 'xl/' + rel.getAttribute('Target').replace(/^\/?xl\//, '');
  const sheetDir = sheetPath.replace(/[^/]+$/, '');
  const sheetFile = sheetPath.slice(sheetDir.length);
  const original = await zip.file(sheetPath).async('string');
  const origRels = zip.file(`${sheetDir}_rels/${sheetFile}.rels`) ? await zip.file(`${sheetDir}_rels/${sheetFile}.rels`).async('string') : '';
  const oldName = sheetEl.getAttribute('name');

  const names = []; const used = new Set();
  pages.forEach((p, i) => {
    let n = sheetName(p.name || (i ? `${oldName} (${i + 1})` : oldName));
    while (used.has(n.toLowerCase())) n = sheetName(`${n.slice(0, 27)} ${i + 1}`);
    used.add(n.toLowerCase()); names.push(n);
  });

  // ชื่อที่กำหนดไว้ (พื้นที่พิมพ์ ฯลฯ) อ้างชื่อชีตเดิม → เปลี่ยนเป็นชื่อใหม่ · คัดลอกให้ทุกหน้า
  const dn = wb.getElementsByTagNameNS(NS, 'definedNames')[0];
  const origDefs = dn ? [...dn.getElementsByTagNameNS(NS, 'definedName')].filter((d) => d.getAttribute('localSheetId') === '0') : [];
  const retarget = (txt, name) => txt.split(`'${oldName.replace(/'/g, "''")}'!`).join(`${quoteName(name)}!`)
    .split(`${oldName}!`).join(`${quoteName(name)}!`);
  origDefs.forEach((d) => { d.textContent = retarget(d.textContent, names[0]); });
  sheetEl.setAttribute('name', names[0]);

  let maxSheetId = Math.max(...[...wb.getElementsByTagNameNS(NS, 'sheet')].map((s) => +s.getAttribute('sheetId') || 0));
  let relN = [...wbRels.getElementsByTagNameNS(NS_PKG, 'Relationship')].length + 1;
  const sheetsEl = wb.getElementsByTagNameNS(NS, 'sheets')[0];

  for (let i = 0; i < pages.length; i++) {
    let path = sheetPath; let doc;
    if (i === 0) doc = parse(original);
    else {
      // หน้าถัดไป: คัดลอกชีตต้นฉบับ + ไฟล์ประกอบ (หัวกระดาษที่มีโลโก้ ค่าเครื่องพิมพ์)
      const n = i + 1;
      path = `${sheetDir}sheet${100 + n}.xml`;
      doc = parse(original);
      [...doc.getElementsByTagNameNS(NS, 'sheetView')].forEach((v) => v.removeAttribute('tabSelected'));
      if (origRels) {
        const r = parse(origRels);
        for (const x of [...r.getElementsByTagNameNS(NS_PKG, 'Relationship')]) {
          const tgt = x.getAttribute('Target');
          const from = (sheetDir + tgt).split('/').reduce((a, seg) => (seg === '..' ? a.slice(0, -1) : seg === '.' ? a : [...a, seg]), []).join('/');
          const ext = tgt.split('.').pop();
          const copyTo = from.replace(/(\d*)\.([a-z]+)$/i, `${100 + n}.$2`);
          // ไฟล์ vml อ้างรูปผ่าน rels ของตัวเอง → คัดลอก rels ด้วย
          // eslint-disable-next-line no-await-in-loop
          let body = await zip.file(from).async(ext === 'vml' ? 'string' : 'uint8array');
          // หัวกระดาษ (vml) ต้องมีเลขรูปไม่ซ้ำกับชีตอื่น ไม่งั้น Excel ขอซ่อมไฟล์
          if (ext === 'vml') body = body.replace(/(<o:idmap[^>]*data=")\d+(")/, `$1${n}$2`).replace(/_x0000_s1(\d{3})/g, (m, d) => `_x0000_s${n * 1024 + +d - 24}`);
          zip.file(copyTo, body, NOF);
          const vRels = from.replace(/([^/]+)$/, '_rels/$1.rels');
          // eslint-disable-next-line no-await-in-loop
          if (zip.file(vRels)) zip.file(copyTo.replace(/([^/]+)$/, '_rels/$1.rels'), await zip.file(vRels).async('string'), NOF);
          x.setAttribute('Target', tgt.replace(/[^/]+$/, copyTo.split('/').pop()));
        }
        zip.file(`${sheetDir}_rels/sheet${100 + n}.xml.rels`, ser(r), NOF);
      }
      const ov = types.createElementNS(types.documentElement.namespaceURI, 'Override');
      ov.setAttribute('PartName', '/' + path);
      ov.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');
      types.documentElement.appendChild(ov);
      const newRid = `rIdT${relN++}`;
      const wr = wbRels.createElementNS(NS_PKG, 'Relationship');
      wr.setAttribute('Id', newRid);
      wr.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet');
      wr.setAttribute('Target', path.replace(/^xl\//, ''));
      wbRels.documentElement.appendChild(wr);
      const s = wb.createElementNS(NS, 'sheet');
      s.setAttribute('name', names[i]);
      s.setAttribute('sheetId', String(++maxSheetId));
      s.setAttributeNS(NS_R, 'r:id', newRid);
      sheetsEl.appendChild(s);
      origDefs.forEach((d) => {
        const c = d.cloneNode(true);
        c.setAttribute('localSheetId', String(i));
        c.textContent = retarget(d.textContent, names[0]).split(`${quoteName(names[0])}!`).join(`${quoteName(names[i])}!`);
        dn.appendChild(c);
      });
    }
    Object.entries(pages[i].cells || {}).forEach(([ref, v]) => setCell(doc, ref, v));
    // หัว/ท้ายกระดาษคัดลอกจากต้นฉบับตรงตัว (ตัวอ่าน XML เปลี่ยนการขึ้นบรรทัด \r\n เป็น \n)
    const hf = /<headerFooter[\s\S]*?<\/headerFooter>/;
    const keepHF = (x) => (hf.test(original) ? x.replace(hf, () => original.match(hf)[0]) : x);
    zip.file(path, keepHF(ser(doc)), NOF);
  }
  zip.file(wbPath, ser(wb), NOF);
  zip.file('xl/_rels/workbook.xml.rels', ser(wbRels), NOF);
  zip.file('[Content_Types].xml', ser(types), NOF);
  // คำนวณสูตรใหม่ตอนเปิด (ถ้ามี) · ไม่ใช้ค่าที่จำไว้ในไฟล์ต้นฉบับ
  if (zip.file('xl/calcChain.xml')) zip.remove('xl/calcChain.xml');

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (fileName) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  return blob;
}
