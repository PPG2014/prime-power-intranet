/**
 * อ่านตารางจากไฟล์ Excel (.xlsx) ที่ผู้ใช้เลือก — ชีตแรก · ใช้ JSZip ที่มีในเว็บ (ไม่มีไลบรารีภายนอก)
 *
 *   const t = await readXlsxTable(file, { headerMatch: /รหัสเครื่อง/ });
 *   t.header = ['ลำดับ', 'วันที่รับเข้า', …] · t.rows = [[1, Date, 'MT-…', …], …]
 *
 * เซลล์วันที่ (รูปแบบวันที่ของ Excel) คืนเป็น Date · ตัวเลขคืนเป็น number · ที่เหลือเป็นข้อความ
 */
import { loadScript } from './page-image.js';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const colNum = (letters) => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
const tx = (el) => [...el.getElementsByTagNameNS(NS, 't')].map((t) => t.textContent).join('');
// รูปแบบตัวเลขในตัวของ Excel ที่เป็นวันที่
const BUILTIN_DATE = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
const serialDate = (n) => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000)); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };

export async function readXlsxTable(file, { headerMatch = null, maxCols = 40 } = {}) {
  const JSZip = await loadScript('assets/vendor/jszip.min.js', 'JSZip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const read = async (p) => (zip.file(p) ? zip.file(p).async('string') : '');

  const shared = (() => { const x = []; return x; })();
  const ss = await read('xl/sharedStrings.xml');
  if (ss) [...parse(ss).getElementsByTagNameNS(NS, 'si')].forEach((si) => shared.push(tx(si)));

  // สไตล์ที่เป็นวันที่
  const dateStyles = new Set();
  const st = await read('xl/styles.xml');
  if (st) {
    const d = parse(st);
    const custom = {};
    [...d.getElementsByTagNameNS(NS, 'numFmt')].forEach((n) => { custom[n.getAttribute('numFmtId')] = n.getAttribute('formatCode') || ''; });
    const xfs = d.getElementsByTagNameNS(NS, 'cellXfs')[0];
    if (xfs) [...xfs.getElementsByTagNameNS(NS, 'xf')].forEach((xf, i) => {
      const id = +xf.getAttribute('numFmtId');
      const code = custom[id] || '';
      if (BUILTIN_DATE.has(id) || (/[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, '')) && !/^[#0.,%]+$/.test(code))) dateStyles.add(i);
    });
  }

  // ชีตแรกตามลำดับในสมุดงาน
  const wb = parse(await read('xl/workbook.xml'));
  const rels = parse(await read('xl/_rels/workbook.xml.rels'));
  const first = wb.getElementsByTagNameNS(NS, 'sheet')[0];
  const rid = first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const rel = [...rels.getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid);
  const sheet = parse(await read('xl/' + rel.getAttribute('Target').replace(/^\/?xl\//, '')));

  const grid = [];
  [...sheet.getElementsByTagNameNS(NS, 'row')].forEach((row) => {
    const out = [];
    [...row.getElementsByTagNameNS(NS, 'c')].forEach((c) => {
      const m = /^([A-Z]+)/.exec(c.getAttribute('r') || '');
      const ci = m ? colNum(m[1]) - 1 : out.length;
      if (ci >= maxCols) return;
      const t = c.getAttribute('t');
      const vEl = c.getElementsByTagNameNS(NS, 'v')[0];
      let v = '';
      if (t === 's') v = shared[+(vEl && vEl.textContent)] ?? '';
      else if (t === 'inlineStr') v = tx(c);
      else if (t === 'str' || t === 'e') v = vEl ? vEl.textContent : '';
      else if (t === 'b') v = vEl ? vEl.textContent === '1' : '';
      else if (vEl) {
        const n = +vEl.textContent;
        v = dateStyles.has(+c.getAttribute('s')) && n > 59 ? serialDate(n) : n;
      }
      out[ci] = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v;
    });
    grid.push(Array.from({ length: out.length }, (_, i) => (out[i] === undefined ? '' : out[i])));
  });

  const hi = headerMatch ? grid.findIndex((r) => r.some((x) => headerMatch.test(String(x)))) : 0;
  if (hi < 0) throw new Error('ไม่พบแถวหัวตารางในไฟล์ — ตรวจว่าเป็นไฟล์ทะเบียนเครื่องมือ (มีคอลัมน์ "รหัสเครื่อง")');
  const header = grid[hi].map((x) => String(x || '').trim());
  const rows = grid.slice(hi + 1).filter((r) => r.some((x) => String(x ?? '').trim() !== ''))
    .map((r) => header.map((_, i) => (r[i] === undefined ? '' : r[i])));
  return { header, rows };
}
