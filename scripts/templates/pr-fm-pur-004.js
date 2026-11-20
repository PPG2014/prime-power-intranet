/**
 * แม่แบบเอกสาร FM-PUR-004 ใบขอสั่งซื้อ (PURCHASE REQUISITION) Rev.02
 *
 * วางทุกองค์ประกอบด้วยตำแหน่งเป็นมิลลิเมตรบนกระดาษ A4 ตามต้นฉบับ PDF
 * ข้อความตายตัวบนฟอร์ม (หัวข้อ ป้ายกำกับ ตำแหน่ง ท้ายกระดาษ) คงไว้ตามต้นฉบับทุกตัวอักษร
 * ข้อมูลจากคำขอจะถูกเติมลงช่องว่างเท่านั้น
 *
 * รายการเกิน 20 แถว จะขึ้นหน้าใหม่ด้วยฟอร์มเดิมทั้งใบ และเลขหน้ามุมขวาบนนับให้อัตโนมัติ
 *
 * รายละเอียด/REMARK ยาวเกินช่อง → ตัดขึ้นบรรทัดใหม่ภายในรายการเดียวกัน (ไม่ตัดทิ้งเป็น …)
 *   1 หน้ามี 20 บรรทัดเท่าเดิม รายการที่ยาว 3 บรรทัดใช้ 3 บรรทัด · ตารางสูงเท่าเดิม ช่องเหตุผล/ลายเซ็นไม่เลื่อน
 *   วัดความกว้างข้อความด้วยฟอนต์เดียวกับเอกสาร แล้วแบ่งบรรทัดตามคำภาษาไทย (Intl.Segmenter)
 */
import { esc } from '../core/dom.js';
import { projectText } from '../services/om.js';

export const PR_CODE = 'FM-PUR-004';
export const isPR = (code) => String(code || '').trim().toUpperCase() === PR_CODE;

const LOGO = 'assets/img/ppc-logo-2024.png';
const ROWS_PER_PAGE = 20;
const ROW_MM = 5.79;            // ความสูง 1 บรรทัดในตาราง (เท่าต้นฉบับ)
const DESC_MM = 99.6 - 2.4;     // ความกว้างที่พิมพ์ได้จริงของช่องรายละเอียด (หักขอบซ้าย-ขวา)
const REM_MM = 26.1 - 2.4;      // ช่อง REMARK
const MAX_LINES = 8;            // รายการเดียวยาวสุดกี่บรรทัด (เกินกว่านี้ตัดเป็น …)
const FONT = "14pt 'PR Digits', 'TH SarabunPSK', 'TH Sarabun PSK', 'TH Sarabun New', 'PPC Sarabun', sans-serif";

/** โหลดฟอนต์ของเอกสารก่อนวัดความกว้างข้อความ (เรียกก่อน renderPR) */
export async function prFontsReady() {
  try { await Promise.all([document.fonts.load("14pt 'PPC Sarabun'"), document.fonts.load("14pt 'PR Digits'", '0123456789')]); } catch (e) { /* ใช้ฟอนต์สำรอง */ }
}

let ctx2d = null;
const PX_PER_MM = 96 / 25.4;
/** ความกว้างข้อความเป็นมิลลิเมตร */
function textMm(s) {
  if (!ctx2d) { ctx2d = document.createElement('canvas').getContext('2d'); }
  ctx2d.font = FONT;
  return ctx2d.measureText(s).width / PX_PER_MM;
}

/** แบ่งข้อความเป็นบรรทัดให้พอดีความกว้าง (ตัดตามคำภาษาไทย/ช่องว่าง) */
export function wrapLines(text, widthMm, maxLines = MAX_LINES) {
  const out = [];
  String(text || '').split(/\r?\n/).forEach((para) => {
    const t = para.replace(/\s+/g, ' ').trim();
    if (!t) return;
    const segs = typeof Intl !== 'undefined' && Intl.Segmenter
      ? [...new Intl.Segmenter('th', { granularity: 'word' }).segment(t)].map((x) => x.segment)
      : t.split(/(\s+)/);
    // วงเล็บเปิด/เครื่องหมายคำพูดเปิด ให้ติดกับคำถัดไป (ไม่เหลือ "(" ค้างท้ายบรรทัด)
    for (let i = segs.length - 2; i >= 0; i--) if (/[(\[{“"']$/.test(segs[i]) && !/\s$/.test(segs[i])) { segs[i] += segs[i + 1]; segs.splice(i + 1, 1); }
    let line = '';
    const push = () => { if (line.trim()) out.push(line.trim()); line = ''; };
    segs.forEach((seg) => {
      if (textMm(line + seg) <= widthMm) { line += seg; return; }
      if (line.trim()) push();
      // คำเดียวยาวกว่าช่อง (เช่นรหัสสินค้ายาว ๆ) → ตัดทีละตัวอักษร
      let w = seg.replace(/^\s+/, '');
      while (textMm(w) > widthMm) {
        let n = w.length;
        while (n > 1 && textMm(w.slice(0, n)) > widthMm) n -= 1;
        out.push(w.slice(0, n)); w = w.slice(n);
      }
      line = w;
    });
    push();
  });
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/.{0,2}$/, '') + '…'; }
  return out;
}

const clean = (v) => (v && typeof v === 'object'
  ? String(v.LookupValue ?? v.Title ?? v.Value ?? '') : String(v ?? '')).trim();

/** วันที่แบบฟอร์มราชการ 14/07/2568 */
export function thaiNumDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return clean(v);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
}

/** ค่าที่เลือก "อื่น ๆ" ให้แสดงข้อความที่ผู้ขอระบุแทน */
const withOther = (main, other) => {
  const m = clean(main);
  return /^อื่น/.test(m) && clean(other) ? clean(other) : m;
};

/**
 * สร้างเอกสารทุกหน้า
 * @param {object} p
 *   values     คำตอบในฟอร์ม (FormData)
 *   requester  { name, dept, position }
 *   submitted  วันที่ส่งคำร้อง (ไม่ใช้บนฟอร์มแล้ว — วันที่ออก PR มาจาก values.pr_date)
 *   prNo       เลขที่ PR (ฝ่ายจัดซื้อกรอก เว้นว่างได้ · ปกติอ่านจาก values.pr_no)
 *   sign       { approver, reviewer, director, purchasing } แต่ละช่อง { name, sig }
 */
export function renderPR({ values = {}, requester = {}, submitted = '', prNo = '', sign = {} }) {
  const items = (Array.isArray(values.items) ? values.items : [])
    .filter((r) => r && Object.values(r).some((x) => String(x ?? '').trim()));
  // แต่ละรายการใช้กี่บรรทัด แล้วจัดลงหน้า หน้าละไม่เกิน 20 บรรทัด
  const laid = items.map((r, i) => {
    const desc = wrapLines(clean(r.detail), DESC_MM);
    const rem = wrapLines(clean(r.remark), REM_MM);
    return { r, no: i + 1, desc, rem, lines: Math.max(1, desc.length, rem.length) };
  });
  const pageItems = [[]];
  let used = 0;
  laid.forEach((it) => {
    if (used + it.lines > ROWS_PER_PAGE && pageItems[pageItems.length - 1].length) { pageItems.push([]); used = 0; }
    pageItems[pageItems.length - 1].push(it);
    used += it.lines;
  });
  const pages = pageItems.length;

  const left = [
    ['โครงการ', clean(projectText(values))],
    ['ประเภทงาน', withOther(values.work_type, values.work_type_other)],
    ['วันที่ต้องการใช้', thaiNumDate(values.need_date)],
    ['กรณีด่วนระบุเหตุผล', clean(values.urgent_reason)],
    ['หมวดหมู่อุปกรณ์', withOther(values.category, values.category_other)],
  ];
  const right = [
    ['PR No.', clean(prNo || values.pr_no)],
    ['วันที่ออก PR', thaiNumDate(values.pr_date)],   // ฝ่ายจัดซื้อกรอกพร้อมเลข PR
    ['ฝ่าย', clean(requester.dept)],
    ['ผู้ขอ', clean(requester.name)],
    ['เบอร์ติดต่อ', clean(values.phone)],
  ];

  /** เส้นประสำหรับเซ็น ถ้ามีรูปลายเซ็นจะวางทับบนเส้น */
  const signLine = (s, extraCls = '') => `<span class="pr-dots ${extraCls}">…................................${
    s && s.sig ? `<img class="pr-sig" data-photo="${esc(s.sig)}" alt="">` : ''}</span>`;
  const nameIn = (s) => (s && s.name ? esc(s.name) : '');

  const page = (p) => {
    const list = pageItems[p];
    const lines = (arr) => arr.map((l) => `<div class="pr-ln">${esc(l)}</div>`).join('');
    const rows = list.map((it) => `<tr style="height:${(ROW_MM * it.lines).toFixed(2)}mm">
        <td class="c-no">${lines([String(it.no)])}</td>
        <td class="c-desc">${lines(it.desc)}</td>
        <td class="c-qty">${lines([clean(it.r.qty)])}</td>
        <td class="c-unit">${lines([clean(it.r.unit)])}</td>
        <td class="c-rem">${lines(it.rem)}</td>
      </tr>`);
    // เติมแถวว่างให้ครบ 20 บรรทัด เลขรายการนับต่อจากรายการสุดท้าย (นับรวมทุกหน้า)
    const usedHere = list.reduce((a, it) => a + it.lines, 0);
    const startNo = items.length + 1;
    for (let i = 0; i < ROWS_PER_PAGE - usedHere; i++) {
      rows.push(`<tr><td class="c-no">${p === pages - 1 ? lines([String(startNo + i)]) : ''}</td><td class="c-desc"></td><td class="c-qty"></td><td class="c-unit"></td><td class="c-rem"></td></tr>`);
    }
    const body = rows.join('');

    return `
    <div class="pr-page">
      <img class="pr-logo" src="${LOGO}" alt="Prime Power Construction">
      <div class="pr-title1">ใบขอสั่งซื้อ</div>
      <div class="pr-title2">(PURCHASE REQUISITION)</div>
      <div class="pr-pageno">หน้า ${pages > 1 ? `${p + 1} / ${pages}` : '1 / 1'}</div>

      <table class="pr-box pr-left"><tbody>
        ${left.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}
      </tbody></table>

      <table class="pr-box pr-right"><tbody>
        ${right.map(([k, v], i) => `<tr class="${i === 0 ? 'first' : ''}"><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}
      </tbody></table>

      <table class="pr-items">
        <thead><tr>
          <th class="c-no">รายการที่<br><span>ITEM</span></th>
          <th class="c-desc">รายละเอียด<br><span>DESCRIPTION</span></th>
          <th class="c-qty">จำนวน<br><span>QTY</span></th>
          <th class="c-unit">หน่วย<br><span>UNIT</span></th>
          <th class="c-rem"><span>REMARK</span></th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>

      <div class="pr-reason-label">ระบุเหตุผล :</div>
      <div class="pr-reason-line l1"></div>
      <div class="pr-reason-line l2"></div>
      <div class="pr-reason-text">${esc(clean(values.reason))}</div>

      <!-- แถวลายเซ็นที่ 1 -->
      <div class="pr-sg a r1"><b>ผู้ขอสั่งซื้อ :</b> ${signLine(sign.requester)}</div>
      <div class="pr-sg a r1p">( <span class="pr-name">${nameIn(sign.requester)}</span> )</div>
      <div class="pr-sg a r1t pos-l">ตำแหน่ง :</div>
      <div class="pr-sg a r1t pos-v pos-wrap">${requester.position
        ? `<span class="pr-fill">${esc(requester.position)}</span>` : '…................................'}</div>

      <div class="pr-sg b r1"><b>ผู้อนุมัติ :</b> ${signLine(sign.approver)}</div>
      <div class="pr-sg b r1p">( <span class="pr-name">${nameIn(sign.approver)}</span> )</div>
      <div class="pr-sg b r1t pos-l">ตำแหน่ง :</div>
      <div class="pr-sg b r1t pos-v">ผู้จัดการฝ่าย/ผู้จัดการโครงการ</div>

      <div class="pr-sg c r1"><b>ฝ่ายจัดซื้อ</b></div>
      <div class="pr-sg c r1s">${signLine(sign.purchasing)}</div>
      <div class="pr-sg c r1p2">( <span class="pr-name">${nameIn(sign.purchasing)}</span> )</div>
      <div class="pr-sg c r1t2 pos-l">ตำแหน่ง : พนักงานจัดซื้อ/ผู้จัดการแผนก/ผู้จัดการฝ่าย</div>

      <!-- แถวลายเซ็นที่ 2 -->
      <div class="pr-sg a r2"><b>ผู้ทบทวน :</b> ${signLine(sign.reviewer)}</div>
      <div class="pr-sg a r2p">( <span class="pr-name">${nameIn(sign.reviewer)}</span> )</div>
      <div class="pr-sg a r2t pos-l">ตำแหน่ง :</div>
      <div class="pr-sg a r2t pos-v">วิศวกรบริหารโครงการประจำสำนักงาน</div>

      <div class="pr-sg b r2"><b>ผู้อนุมัติ :</b> ${signLine(sign.director)}${
        sign.director && sign.director.name && !sign.director.sig
          ? `<span class="pr-name pr-dir-name">${esc(sign.director.name)}</span>` : ''}</div>
      <div class="pr-sg b r2p pos-l">ตำแหน่ง :</div>
      <div class="pr-sg b r2p pos-v">ผู้อำนวยการโครงการ (*ถ้ามี)</div>

      <div class="pr-foot-l">Form Page 1 / 1</div>
      <div class="pr-foot-r">FM-PUR-004 Rev.02 (14/07/2568)</div>
    </div>`;
  };

  // lang="en": ฟอนต์ TH Sarabun จะเปลี่ยนเลขเป็นเลขไทยเองเมื่อหน้าเป็นภาษาไทย (OpenType locl) — ฟอร์มนี้ใช้เลขอารบิก
  return `<div class="pr-doc" lang="en">${Array.from({ length: pages }, (_, p) => page(p)).join('')}</div>`;
}

/**
 * จับคู่ลำดับอนุมัติในระบบเข้ากับช่องเซ็นบนฟอร์ม ตามชื่อลำดับ (StepName)
 *   มีคำว่า "ทบทวน" → ผู้ทบทวน · "ผู้อำนวยการ" → ผู้อนุมัติ (ผอ.)
 *   "จัดซื้อ" → ฝ่ายจัดซื้อ · ลำดับอื่นลำดับแรก → ผู้อนุมัติ (ผจก.ฝ่าย/โครงการ)
 * ใช้เฉพาะผู้ที่กด "อนุมัติ" ในรอบล่าสุดเท่านั้น
 */
export function mapSignatures(steps, log, sigOf) {
  const lastRound = log.map((l) => l.action).lastIndexOf('ยื่นใหม่');
  // ฝ่ายจัดซื้อลงนามตอนอัปเดตสถานะครั้งแรก (บรรทัดที่มีลายเซ็น)
  const acts = log.slice(lastRound + 1).filter((l) => l.action === 'อนุมัติ' || l.action === 'ปิดงาน'
    || (l.action === 'อัปเดตสถานะ' && l.sig));
  const slotOf = (name) => {
    const n = String(name || '');
    if (/ทบทวน/.test(n)) return 'reviewer';
    if (/ผู้อำนวยการ/.test(n)) return 'director';
    if (/จัดซื้อ/.test(n)) return 'purchasing';
    return 'approver';
  };
  // ชื่อขั้นบอกช่องได้ (ทบทวน/ผู้อำนวยการ/จัดซื้อ) · เส้นทางครบ 4 ขั้นที่ชื่อไม่บอกช่อง
  // ใช้ตามลำดับ: ผู้ทบทวน → ผู้อนุมัติ → ผู้อำนวยการ → ฝ่ายจัดซื้อ
  const ORDER = ['reviewer', 'approver', 'director', 'purchasing'];
  const named = (n) => /ทบทวน|ผู้อำนวยการ|จัดซื้อ/.test(String(n || ''));
  const taken = new Set(steps.filter((st) => named(st.StepName)).map((st) => slotOf(st.StepName)));
  const free = ORDER.filter((x) => !taken.has(x));
  const slotFor = new Map();
  steps.forEach((st) => {
    if (named(st.StepName)) slotFor.set(st, slotOf(st.StepName));
    else slotFor.set(st, steps.length >= 4 && free.length ? free.shift() : 'approver');
  });
  const out = {};
  steps.forEach((st) => {
    const slot = slotFor.get(st);
    if (out[slot]) return;                         // ช่องละคนเดียว ใช้ลำดับแรกที่ตรง
    const mine = acts.filter((a) => a.step === +st.StepOrder);
    const act = mine.filter((a) => a.action !== 'อัปเดตสถานะ').slice(-1)[0] || mine[0];
    // ลายเซ็นที่เซ็นตอนอนุมัติ (act.sig) มาก่อน ไม่มีค่อยใช้ลายเซ็นในทะเบียนบุคลากร
    if (act) out[slot] = { name: act.by, sig: act.sig || sigOf(act.by) };
  });
  return out;
}

/** อ่านคำตอบที่กรอกอยู่บนหน้าจอ (ใช้ตอนดาวน์โหลดแบบฟอร์มก่อนส่ง) */
export function readLiveValues(fields) {
  const out = {};
  fields.forEach((f) => {
    const el = document.getElementById('q_' + f.FieldKey);
    if (!el) return;
    if (f.FieldType === 'lineitems') {
      out[f.FieldKey] = [...el.querySelectorAll('.li-body tr')].map((tr) => {
        const row = {};
        tr.querySelectorAll('[data-k]').forEach((c) => { row[c.dataset.k] = c.value || ''; });
        return row;
      });
      return;
    }
    out[f.FieldKey] = (el.dataset && el.dataset.value) || el.value || '';
  });
  return out;
}

/** เปิดหน้าต่างแสดงเอกสาร พร้อมปุ่มพิมพ์ / บันทึกเป็น PDF */
export async function openPRWindow(html, title) {
  const { hydratePhotos } = await import('../services/photos.js');
  const win = document.getElementById('overlay-root');
  win.innerHTML = `
    <div class="mask" id="pr-mask">
      <div class="modal modal-wide pr-modal">
        <div class="modal-head">${esc(title)} <button id="pr-close">✕</button></div>
        <div class="modal-body">${html}</div>
        <div class="modal-foot">
          <span class="dim pr-tip">ตั้งหน้าต่างพิมพ์เป็น A4 · ขอบกระดาษ "ไม่มี/None" · ปิด Headers and footers</span>
          <button class="btn-mini" id="pr-cancel">ปิด</button>
          <button class="btn btn-primary" id="pr-print">พิมพ์ / บันทึกเป็น PDF</button>
        </div>
      </div>
    </div>`;
  hydratePhotos(win);   // รูปลายเซ็นจาก SharePoint ต้องแนบ token จึงโหลดได้
  const close = () => { win.innerHTML = ''; };
  document.getElementById('pr-close').onclick = close;
  document.getElementById('pr-cancel').onclick = close;
  // แจ้งผลทางกฎหมายของเอกสารอิเล็กทรอนิกส์ก่อนพิมพ์ทุกครั้ง
  document.getElementById('pr-print').onclick = async () => {
    const { printWithNotice } = await import('../components/eta-notice.js');
    printWithNotice('printing-pr');
  };
}
